// Todos os canais entre a interface e o processo principal, num lugar so.
//
// Estavam espalhados dentro de createWindow, o que os fazia serem registrados
// de novo a cada janela criada - e `ipcMain.handle` duas vezes no mesmo canal
// lanca excecao. Aqui sao registrados uma vez, na abertura.

import { app, ipcMain, shell } from 'electron';

import { ajustarSessoesDeAudio, listarProcessos, type OpcoesDeExclusao } from './audio';
import { atualizarMenu } from './tray';
import { janelaPrincipal } from './window';
import { responderEscolha } from './picker';
import * as hospedagem from './host';
import { instalarTunel, jaBaixado, type ProvedorDeTunel } from './host/tunnel';

function comAJanela(acao: (janela: Electron.BrowserWindow) => void): void {
  const janela = janelaPrincipal();
  if (janela && !janela.isDestroyed()) acao(janela);
}

export function registrarCanais(): void {
  // --------------------------------------------------------------- aplicativo

  ipcMain.handle('greenlabs:get-version', () => app.getVersion());

  ipcMain.on('greenlabs:toggle-autolaunch', (_evento, ligar: boolean) => {
    app.setLoginItemSettings({ openAtLogin: ligar, openAsHidden: true });
    atualizarMenu();
  });

  ipcMain.on('greenlabs:toggle-hardware-acceleration', (_evento, ligar: boolean) => {
    // So funciona ANTES do app ficar pronto. Chamar aqui vale para a proxima
    // abertura - e por isso a interface avisa que a mudanca pede reinicio.
    if (ligar) return;
    try {
      app.disableHardwareAcceleration();
    } catch {
      // Ja pronto; vale na proxima.
    }
  });

  ipcMain.on('greenlabs:open-external', (_evento, url: string) => {
    // So http(s): `shell.openExternal` abre qualquer esquema, inclusive `file:`
    // e coisas piores, e a URL vem da interface.
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });

  // ------------------------------------------------------------------- janela

  ipcMain.on('greenlabs:window-minimize', () => comAJanela((j) => j.minimize()));
  ipcMain.on('greenlabs:window-close', () => comAJanela((j) => j.close()));
  ipcMain.on('greenlabs:hide-to-tray', () => comAJanela((j) => j.hide()));
  ipcMain.on('greenlabs:toggle-fullscreen', () =>
    comAJanela((j) => j.setFullScreen(!j.isFullScreen())),
  );
  ipcMain.on('greenlabs:window-maximize-toggle', () =>
    comAJanela((j) => (j.isMaximized() ? j.unmaximize() : j.maximize())),
  );
  ipcMain.handle('greenlabs:window-is-maximized', () => janelaPrincipal()?.isMaximized() ?? false);

  // ------------------------------------------------------------------ captura

  ipcMain.on('greenlabs:pick-source-result', (_evento, id: string | null) =>
    responderEscolha(id || null),
  );
  ipcMain.on('greenlabs:pick-source-cancel', () => responderEscolha(null));

  ipcMain.on('greenlabs:start-audio-exclusion', (_evento, opcoes: OpcoesDeExclusao) =>
    ajustarSessoesDeAudio(true, opcoes),
  );
  ipcMain.on('greenlabs:stop-audio-exclusion', () => ajustarSessoesDeAudio(false));
  ipcMain.handle('greenlabs:get-running-processes', () => listarProcessos());

  // ---------------------------------------------------------------- hospedar

  ipcMain.handle('greenlabs:host-start', (_evento, opcoes: hospedagem.OpcoesDeHospedagem) =>
    hospedagem.iniciar(opcoes),
  );
  ipcMain.handle('greenlabs:host-stop', () => hospedagem.parar());
  ipcMain.handle('greenlabs:host-state', () => hospedagem.estadoAtual());

  ipcMain.handle('greenlabs:host-providers', () => {
    return {
      cloudflared: jaBaixado('cloudflared'),
      ngrok: jaBaixado('ngrok'),
      bundled: {
        cloudflared: jaBaixado('cloudflared'),
        ngrok: jaBaixado('ngrok'),
      },
    };
  });

  ipcMain.handle('greenlabs:tunnel-install', (evento, provedor: ProvedorDeTunel) =>
    instalarTunel(provedor, (pct) => {
      try {
        evento.sender.send('greenlabs:tunnel-install-progress', { provider: provedor, pct });
      } catch {
        // Janela fechada durante o download.
      }
    }),
  );
}
