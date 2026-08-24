import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';

// Radmin VPN and Hamachi hand out addresses in these ranges. They are the usual
// way people here play together without opening ports, so they get flagged.
const isVpnRange = (ip) => ip.startsWith('26.') || ip.startsWith('25.');

export function localAddresses() {
  const found = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const addr of addrs || []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        found.push({ name, address: addr.address, vpn: isVpnRange(addr.address) });
      }
    }
  }
  return found.sort((a, b) => Number(b.vpn) - Number(a.vpn));
}

function which(cmd) {
  return new Promise((resolve) => {
    let probe;
    try {
      probe = spawn(process.platform === 'win32' ? 'where' : 'which', [cmd]);
    } catch {
      resolve(false);
      return;
    }
    let hit = false;
    probe.stdout?.on('data', () => { hit = true; });
    probe.on('close', () => resolve(hit));
    probe.on('error', () => resolve(false));
  });
}

export async function detectProviders() {
  const [cloudflared, ngrok] = await Promise.all([which('cloudflared'), which('ngrok')]);
  return { cloudflared, ngrok };
}

export async function resolveProvider(requested) {
  const wanted = requested === 'cloudflare' ? 'cloudflared' : requested;
  if (wanted && wanted !== 'auto') {
    return (await which(wanted)) ? wanted : null;
  }
  const found = await detectProviders();
  if (found.cloudflared) return 'cloudflared';
  if (found.ngrok) return 'ngrok';
  return null;
}

// Both providers print the public URL to stdout/stderr, so scraping it there
// keeps this free of extra dependencies and local API polling.
export function startTunnel({ provider, port, onUrl, onError, onExit }) {
  const args = provider === 'cloudflared'
    ? ['tunnel', '--url', `http://localhost:${port}`]
    : ['http', String(port), '--log', 'stdout'];

  const pattern = provider === 'cloudflared'
    ? /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i
    : /https:\/\/[a-z0-9-]+\.ngrok[-a-z0-9.]*\.(app|io|dev)/i;

  let proc;
  try {
    proc = spawn(provider, args);
  } catch (err) {
    onError?.(err.message);
    return null;
  }

  let announced = false;
  const scan = (chunk) => {
    if (announced) return;
    const match = chunk.toString().match(pattern);
    if (!match) return;
    announced = true;
    onUrl?.(match[0].replace(/^https/, 'wss'));
  };

  proc.stdout?.on('data', scan);
  proc.stderr?.on('data', scan);
  proc.on('error', (err) => onError?.(err.message));
  proc.on('close', (code) => onExit?.(code));

  return proc;
}
