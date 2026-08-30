// O icone da bandeja e o menu dele.
//
// O app continua vivo com a janela fechada - e a bandeja e a unica forma de
// traze-lo de volta ou de sair de verdade.

import { app, Menu, nativeImage, Tray } from 'electron';

import { iconeDoAplicativo } from './paths';
import { mostrarJanela } from './window';

let bandeja: Tray | null = null;

/**
 * O icone em 16x16.
 *
 * Se a logo nao carregar, desenha um circulo verde em SVG: e melhor que um
 * icone vazio, que no Windows vira um retangulo em branco que ninguem
 * reconhece.
 */
function icone(): Electron.NativeImage {
  const logo = iconeDoAplicativo();
  if (!logo.isEmpty()) return logo.resize({ width: 16, height: 16 });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect width="32" height="32" rx="8" fill="#37ff94"/>
    <circle cx="16" cy="16" r="8" fill="#0b0e14"/>
    <circle cx="16" cy="16" r="4" fill="#37ff94"/>
  </svg>`;
  return nativeImage
    .createFromBuffer(Buffer.from(svg))
    .resize({ width: 16, height: 16 });
}

export function atualizarMenu(): void {
  if (!bandeja) return;

  const inicioAutomatico = app.getLoginItemSettings().openAtLogin;

  bandeja.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir GreenLabs', click: mostrarJanela },
      { label: 'Ativo em segundo plano', enabled: false },
      { type: 'separator' },
      {
        label: 'Iniciar com o Windows',
        type: 'checkbox',
        checked: inicioAutomatico,
        click: (item) => {
          app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true });
        },
      },
      { type: 'separator' },
      {
        label: 'Sair do GreenLabs',
        click: () => {
          // Sem esta marca o handler de `close` da janela esconderia de novo em
          // vez de deixar o app encerrar.
          app.isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
}

export function criarBandeja(): void {
  bandeja = new Tray(icone());
  bandeja.setToolTip('GreenLabs');
  bandeja.on('double-click', mostrarJanela);
  atualizarMenu();
}
