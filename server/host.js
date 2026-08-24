// Starts the signaling server and, when asked, exposes it through a tunnel so
// people outside the LAN can join without port forwarding.
//
//   node server/host.js                 -> LAN only
//   node server/host.js --tunnel        -> auto-detect cloudflared or ngrok
//   node server/host.js --tunnel=ngrok  -> force a provider
//   node server/host.js --port 25640
import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

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

function localAddresses() {
  const found = [];
  const nets = networkInterfaces();
  for (const [name, addrs] of Object.entries(nets)) {
    for (const addr of addrs || []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        found.push({ name, address: addr.address });
      }
    }
  }
  // Radmin VPN and Hamachi hand out addresses in these ranges; they are the
  // usual way people here play together without opening ports, so surface them
  // separately instead of burying them in the list.
  const vpnLike = (ip) => ip.startsWith('26.') || ip.startsWith('25.');
  return {
    vpn: found.filter((f) => vpnLike(f.address)),
    lan: found.filter((f) => !vpnLike(f.address)),
  };
}

function which(cmd) {
  return new Promise((resolve) => {
    const probe = spawn(process.platform === 'win32' ? 'where' : 'which', [cmd]);
    let hit = false;
    probe.stdout.on('data', () => { hit = true; });
    probe.on('close', () => resolve(hit));
    probe.on('error', () => resolve(false));
  });
}

async function pickTunnelProvider(requested) {
  if (requested && requested !== 'auto') {
    const ok = await which(requested === 'cloudflare' ? 'cloudflared' : requested);
    if (!ok) {
      console.error(`[host] "${requested}" nao encontrado no PATH.`);
      return null;
    }
    return requested === 'cloudflare' ? 'cloudflared' : requested;
  }
  if (await which('cloudflared')) return 'cloudflared';
  if (await which('ngrok')) return 'ngrok';
  return null;
}

// Both providers print the public URL to stdout/stderr; catching it there keeps
// this dependency-free instead of polling their local APIs.
function startTunnel(provider, port) {
  const args = provider === 'cloudflared'
    ? ['tunnel', '--url', `http://localhost:${port}`]
    : ['http', String(port), '--log', 'stdout'];

  const proc = spawn(provider, args);
  const urlPattern = provider === 'cloudflared'
    ? /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i
    : /https:\/\/[a-z0-9-]+\.ngrok[-a-z0-9.]*\.(app|io|dev)/i;

  let announced = false;
  const scan = (chunk) => {
    const text = chunk.toString();
    if (announced) return;
    const match = text.match(urlPattern);
    if (!match) return;
    announced = true;
    const wsUrl = match[0].replace(/^https/, 'wss');
    console.log('');
    console.log('  Tunnel ativo. Compartilhe este endereco:');
    console.log(`    ${wsUrl}`);
    console.log('');
    console.log('  Cole no campo "Servidor" do GreenLabs (com ou sem wss://).');
    console.log('');
  };

  proc.stdout.on('data', scan);
  proc.stderr.on('data', scan);
  proc.on('error', (err) => console.error(`[host] tunnel falhou: ${err.message}`));
  proc.on('close', (code) => {
    if (code !== 0) console.error(`[host] tunnel encerrou com codigo ${code}`);
  });

  return proc;
}

async function main() {
  const { port, tunnel } = parseArgs(process.argv.slice(2));

  const signaling = spawn(process.execPath, [path.join(here, 'signaling.js')], {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(port) },
  });

  const { vpn, lan } = localAddresses();
  console.log('');
  console.log('  Enderecos para quem esta na mesma rede:');
  for (const item of vpn) console.log(`    ws://${item.address}:${port}   (${item.name} - VPN)`);
  for (const item of lan) console.log(`    ws://${item.address}:${port}   (${item.name})`);
  if (!vpn.length && !lan.length) console.log('    nenhuma interface de rede encontrada');
  console.log('');

  let tunnelProc = null;
  if (tunnel) {
    const provider = await pickTunnelProvider(tunnel);
    if (provider) {
      console.log(`  Abrindo tunnel via ${provider}...`);
      tunnelProc = startTunnel(provider, port);
    } else {
      console.log('  Nenhum tunnel disponivel. Instale cloudflared ou ngrok,');
      console.log('  ou use Radmin VPN / Hamachi com os enderecos acima.');
      console.log('');
    }
  }

  const shutdown = () => {
    try { tunnelProc?.kill(); } catch {}
    try { signaling.kill(); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  signaling.on('close', shutdown);
}

main();
