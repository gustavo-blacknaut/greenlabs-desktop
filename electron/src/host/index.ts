// A aba Hospedar: sobe o servidor de sinalizacao na propria maquina.

import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import { BrowserWindow } from 'electron';

import { caminhos } from '../paths';
import { caminhoBaixado, jaBaixado, type ProvedorDeTunel } from './tunnel';

export interface EnderecoDaRede {
  address: string;
  name: string;
  vpn?: boolean;
}

export interface EstadoDeHospedagem {
  running: boolean;
  port: number;
  tunnel: ProvedorDeTunel | null;
  tunnelUrl: string | null;
  tunnelError: string | null;
  addresses: EnderecoDaRede[];
}

export interface OpcoesDeHospedagem {
  port: number;
  tunnel: boolean;
}

/** O modulo em Node do servidor, carregado sob demanda. Ver o comentario em `carregar`. */
interface ModuloDeTunel {
  localAddresses(): EnderecoDaRede[];
  resolveProvider(qual: string): Promise<ProvedorDeTunel | null>;
  startTunnel(opcoes: {
    provider: ProvedorDeTunel;
    command: string | null;
    port: number;
    onUrl(url: string): void;
    onError(mensagem: string): void;
    onExit(): void;
  }): ChildProcess;
}

interface ModuloDeSinalizacao {
  startSignaling(opcoes: {
    port: number;
    log(mensagem: string): void;
  }): Promise<{ close(): Promise<void> }>;
}

const estado: EstadoDeHospedagem = {
  running: false,
  port: 25640,
  tunnel: null,
  tunnelUrl: null,
  tunnelError: null,
  addresses: [],
};

let processoDoServidor: ChildProcess | null = null;
let servidorEmProcesso: { close(): Promise<void> } | null = null;
let processoDoTunel: ChildProcess | null = null;

export function estadoAtual(): EstadoDeHospedagem {
  return estado;
}

/**
 * Avisa a interface. Sem isto, ela mostraria um endereco que ja nao atende:
 * o tunel pode cair sozinho depois de ligado.
 */
function publicar(): void {
  for (const janela of BrowserWindow.getAllWindows()) {
    if (janela.isDestroyed()) continue;
    try {
      janela.webContents.send('greenlabs:host-state', estado);
    } catch {
      // Janela fechando no meio do envio.
    }
  }
}

/**
 * Carrega um modulo do servidor em Node.
 *
 * Continua sendo `import()` dinamico porque sao arquivos ESM que vivem fora do
 * asar - `require` nao os resolve, e um `import` estatico faria o processo
 * principal depender deles para subir, mesmo para quem nunca abre a aba.
 */
async function carregar<T>(nome: string): Promise<T> {
  const url = require('node:url').pathToFileURL(caminhos.moduloDoServidor(nome)).href as string;
  return (await import(url)) as T;
}

/**
 * Sobe o servidor em Go num processo separado.
 *
 * So resolve quando ele confirma que a porta abriu: sem esperar, o app
 * anunciaria os enderecos antes de existir alguem escutando neles.
 */
function subirServidorEmGo(porta: number): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(caminhos.sinalizacao)) {
      reject(new Error('binario nao encontrado'));
      return;
    }

    const processo = spawn(caminhos.sinalizacao, ['--port', String(porta)], {
      windowsHide: true,
    });

    let decidido = false;
    const prazo = setTimeout(() => encerrar(new Error('nao respondeu em 8s')), 8000);

    function encerrar(erro: Error): void {
      if (decidido) return;
      decidido = true;
      clearTimeout(prazo);
      try {
        processo.kill();
      } catch {
        // Ja morto.
      }
      reject(erro);
    }

    processo.stdout?.on('data', (bloco: Buffer) => {
      const texto = bloco.toString();
      process.stdout.write(`[host] ${texto}`);
      if (!decidido && texto.includes('rodando em')) {
        decidido = true;
        clearTimeout(prazo);
        resolve(processo);
      }
    });
    processo.stderr?.on('data', (bloco: Buffer) => process.stdout.write(`[host!] ${bloco}`));
    processo.on('error', encerrar);

    processo.on('exit', (codigo) => {
      encerrar(new Error(`encerrou com codigo ${codigo}`));

      // Morreu sozinho depois de estar no ar: a interface precisa saber, em vez
      // de continuar mostrando um endereco que nao atende mais.
      if (processoDoServidor === processo) {
        processoDoServidor = null;
        estado.running = false;
        estado.addresses = [];
        estado.tunnelUrl = null;
        publicar();
      }
    });
  });
}

export async function iniciar({ port, tunnel }: OpcoesDeHospedagem): Promise<EstadoDeHospedagem> {
  if (estado.running) return estado;

  const modulo = await carregar<ModuloDeTunel>('tunnel.js');
  const porta = Number(port) || 25640;

  // Preferencia e o servidor em Go, num processo separado: hospedar deixa de
  // dividir o event loop com a captura e a interface, entao uma sala cheia nao
  // engasga a janela. O de Node fica como reserva para quando o binario nao
  // estiver junto - build de outra plataforma, por exemplo.
  try {
    processoDoServidor = await subirServidorEmGo(porta);
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    console.log(`[host] servidor em Go indisponivel (${motivo}), usando o de Node`);
    const reserva = await carregar<ModuloDeSinalizacao>('signaling.js');
    servidorEmProcesso = await reserva.startSignaling({
      port: porta,
      log: (mensagem) => console.log('[host]', mensagem),
    });
  }

  estado.running = true;
  estado.port = porta;
  estado.addresses = modulo.localAddresses();
  estado.tunnel = null;
  estado.tunnelUrl = null;
  estado.tunnelError = null;
  publicar();

  if (!tunnel) return estado;

  // Primeiro o que ja existe no sistema; depois o que o proprio app baixou.
  let provedor = await modulo.resolveProvider('auto');
  let comando: string | null = null;

  if (!provedor) {
    for (const candidato of ['cloudflared', 'ngrok'] as const) {
      if (jaBaixado(candidato)) {
        provedor = candidato;
        comando = caminhoBaixado(candidato);
        break;
      }
    }
  }

  if (!provedor) {
    estado.tunnelError = 'cloudflared nao encontrado';
    publicar();
    return estado;
  }

  estado.tunnel = provedor;
  publicar();

  processoDoTunel = modulo.startTunnel({
    provider: provedor,
    command: comando,
    port: porta,
    onUrl: (url) => {
      estado.tunnelUrl = url;
      publicar();
    },
    onError: (mensagem) => {
      estado.tunnelError = mensagem;
      publicar();
    },
    onExit: () => {
      processoDoTunel = null;
      if (!estado.tunnelUrl) {
        estado.tunnelError = estado.tunnelError ?? 'o tunel encerrou';
      }
      publicar();
    },
  });

  return estado;
}

export async function parar(): Promise<EstadoDeHospedagem> {
  matarProcessos();

  if (servidorEmProcesso) {
    try {
      await servidorEmProcesso.close();
    } catch {
      // Ja fechado.
    }
    servidorEmProcesso = null;
  }

  estado.running = false;
  estado.tunnel = null;
  estado.tunnelUrl = null;
  estado.tunnelError = null;
  estado.addresses = [];
  publicar();
  return estado;
}

/** Mata os filhos sem esperar. Usado ao fechar o app, onde nao ha tempo de aguardar. */
export function matarProcessos(): void {
  for (const processo of [processoDoTunel, processoDoServidor]) {
    try {
      processo?.kill();
    } catch {
      // Ja morto.
    }
  }
  processoDoTunel = null;
  processoDoServidor = null;
}
