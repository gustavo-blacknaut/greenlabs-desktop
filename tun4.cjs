const fs = require('fs');
let s = fs.readFileSync('src/main.jsx', 'utf8');

// installTunnel passa a receber o provedor e o progresso vem por objeto
const a1 = [
  '  const installTunnel = async () => {',
  '    const api = window.greenlabsApp;',
  '    if (!api?.installTunnel) return;',
  '    setTunnelInstall(0);',
  '    api.onTunnelInstallProgress?.((pct) => setTunnelInstall(pct));',
  '    const res = await api.installTunnel();',
  '    if (res?.ok) {',
  '      setTunnelInstall(null);',
  '      api.getTunnelProviders?.().then(setTunnelProviders).catch(() => {});',
  '    } else {',
  "      setTunnelInstall(res?.error || 'falhou');",
  '    }',
  '  };'
].join('\n');
if (!s.includes(a1)) { console.error('installTunnel anchor'); process.exit(1); }
s = s.replace(a1, [
  '  const installTunnel = async (provider) => {',
  '    const api = window.greenlabsApp;',
  '    if (!api?.installTunnel) return;',
  '    setTunnelInstall({ provider, pct: 0 });',
  '    api.onTunnelInstallProgress?.((info) => {',
  "      const pct = typeof info === 'number' ? info : info?.pct;",
  '      setTunnelInstall({ provider, pct: pct ?? 0 });',
  '    });',
  '    const res = await api.installTunnel(provider);',
  '    if (res?.ok) {',
  '      setTunnelInstall(null);',
  '      api.getTunnelProviders?.().then(setTunnelProviders).catch(() => {});',
  '    } else {',
  "      setTunnelInstall({ provider, error: res?.error || 'falhou' });",
  '    }',
  '  };'
].join('\n'));

// bloco compacto com os dois provedores
const start = s.indexOf('                  <div className="tunnel-box">');
if (start === -1) { console.error('box start'); process.exit(1); }
const endNeedle = '                  </div>\n\n                  <button\n';
const end = s.indexOf(endNeedle, start);
if (end === -1) { console.error('box end'); process.exit(1); }

const ready = 'tunnelProviders && (tunnelProviders.cloudflared || tunnelProviders.ngrok)';

const box = [
  '                  <div className="tunnel-box">',
  '                    <div className="tunnel-row">',
  '                      <div className="tunnel-main">',
  '                        <RadioIcon size={14} />',
  '                        <span className="tunnel-label">Túnel</span>',
  '                        {tunnelProviders === null ? (',
  '                          <span className="tunnel-chip">…</span>',
  '                        ) : ' + ready + ' ? (',
  '                          <span className="tunnel-chip ok">',
  "                            {tunnelProviders.cloudflared ? 'cloudflared' : 'ngrok'}",
  '                          </span>',
  '                        ) : (',
  '                          <span className="tunnel-chip off">indisponível</span>',
  '                        )}',
  '                      </div>',
  '                    </div>',
  '',
  '                    <p className="tunnel-explain">',
  '                      {' + ready + '',
  "                        ? 'Cria um endereço público temporário, acessível de qualquer rede.'",
  "                        : 'Sem túnel, só entra quem está na sua rede ou no mesmo Radmin VPN.'}",
  '                    </p>',
  '',
  '                    {tunnelProviders && !(' + ready + ') && (',
  '                      <div className="tunnel-providers">',
  "                        {[{ id: 'cloudflared', label: 'cloudflared', note: 'sem conta' },",
  "                          { id: 'ngrok', label: 'ngrok', note: 'precisa de token' }].map((prov) => {",
  '                          const busy = tunnelInstall && tunnelInstall.provider === prov.id;',
  '                          return (',
  '                            <div className="tunnel-provider" key={prov.id}>',
  '                              <div className="tunnel-provider-text">',
  '                                <strong>{prov.label}</strong>',
  '                                <span>{prov.note}</span>',
  '                              </div>',
  '                              {busy && busy.error ? (',
  '                                <button className="ghost tunnel-install-btn" onClick={() => installTunnel(prov.id)}>repetir</button>',
  '                              ) : busy ? (',
  '                                <span className="tunnel-progress">{busy.pct}%</span>',
  '                              ) : (',
  '                                <button className="ghost tunnel-install-btn" onClick={() => installTunnel(prov.id)}>instalar</button>',
  '                              )}',
  '                            </div>',
  '                          );',
  '                        })}',
  '                      </div>',
  '                    )}',
  '',
  '                    {tunnelInstall && tunnelInstall.error && (',
  '                      <p className="tunnel-explain">Falhou: {tunnelInstall.error}</p>',
  '                    )}',
  '',
  '                    <div className="tunnel-flow">',
  '                      <div className="tunnel-flow-row">',
  '                        <span className="tunnel-flow-tag">local</span>',
  '                        <code>ws://SEU_IP:{hostPort || 25640}</code>',
  '                      </div>',
  '                      <div className="tunnel-flow-row">',
  '                        <span className="tunnel-flow-tag accent">túnel</span>',
  '                        <code>wss://…trycloudflare.com</code>',
  '                      </div>',
  '                    </div>',
  '                  </div>',
  ''
].join('\n');

s = s.slice(0, start) + box + s.slice(end + '                  </div>\n\n'.length);
fs.writeFileSync('src/main.jsx', s);
console.log('UI: cloudflared e ngrok instalaveis');
