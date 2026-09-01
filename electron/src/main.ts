// O processo principal: ciclo de vida e nada mais.
//
// Tudo que era logica foi para os modulos ao lado. Este arquivo decide a ordem
// das coisas na abertura e no fechamento, e e a unica coisa que ele deve fazer.

import { app, BrowserWindow, Menu, powerSaveBlocker } from 'electron';

import { devolverAudio, iniciarCapturaDeAudio, pararCapturaDeAudio } from './audio';
import { criarBandeja } from './tray';
import { matarProcessos } from './host';
import { registrarCanais } from './ipc';
import { criarJanela, mostrarJanela } from './window';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Electron {
    interface App {
      /**
       * Marca que o encerramento e de verdade.
       *
       * Sem ela o handler de `close` da janela esconderia na bandeja para
       * sempre, e "Sair" do menu nunca sairia.
       */
      isQuitting: boolean;
    }
  }
}

app.isQuitting = false;

// Segunda instancia nao abre outra janela: traz a que ja existe. Duas
// instancias brigariam pela porta da captura de audio.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setName('GreenLabs');
  app.on('second-instance', mostrarJanela);

  configurarChromium();

  void app.whenReady().then(() => {
    // A tela nao pode apagar no meio de uma transmissao.
    try {
      powerSaveBlocker.start('prevent-display-sleep');
    } catch {
      // Sem energia para gerenciar (algumas VMs). Nao impede nada.
    }

    // Menu nativo nao existe: a interface desenha o proprio cabecalho.
    Menu.setApplicationMenu(null);

    try {
      app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
    } catch {
      // Politica da maquina pode proibir. O app funciona sem iniciar sozinho.
    }

    iniciarCapturaDeAudio();
    registrarCanais();
    criarBandeja();
    criarJanela();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) criarJanela();
    });
  });

  app.on('before-quit', matarProcessos);

  app.on('window-all-closed', () => {
    pararCapturaDeAudio();
    // Nao deixar o Discord mudo se o app fechar no meio de uma transmissao.
    devolverAudio();
    if (process.platform !== 'darwin' && app.isQuitting) app.quit();
  });
}

/**
 * Ajustes do Chromium que precisam vir ANTES do app ficar pronto.
 *
 * Cada um resolve um problema concreto, e nenhum e enfeite - ver os
 * comentarios: sao os que fizeram diferenca medida em transmissao.
 */
function configurarChromium(): void {
  // O video comeca sozinho, sem clique. Sem isto o primeiro quadro fica
  // congelado esperando um gesto que ninguem vai dar.
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

  // Captura de audio sem reamostragem do Windows no caminho.
  app.commandLine.appendSwitch('enable-features', 'WASAPIRawAudioCapture');

  // A janela escondida continua transmitindo no mesmo ritmo. Sem os dois, o
  // Chromium reduz os temporizadores em segundo plano e a chamada engasga
  // assim que a pessoa troca de janela.
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');

  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');

  // Fora a moldura em volta do que esta sendo transmitido.
  //
  // No Windows o Chromium captura por Windows.Graphics.Capture, e o WGC desenha
  // uma borda colorida em volta da tela ou da janela capturada - o sistema
  // avisando "isto aqui esta sendo gravado". A intencao e boa e num navegador
  // faz sentido, mas aqui a moldura entra na propria imagem transmitida: quem
  // assiste ve a borda, e quem transmite ve a tela inteira contornada o tempo
  // todo.
  //
  // Desligado, o Chromium volta ao capturador anterior, que nao desenha nada. E
  // o mesmo caminho que o cliente nativo usa - Desktop Duplication direto.
  app.commandLine.appendSwitch(
    'disable-features',
    'WebRtcAllowWgcScreenCapturer,WebRtcAllowWgcWindowCapturer',
  );
}
