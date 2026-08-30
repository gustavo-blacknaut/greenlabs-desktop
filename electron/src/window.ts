// A janela principal.

import { app, BrowserWindow } from 'electron';
import path from 'node:path';

import { caminhos, emDesenvolvimento, iconeDoAplicativo } from './paths';
import { registrarEscolhaDeTela } from './picker';

let principal: BrowserWindow | null = null;

export function janelaPrincipal(): BrowserWindow | null {
  return principal;
}

/** Traz a janela para a frente, restaurando se estiver minimizada. */
export function mostrarJanela(): void {
  if (!principal || principal.isDestroyed()) return;
  if (principal.isMinimized()) principal.restore();
  principal.show();
  principal.focus();
}

export function criarJanela(): BrowserWindow {
  const janela = new BrowserWindow({
    width: 1320,
    height: 820,
    minWidth: 980,
    minHeight: 620,
    backgroundColor: '#0b0e14',
    title: 'GreenLabs',
    icon: iconeDoAplicativo(),

    // Sem moldura: a barra de titulo e desenhada pela propria interface, para
    // combinar com o resto. Ver o TitleBar do lado do React.
    frame: false,

    // Nasce escondida e aparece so quando tem o que mostrar: sem isto, a janela
    // pisca branca antes do primeiro quadro.
    show: false,

    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // A interface continua trabalhando em segundo plano: sem isto o Chromium
      // reduz os temporizadores da aba escondida e a chamada engasga.
      backgroundThrottling: false,
    },
  });

  principal = janela;
  janela.once('ready-to-show', () => janela.show());

  // A barra de titulo desenhada por nos precisa saber se esta maximizada para
  // trocar o icone do botao.
  const avisarEstado = (): void => {
    try {
      janela.webContents.send('greenlabs:window-state', janela.isMaximized());
    } catch {
      // Janela fechando.
    }
  };
  janela.on('maximize', avisarEstado);
  janela.on('unmaximize', avisarEstado);

  // Fechar esconde na bandeja em vez de encerrar: a chamada continua, e quem
  // quer sair de verdade usa o menu da bandeja.
  janela.on('close', (evento) => {
    if (!app.isQuitting) {
      evento.preventDefault();
      janela.hide();
    }
  });

  registrarEscolhaDeTela(janela);

  if (emDesenvolvimento) {
    void janela.loadURL('http://localhost:5173');
  } else {
    void janela.loadFile(caminhos.interface);
  }

  return janela;
}
