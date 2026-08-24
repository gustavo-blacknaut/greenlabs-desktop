// CLI para hospedar a sinalização fora do app.
//
//   node server/host.js                 -> só a rede local
//   node server/host.js --tunnel        -> detecta cloudflared ou ngrok
//   node server/host.js --tunnel=ngrok  -> força um provedor
//   node server/host.js --port 30000
import { startSignaling } from './signaling.js';
import { localAddresses, resolveProvider, startTunnel } from './tunnel.js';

function parseArgs(argv) {
  const out = { port: Number(process.env.PORT || 25640), tunnel: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--port') {
      out.port = Number(argv[i + 1]) || out.port;
      i += 1;
    } else if (arg.startsWith('--port=')) {
      out.port = Number(arg.slice(7)) || out.port;
    } else if (arg === '--tunnel') {
      out.tunnel = 'auto';
    } else if (arg.startsWith('--tunnel=')) {
      out.tunnel = arg.slice(9).toLowerCase();
    }
  }
  return out;
}

async function main() {
  const { port, tunnel } = parseArgs(process.argv.slice(2));

  await startSignaling({ port });

  const addresses = localAddresses();
  console.log('');
  console.log('  Enderecos para quem esta na mesma rede:');
  for (const item of addresses) {
    console.log(`    ws://${item.address}:${port}   (${item.name}${item.vpn ? ' - VPN' : ''})`);
  }
  if (!addresses.length) console.log('    nenhuma interface de rede encontrada');
  console.log('');

  let tunnelProc = null;
  if (tunnel) {
    const provider = await resolveProvider(tunnel);
    if (!provider) {
      console.log('  Nenhum tunnel disponivel. Instale cloudflared ou ngrok,');
      console.log('  ou use Radmin VPN / Hamachi com os enderecos acima.');
      console.log('');
    } else {
      console.log(`  Abrindo tunnel via ${provider}...`);
      tunnelProc = startTunnel({
        provider,
        port,
        onUrl: (url) => {
          console.log('');
          console.log('  Tunnel ativo. Compartilhe este endereco:');
          console.log(`    ${url}`);
          console.log('');
        },
        onError: (msg) => console.error(`[host] tunnel falhou: ${msg}`),
        onExit: (code) => {
          if (code !== 0) console.error(`[host] tunnel encerrou com codigo ${code}`);
        },
      });
    }
  }

  const shutdown = () => {
    try { tunnelProc?.kill(); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
