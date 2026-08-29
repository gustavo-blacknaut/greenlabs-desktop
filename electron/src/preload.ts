// A ponte entre a interface e o processo principal.
//
// O que aparece aqui e TUDO que a interface consegue fazer fora do navegador.
// Com contextIsolation ligado, nada mais atravessa - e e de proposito: a
// interface roda codigo que veio da rede, e dar a ela `require` seria dar a
// maquina inteira.
//
// O espelho disto do outro lado e src/types/bridge.ts. Mexeu aqui, mexe la:
// o compilador cobra do lado do React.

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('lightCall', {
  isElectron: true,
});

contextBridge.exposeInMainWorld('greenlabsPicker', {
  onPickSource: (cb: (fontes: unknown[]) => void) =>
    ipcRenderer.on('greenlabs:pick-source', (_evento, fontes: unknown[]) => cb(fontes)),
  chooseSource: (id: string) => ipcRenderer.send('greenlabs:pick-source-result', id),
  cancelPick: () => ipcRenderer.send('greenlabs:pick-source-cancel'),
});

contextBridge.exposeInMainWorld('greenlabsAudio', {
  startExclusion: (apps: unknown) => ipcRenderer.send('greenlabs:start-audio-exclusion', apps),
  stopExclusion: () => ipcRenderer.send('greenlabs:stop-audio-exclusion'),
});

contextBridge.exposeInMainWorld('greenlabsApp', {
  hideToTray: () => ipcRenderer.send('greenlabs:hide-to-tray'),
  toggleAutoLaunch: (ligar: boolean) => ipcRenderer.send('greenlabs:toggle-autolaunch', ligar),
  toggleHardwareAcceleration: (ligar: boolean) =>
    ipcRenderer.send('greenlabs:toggle-hardware-acceleration', ligar),
  getRunningProcesses: () => ipcRenderer.invoke('greenlabs:get-running-processes'),
  toggleFullscreen: () => ipcRenderer.send('greenlabs:toggle-fullscreen'),
  getWasapiAudioUrl: () => 'http://127.0.0.1:25641/audio/',
  getVersion: () => ipcRenderer.invoke('greenlabs:get-version'),

  minimizeWindow: () => ipcRenderer.send('greenlabs:window-minimize'),
  toggleMaximizeWindow: () => ipcRenderer.send('greenlabs:window-maximize-toggle'),
  closeWindow: () => ipcRenderer.send('greenlabs:window-close'),
  isMaximized: () => ipcRenderer.invoke('greenlabs:window-is-maximized'),
  onWindowStateChange: (cb: (maximizada: boolean) => void) =>
    ipcRenderer.on('greenlabs:window-state', (_evento, maximizada: boolean) => cb(maximizada)),

  startHost: (opcoes: unknown) => ipcRenderer.invoke('greenlabs:host-start', opcoes),
  stopHost: () => ipcRenderer.invoke('greenlabs:host-stop'),
  getHostState: () => ipcRenderer.invoke('greenlabs:host-state'),
  getTunnelProviders: () => ipcRenderer.invoke('greenlabs:host-providers'),
  installTunnel: (provedor: string) => ipcRenderer.invoke('greenlabs:tunnel-install', provedor),
  onTunnelInstallProgress: (cb: (info: unknown) => void) =>
    ipcRenderer.on('greenlabs:tunnel-install-progress', (_evento, info: unknown) => cb(info)),
  onHostState: (cb: (estado: unknown) => void) =>
    ipcRenderer.on('greenlabs:host-state', (_evento, estado: unknown) => cb(estado)),

  openExternal: (url: string) => ipcRenderer.send('greenlabs:open-external', url),
});
