const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lightCall', {
  isElectron: true,
});

contextBridge.exposeInMainWorld('greenlabsPicker', {
  onPickSource: (cb) => {
    ipcRenderer.on('greenlabs:pick-source', (_e, sources) => cb(sources));
  },
  chooseSource: (id) => ipcRenderer.send('greenlabs:pick-source-result', id),
  cancelPick: () => ipcRenderer.send('greenlabs:pick-source-cancel'),
});

contextBridge.exposeInMainWorld('greenlabsAudio', {
  setAudioExclusion: (apps) => ipcRenderer.invoke('greenlabs:set-audio-exclusion', apps),
  getAudioExclusion: () => ipcRenderer.invoke('greenlabs:get-audio-exclusion'),
});

contextBridge.exposeInMainWorld('greenlabsApp', {
  hideToTray: () => ipcRenderer.send('greenlabs:hide-to-tray'),
  toggleAutoLaunch: (enable) => ipcRenderer.send('greenlabs:toggle-autolaunch', enable),
  toggleHardwareAcceleration: (enable) => ipcRenderer.invoke('greenlabs:toggle-hardware-acceleration', enable),
  getHardwareAcceleration: () => ipcRenderer.invoke('greenlabs:get-hardware-acceleration'),
  restartApp: () => ipcRenderer.send('greenlabs:restart-app'),
  getRunningProcesses: () => ipcRenderer.invoke('greenlabs:get-running-processes'),
  toggleFullscreen: () => ipcRenderer.send('greenlabs:toggle-fullscreen'),
  getWasapiAudioUrl: () => 'http://127.0.0.1:25641/audio/',
  minimizeWindow: () => ipcRenderer.send('greenlabs:window-minimize'),
  toggleMaximizeWindow: () => ipcRenderer.send('greenlabs:window-maximize-toggle'),
  closeWindow: () => ipcRenderer.send('greenlabs:window-close'),
  isMaximized: () => ipcRenderer.invoke('greenlabs:window-is-maximized'),
  onWindowStateChange: (cb) => ipcRenderer.on('greenlabs:window-state', (_e, maximized) => cb(maximized)),
  startHost: (opts) => ipcRenderer.invoke('greenlabs:host-start', opts),
  stopHost: () => ipcRenderer.invoke('greenlabs:host-stop'),
  getHostState: () => ipcRenderer.invoke('greenlabs:host-state'),
  getTunnelProviders: () => ipcRenderer.invoke('greenlabs:host-providers'),
  installTunnel: (provider) => ipcRenderer.invoke('greenlabs:tunnel-install', provider),
  openExternal: (url) => ipcRenderer.send('greenlabs:open-external', url),
  onTunnelInstallProgress: (cb) => ipcRenderer.on('greenlabs:tunnel-install-progress', (_e, pct) => cb(pct)),
  onHostState: (cb) => ipcRenderer.on('greenlabs:host-state', (_e, state) => cb(state)),
});
