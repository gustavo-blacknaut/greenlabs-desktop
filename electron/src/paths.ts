// Onde as coisas ficam, com e sem empacotamento.
//
// Todo caminho do processo principal passa por aqui. Antes cada modulo montava
// o proprio `path.join(__dirname, ...)`, e o que quebrava so no app empacotado
// - onde `__dirname` aponta para dentro do asar - quebrava em cinco lugares
// diferentes, cada um do seu jeito.

import { app, nativeImage, type NativeImage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/** Verdadeiro rodando pelo `npm run app`, falso no aplicativo instalado. */
export const emDesenvolvimento = !app.isPackaged;

/**
 * A pasta do processo principal.
 *
 * Compilado, este arquivo vive em `electron/dist/`, e a raiz do projeto fica
 * um nivel acima do que `__dirname` sugere - por isso todos os caminhos abaixo
 * saem daqui, e nao de `__dirname` solto.
 */
const raizDoElectron = path.join(__dirname, '..');

/** Arquivos que o electron-builder deixa FORA do asar, para poderem ser executados. */
function foraDoAsar(...partes: string[]): string {
  return path.join(raizDoElectron, ...partes).replace('app.asar', 'app.asar.unpacked');
}

export const caminhos = {
  /** A interface compilada pelo Vite. */
  interface: path.join(raizDoElectron, '..', 'dist', 'index.html'),

  /** Captura de audio por processo, em modo exclusao. */
  audioCapture: foraDoAsar('AudioCapture.exe'),

  /** Servidor de sinalizacao em Go, para a aba Hospedar. */
  sinalizacao: foraDoAsar(
    process.platform === 'win32' ? 'greenlabs-signaling.exe' : 'greenlabs-signaling',
  ),

  /** Modulos do servidor em Node, usados como reserva. */
  moduloDoServidor: (nome: string): string =>
    path.join(raizDoElectron, '..', 'server', nome).replace('app.asar', 'app.asar.unpacked'),

  /** Onde o app guarda o que baixa - os binarios de tunel. */
  emDadosDoUsuario: (nome: string): string => path.join(app.getPath('userData'), nome),
} as const;

/**
 * O icone do aplicativo.
 *
 * Prefere a logo da raiz, que e a de alta resolucao; o `icon.png` ao lado e a
 * reserva de quem empacota sem ela.
 */
export function iconeDoAplicativo(): NativeImage {
  const daRaiz = path.join(raizDoElectron, '..', 'logo.png');
  if (fs.existsSync(daRaiz)) return nativeImage.createFromPath(daRaiz);
  return nativeImage.createFromPath(path.join(raizDoElectron, 'icon.png'));
}
