const { app, BrowserWindow, Menu, Tray, nativeImage, desktopCapturer, ipcMain, powerSaveBlocker, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { exec, execFile } = require('node:child_process');

const isDev = !app.isPackaged;
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

app.setName('GreenLabs');

let mainWin = null;
let tray = null;
let pickerResolve = null;
// Só a família do Discord: o modo EXCLUDE leva uma árvore por vez, e listar
// o próprio app faria o capturador excluir a si mesmo (o AudioCapture.cs
// também se protege disso, mas não custa não pedir).
let activeExcludedApps = ['discord', 'discordptb', 'discordcanary', 'discorddevelopment'];

app.isQuitting = false;

function getAppIcon() {
  const rootLogo = path.join(__dirname, '..', 'logo.png');
  if (fs.existsSync(rootLogo)) return nativeImage.createFromPath(rootLogo);
  return nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
}

function createTrayIcon() {
  const img = getAppIcon();
  if (img.isEmpty()) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#00e676"/>
      <circle cx="16" cy="16" r="8" fill="#080a10"/>
      <circle cx="16" cy="16" r="4" fill="#00e676"/>
    </svg>`;
    return nativeImage.createFromBuffer(Buffer.from(svg)).resize({ width: 16, height: 16 });
  }
  return img.resize({ width: 16, height: 16 });
}

function updateTrayMenu() {
  if (!tray) return;
  const loginSettings = app.getLoginItemSettings();
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir GreenLabs',
      click: () => {
        if (mainWin) {
          mainWin.show();
          mainWin.focus();
        }
      },
    },
    {
      label: 'Status: Ativo em segundo plano',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Iniciar com o Windows',
      type: 'checkbox',
      checked: loginSettings.openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true });
      },
    },
    { type: 'separator' },
    {
      label: 'Sair do GreenLabs',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
}

// O sistema antigo mutava os aplicativos no mixer do Windows. Foi removido:
// mutar o Discord tirava o som para a propria pessoa, que era justamente o
// contrario do objetivo. A exclusao real acontece no AudioCapture.exe, que
// captura por processo em modo exclude - o Discord continua tocando normal
// no PC e so nao entra na transmissao.

function getRunningProcessesList() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      return resolve([
        { name: 'discord', title: 'Discord' },
        { name: 'spotify', title: 'Spotify' },
        { name: 'chrome', title: 'Google Chrome' },
      ]);
    }

    const cmd = `powershell -ExecutionPolicy Bypass -Command "Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object ProcessName, MainWindowTitle | ConvertTo-Json"`;
    exec(cmd, (err, stdout) => {
      if (err || !stdout.trim()) {
        return resolve([
          { name: 'discord', title: 'Discord' },
          { name: 'spotify', title: 'Spotify' },
          { name: 'chrome', title: 'Google Chrome' },
        ]);
      }
      try {
        const parsed = JSON.parse(stdout);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        const unique = [];
        const seen = new Set();
        for (const item of list) {
          const name = String(item.ProcessName || '').trim();
          const title = String(item.MainWindowTitle || '').trim();
          if (name && title && !seen.has(name.toLowerCase())) {
            seen.add(name.toLowerCase());
            unique.push({ name: name.toLowerCase(), title });
          }
        }
        resolve(unique);
      } catch {
        resolve([
          { name: 'discord', title: 'Discord' },
          { name: 'spotify', title: 'Spotify' },
          { name: 'chrome', title: 'Google Chrome' },
        ]);
      }
    });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 820,
    minWidth: 980,
    minHeight: 620,
    backgroundColor: '#0b0e14',
    title: 'GreenLabs',
    icon: getAppIcon(),
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  mainWin = win;

  win.once('ready-to-show', () => win.show());

  const sendMaximized = () => {
    try { win.webContents.send('greenlabs:window-state', win.isMaximized()); } catch {}
  };
  win.on('maximize', sendMaximized);
  win.on('unmaximize', sendMaximized);

  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(['media', 'display-capture'].includes(permission));
  });

  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
      });

      if (!sources.length) {
        callback({});
        return;
      }

      const payload = sources.map((s) => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail.toDataURL(),
        displayId: s.display_id,
      }));

      const chosenId = await new Promise((resolve) => {
        pickerResolve = resolve;
        const t = setTimeout(() => {
          if (pickerResolve === resolve) {
            pickerResolve = null;
            resolve(null);
          }
        }, 60000);
        const origResolve = resolve;
        pickerResolve = (val) => {
          clearTimeout(t);
          pickerResolve = null;
          origResolve(val);
        };
        win.webContents.send('greenlabs:pick-source', payload);
      });

      if (!chosenId) {
        callback({});
        return;
      }
      const chosen = sources.find((s) => s.id === chosenId);
      if (!chosen) {
        callback({});
        return;
      }
      // Sem áudio aqui, de propósito: 'loopback' entrega o som do sistema
      // inteiro, Discord incluído - exatamente o que este app existe para
      // evitar. O áudio da transmissão vem do AudioCapture.exe, que captura
      // por processo em modo exclude.
      callback({ video: chosen, audio: undefined });
    } catch {
      callback({});
    }
  });

  ipcMain.on('greenlabs:pick-source-result', (_e, id) => {
    if (pickerResolve) pickerResolve(id || null);
  });
  ipcMain.on('greenlabs:pick-source-cancel', () => {
    if (pickerResolve) pickerResolve(null);
  });

  // Aplica a lista da tela de configuração no capturador de verdade.
  ipcMain.handle('greenlabs:set-audio-exclusion', (_e, apps) => {
    try {
      return { ok: true, apps: aplicarExclusaoDeAudio(apps) };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle('greenlabs:get-audio-exclusion', () => activeExcludedApps);

  ipcMain.handle('greenlabs:get-running-processes', async () => {
    return await getRunningProcessesList();
  });

  ipcMain.on('greenlabs:toggle-autolaunch', (_e, enable) => {
    app.setLoginItemSettings({ openAtLogin: enable, openAsHidden: true });
    updateTrayMenu();
  });

  ipcMain.on('greenlabs:toggle-hardware-acceleration', (_e, enable) => {
    if (!enable) {
      try { app.disableHardwareAcceleration(); } catch {}
    }
  });

  ipcMain.on('greenlabs:window-minimize', () => {
    if (mainWin) mainWin.minimize();
  });

  ipcMain.on('greenlabs:window-maximize-toggle', () => {
    if (!mainWin) return;
    if (mainWin.isMaximized()) mainWin.unmaximize();
    else mainWin.maximize();
  });

  // Closing keeps the existing behaviour of hiding to tray rather than quitting.
  ipcMain.on('greenlabs:window-close', () => {
    if (mainWin) mainWin.close();
  });

  ipcMain.handle('greenlabs:window-is-maximized', () => {
    return mainWin ? mainWin.isMaximized() : false;
  });

  ipcMain.handle('greenlabs:host-start', async (_e, opts) => {
    try {
      return await startHost(opts || {});
    } catch (err) {
      hostState.running = false;
      hostState.tunnelError = err.message;
      pushHostState();
      return { ...hostState, error: err.message };
    }
  });

  ipcMain.handle('greenlabs:host-stop', async () => stopHost());
  ipcMain.handle('greenlabs:host-state', () => hostState);
  ipcMain.on('greenlabs:open-external', (_e, url) => {
    // Só http(s): evita abrir esquemas arbitrários vindos do renderer.
    try {
      const parsed = new URL(String(url));
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        require('electron').shell.openExternal(parsed.href);
      }
    } catch {}
  });

  ipcMain.handle('greenlabs:host-providers', async () => {
    try {
      const { detectProviders } = await loadServerModule('tunnel.js');
      const found = await detectProviders();
      found.bundled = {};
      for (const key of Object.keys(TUNNEL_DOWNLOADS)) {
        const local = bundledBinPath(key);
        if (local && fs.existsSync(local)) {
          found[key] = true;
          found.bundled[key] = true;
        }
      }
      return found;
    } catch {
      return { cloudflared: false, ngrok: false };
    }
  });

  ipcMain.handle('greenlabs:tunnel-install', async (event, provider) => {
    const key = provider === 'ngrok' ? 'ngrok' : 'cloudflared';
    const entry = TUNNEL_DOWNLOADS[key];
    const dest = bundledBinPath(key);
    if (fs.existsSync(dest)) return { ok: true, alreadyInstalled: true, provider: key };
    try {
      const target = entry.zipped ? dest + '.zip' : dest;
      await downloadTo(entry.url, target, (pct) => {
        try { event.sender.send('greenlabs:tunnel-install-progress', { provider: key, pct }); } catch {}
      });
      if (entry.zipped) {
        await extractZip(target, app.getPath('userData'));
        try { fs.unlinkSync(target); } catch {}
        if (!fs.existsSync(dest)) throw new Error('ngrok.exe não encontrado no zip');
      }
      return { ok: true, provider: key };
    } catch (err) {
      return { ok: false, error: err.message, provider: key };
    }
  });

  ipcMain.on('greenlabs:hide-to-tray', () => {
    if (mainWin) mainWin.hide();
  });

  ipcMain.on('greenlabs:toggle-fullscreen', () => {
    if (mainWin) mainWin.setFullScreen(!mainWin.isFullScreen());
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer,AudioServiceOutOfProcess,WASAPIRawAudioCapture');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

app.on('second-instance', () => {
  if (mainWin) {
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.show();
    mainWin.focus();
  }
});

// Hospedagem embutida: o servidor de sinalização roda dentro do próprio
// processo principal, então não depende de node instalado nem de arquivos
// extraídos do asar. O túnel é um binário externo e continua sendo um filho.
const hostState = {
  running: false,
  port: 25640,
  tunnel: null,
  tunnelUrl: null,
  tunnelError: null,
  addresses: [],
};
let signalingInstance = null;
let tunnelProc = null;

// cloudflared é um único executável. Baixar sob demanda evita exigir winget ou
// instalação manual só para abrir um túnel.
const TUNNEL_DOWNLOADS = {
  cloudflared: {
    url: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe',
    file: 'cloudflared.exe',
    zipped: false,
  },
  ngrok: {
    url: 'https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip',
    file: 'ngrok.exe',
    zipped: true,
  },
};

function bundledBinPath(provider) {
  const entry = TUNNEL_DOWNLOADS[provider];
  if (!entry) return null;
  return path.join(app.getPath('userData'), entry.file);
}

function bundledCloudflaredPath() {
  return bundledBinPath('cloudflared');
}

// O ngrok vem em zip. Extrair sem dependência: a Expand-Archive do PowerShell
// já está em qualquer Windows suportado.
function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    const args = [
      '-NoProfile', '-Command',
      `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`,
    ];
    const proc = require('node:child_process').spawn('powershell', args);
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error('Expand-Archive saiu com ' + code))));
  });
}

function downloadTo(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const https = require('node:https');
    const get = (target, redirects = 0) => {
      if (redirects > 5) return reject(new Error('muitos redirecionamentos'));
      https.get(target, { headers: { 'User-Agent': 'GreenLabs' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return get(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error('HTTP ' + res.statusCode));
        }
        const total = Number(res.headers['content-length'] || 0);
        let done = 0;
        const tmp = dest + '.part';
        const file = fs.createWriteStream(tmp);
        res.on('data', (chunk) => {
          done += chunk.length;
          if (total) onProgress?.(Math.round((done / total) * 100));
        });
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            try {
              fs.renameSync(tmp, dest);
              resolve(dest);
            } catch (err) {
              reject(err);
            }
          });
        });
        file.on('error', reject);
      }).on('error', reject);
    };
    get(url);
  });
}

function pushHostState() {
  if (mainWin && !mainWin.isDestroyed()) {
    try { mainWin.webContents.send('greenlabs:host-state', hostState); } catch {}
  }
}

async function loadServerModule(name) {
  // No app empacotado os arquivos de server/ ficam em app.asar.unpacked, e é de
  // lá que o import() precisa carregar - ESM dentro do asar não resolve.
  const base = path.join(__dirname, '..', 'server').replace('app.asar', 'app.asar.unpacked');
  const url = require('node:url').pathToFileURL(path.join(base, name)).href;
  return import(url);
}

async function startHost({ port, tunnel }) {
  if (hostState.running) return hostState;

  const { startSignaling } = await loadServerModule('signaling.js');
  const { localAddresses, resolveProvider, startTunnel } = await loadServerModule('tunnel.js');

  const chosenPort = Number(port) || 25640;
  signalingInstance = await startSignaling({
    port: chosenPort,
    log: (msg) => console.log('[host]', msg),
  });

  hostState.running = true;
  hostState.port = chosenPort;
  hostState.addresses = localAddresses();
  hostState.tunnel = null;
  hostState.tunnelUrl = null;
  hostState.tunnelError = null;
  pushHostState();

  if (tunnel) {
    let provider = await resolveProvider('auto');
    let command = null;
    if (!provider) {
      for (const key of ['cloudflared', 'ngrok']) {
        const local = bundledBinPath(key);
        if (local && fs.existsSync(local)) {
          provider = key;
          command = local;
          break;
        }
      }
    }
    if (!provider) {
      hostState.tunnelError = 'cloudflared nao encontrado';
      pushHostState();
    } else {
      hostState.tunnel = provider;
      pushHostState();
      tunnelProc = startTunnel({
        provider,
        command,
        port: chosenPort,
        onUrl: (url) => { hostState.tunnelUrl = url; pushHostState(); },
        onError: (msg) => { hostState.tunnelError = msg; pushHostState(); },
        onExit: () => {
          tunnelProc = null;
          if (!hostState.tunnelUrl) hostState.tunnelError = hostState.tunnelError || 'tunnel encerrou';
          pushHostState();
        },
      });
    }
  }

  return hostState;
}

async function stopHost() {
  try { tunnelProc?.kill(); } catch {}
  tunnelProc = null;
  if (signalingInstance) {
    try { await signalingInstance.close(); } catch {}
    signalingInstance = null;
  }
  hostState.running = false;
  hostState.tunnel = null;
  hostState.tunnelUrl = null;
  hostState.tunnelError = null;
  hostState.addresses = [];
  pushHostState();
  return hostState;
}

let wasapiProc = null;

function stopWasapiServer() {
  if (!wasapiProc) return;
  try { wasapiProc.kill(); } catch {}
  wasapiProc = null;
}

function startWasapiServer() {
  if (process.platform !== 'win32') return;
  const exePath = path.join(__dirname, 'AudioCapture.exe');
  if (!fs.existsSync(exePath)) return;
  stopWasapiServer();

  // O modo EXCLUDE do WASAPI recebe uma árvore de processos por vez, então a
  // lista aqui vira o alvo da exclusão. Se a pessoa esvaziar tudo, cai no
  // Discord - que é o motivo de o app existir.
  const excludeArg = (activeExcludedApps.length ? activeExcludedApps : ['discord']).join(',');
  const args = ['--port=25641', '--exclude=' + excludeArg];
  wasapiProc = execFile(exePath, args, () => {});
  try {
    wasapiProc.stdout.on('data', (d) => process.stdout.write('[audio] ' + d));
    wasapiProc.stderr.on('data', (d) => process.stdout.write('[audio!] ' + d));
  } catch {}
}

/**
 * Reconfigura a exclusão de áudio. O AudioCapture.exe lê a lista uma vez, no
 * início, então mudar de ideia exige subir de novo - antes disso a tela de
 * configuração só gravava a lista e o capturador seguia com a de fábrica.
 */
function aplicarExclusaoDeAudio(apps) {
  const lista = (Array.isArray(apps) ? apps : String(apps || '').split(','))
    .map((s) => String(s).trim().toLowerCase())
    .filter(Boolean);
  activeExcludedApps = lista.length ? lista : ['discord'];
  startWasapiServer();
  return activeExcludedApps;
}

app.whenReady().then(() => {
  try {
    powerSaveBlocker.start('prevent-display-sleep');
  } catch {}
  Menu.setApplicationMenu(null);

  try {
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
  } catch {}

  startWasapiServer();

  tray = new Tray(createTrayIcon());
  tray.setToolTip('GreenLabs');
  tray.on('double-click', () => {
    if (mainWin) {
      mainWin.show();
      mainWin.focus();
    }
  });
  updateTrayMenu();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  try { tunnelProc?.kill(); } catch {}
});

app.on('window-all-closed', () => {
  try { wasapiProc?.kill(); } catch {}
  // Don't leave Discord muted if the app closes mid-share.

  if (process.platform !== 'darwin' && app.isQuitting) app.quit();
});
