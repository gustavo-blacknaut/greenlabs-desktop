// Os tuneis: descobrir, baixar e instalar.
//
// O cloudflared e um executavel unico e nao pede conta; o ngrok vem em zip e
// pede token. Baixar sob demanda evita exigir winget ou instalacao manual so
// para abrir um tunel.

import fs from 'node:fs';
import https from 'node:https';

import { caminhos } from '../paths';
import { descompactar } from '../powershell';

export type ProvedorDeTunel = 'cloudflared' | 'ngrok';

interface Origem {
  url: string;
  arquivo: string;
  compactado: boolean;
}

const ORIGENS: Record<ProvedorDeTunel, Origem> = {
  cloudflared: {
    url: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe',
    arquivo: 'cloudflared.exe',
    compactado: false,
  },
  ngrok: {
    url: 'https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip',
    arquivo: 'ngrok.exe',
    compactado: true,
  },
};

export interface ResultadoDeInstalacao {
  ok: boolean;
  provider: ProvedorDeTunel;
  alreadyInstalled?: boolean;
  error?: string;
}

/** Onde fica o binario que o proprio app baixou. */
export function caminhoBaixado(provedor: ProvedorDeTunel): string {
  return caminhos.emDadosDoUsuario(ORIGENS[provedor].arquivo);
}

export function jaBaixado(provedor: ProvedorDeTunel): boolean {
  return fs.existsSync(caminhoBaixado(provedor));
}

/**
 * Baixa um arquivo, seguindo redirecionamentos.
 *
 * Grava num `.part` e so renomeia no fim: interrompido no meio, o que fica no
 * disco e um arquivo temporario, e nao um executavel pela metade que a proxima
 * execucao tentaria rodar.
 */
function baixar(
  url: string,
  destino: string,
  aoProgredir?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const buscar = (alvo: string, saltos = 0): void => {
      if (saltos > 5) {
        reject(new Error('muitos redirecionamentos'));
        return;
      }

      https
        .get(alvo, { headers: { 'User-Agent': 'GreenLabs' } }, (resposta) => {
          const status = resposta.statusCode ?? 0;

          if (status >= 300 && status < 400 && resposta.headers.location) {
            resposta.resume();
            buscar(resposta.headers.location, saltos + 1);
            return;
          }
          if (status !== 200) {
            resposta.resume();
            reject(new Error(`HTTP ${status}`));
            return;
          }

          const total = Number(resposta.headers['content-length'] ?? 0);
          let recebido = 0;

          const temporario = `${destino}.part`;
          const arquivo = fs.createWriteStream(temporario);

          resposta.on('data', (pedaco: Buffer) => {
            recebido += pedaco.length;
            if (total) aoProgredir?.(Math.round((recebido / total) * 100));
          });
          resposta.pipe(arquivo);

          arquivo.on('error', reject);
          arquivo.on('finish', () => {
            arquivo.close(() => {
              try {
                fs.renameSync(temporario, destino);
                resolve();
              } catch (erro) {
                reject(erro instanceof Error ? erro : new Error(String(erro)));
              }
            });
          });
        })
        .on('error', reject);
    };

    buscar(url);
  });
}

export async function instalarTunel(
  provedor: ProvedorDeTunel,
  aoProgredir?: (pct: number) => void,
): Promise<ResultadoDeInstalacao> {
  const destino = caminhoBaixado(provedor);
  if (fs.existsSync(destino)) {
    return { ok: true, provider: provedor, alreadyInstalled: true };
  }

  const origem = ORIGENS[provedor];

  try {
    if (!origem.compactado) {
      await baixar(origem.url, destino, aoProgredir);
      return { ok: true, provider: provedor };
    }

    const zip = `${destino}.zip`;
    await baixar(origem.url, zip, aoProgredir);
    await descompactar(zip, caminhos.emDadosDoUsuario(''));
    try {
      fs.unlinkSync(zip);
    } catch {
      // Zip ja apagado, ou em uso. Ocupa espaco, nao atrapalha.
    }

    if (!fs.existsSync(destino)) {
      throw new Error(`${origem.arquivo} nao encontrado dentro do zip`);
    }
    return { ok: true, provider: provedor };
  } catch (erro) {
    return {
      ok: false,
      provider: provedor,
      error: erro instanceof Error ? erro.message : String(erro),
    };
  }
}
