// Chamadas ao PowerShell, num lugar so.
//
// Tres coisas dependem dele no Windows: silenciar sessoes de audio, listar os
// programas abertos e descompactar o zip do ngrok. Estavam espalhadas, cada
// uma montando a linha de comando do seu jeito e nenhuma escapando o que
// interpolava.

import { execFile, spawn } from 'node:child_process';

/**
 * Escapa um texto para dentro de aspas simples do PowerShell.
 *
 * La dentro, a unica coisa que precisa de escape e a propria aspa simples, e a
 * forma de escapar e duplica-la. Sem isto, um caminho com aspa no nome fecharia
 * a string e o resto viraria comando.
 */
export function comAspas(texto: string): string {
  return `'${texto.replace(/'/g, "''")}'`;
}

/**
 * Roda um comando e devolve a saida. Nunca lanca: quem chama trata a string
 * vazia como "nao deu".
 *
 * `execFile` com os argumentos em lista, e nao `exec` com uma linha montada a
 * mao: assim nada do que passa por aqui pode virar um comando extra.
 */
export function rodar(comando: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', comando],
      { windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (erro, saida) => resolve(erro ? '' : saida),
    );
  });
}

/** Roda um arquivo .ps1 com argumentos nomeados. */
export function rodarArquivo(caminho: string, argumentos: string[]): void {
  execFile(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', caminho, ...argumentos],
    { windowsHide: true },
    () => {
      // A saida deste nao interessa a ninguem: o efeito e no sistema, nao no
      // retorno.
    },
  );
}

/** Descompacta um zip usando o que ja existe em qualquer Windows suportado. */
export function descompactar(zip: string, destino: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const processo = spawn(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath ${comAspas(zip)} -DestinationPath ${comAspas(destino)} -Force`,
      ],
      { windowsHide: true },
    );
    processo.on('error', reject);
    processo.on('close', (codigo) =>
      codigo === 0 ? resolve() : reject(new Error(`Expand-Archive saiu com ${codigo}`)),
    );
  });
}
