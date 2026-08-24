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
let activeExcludedApps = ['discord', 'discordptb', 'discordcanary', 'discorddevelopment', 'electron', 'greenlabs'];

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

let activeAudioMode = 'blacklist';

function manageCustomAudioSessions(mute, rawOptions) {
  if (process.platform !== 'win32') return;
  const scriptPath = path.join(__dirname, 'mute-audio.ps1');
  if (!fs.existsSync(scriptPath)) return;

  // Only refresh targets when starting: stopping must unmute the same set.
  if (mute && rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions)) {
    if (rawOptions.mode) activeAudioMode = rawOptions.mode;
    const appsRaw = rawOptions.apps;
    if (typeof appsRaw === 'string') {
      const parsed = appsRaw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (parsed.length) activeExcludedApps = parsed;
    } else if (Array.isArray(appsRaw) && appsRaw.length) {
      activeExcludedApps = appsRaw;
    }
  }

  // No spaces/quotes around the comma list: passed as one token, and
  // mute-audio.ps1 splits it itself (see its own -join/-split normalization).
  const keywordsArg = activeExcludedApps.join(',');
  const cmd = `powershell -ExecutionPolicy Bypass -File "${scriptPath}" -MuteStr ${mute ? 'true' : 'false'} -FilterMode ${activeAudioMode} -Keywords ${keywordsArg}`;
  exec(cmd, (err, stdout, stderr) => {
    const logPath = path.join(__dirname, 'mute-audio-debug.log');
    const entry = `\n[${new Date().toISOString()}]\n${stdout || ''}${stderr ? '\nSTDERR: ' + stderr : ''}${err ? '\nERROR: ' + err.message : ''}\n`;
    try { fs.appendFileSync(logPath, entry); } catch {}
  });
}

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
      callback({ video: chosen, audio: 'loopback' });
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

  ipcMain.on('greenlabs:start-audio-exclusion', (_e, apps) => {
    manageCustomAudioSessions(true, apps);
  });

  ipcMain.on('greenlabs:stop-audio-exclusion', () => {
    manageCustomAudioSessions(false, activeExcludedApps);
  });

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

let wasapiProc = null;

function startWasapiServer() {
  if (process.platform !== 'win32') return;
  const exePath = path.join(__dirname, 'AudioCapture.exe');
  if (!fs.existsSync(exePath)) return;
  // Only the Discord family: EXCLUDE takes one process tree, and listing this
  // app too would exclude it instead of Discord.
  const captureExcludes = activeExcludedApps.filter((n) => n.includes('discord'));
  const excludeArg = (captureExcludes.length ? captureExcludes : ['discord']).join(',');
  const args = ['--port=25641', '--exclude=' + excludeArg];
  wasapiProc = execFile(exePath, args, () => {});
  try {
    wasapiProc.stdout.on('data', (d) => process.stdout.write('[audio] ' + d));
    wasapiProc.stderr.on('data', (d) => process.stdout.write('[audio!] ' + d));
  } catch {}
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

app.on('window-all-closed', () => {
  try { wasapiProc?.kill(); } catch {}
  // Don't leave Discord muted if the app closes mid-share.
  try { manageCustomAudioSessions(false, activeExcludedApps); } catch {}
  if (process.platform !== 'darwin' && app.isQuitting) app.quit();
});
