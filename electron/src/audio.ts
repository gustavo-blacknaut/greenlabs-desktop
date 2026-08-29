// Audio: a captura por processo e a lista de programas abertos.

import { execFile, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { caminhos } from './paths';
import { rodar, rodarArquivo } from './powershell';

export interface ProcessoEmExecucao {
  name: string;
  title: string;
}

export type ModoDeFiltro = 'blacklist' | 'whitelist';

export interface OpcoesDeExclusao {
  mode?: ModoDeFiltro;
  apps?: string | string[];
}

/**
 * Quem fica de fora da captura por padrao.
 *
 * O `greenlabs` esta na lista de proposito: sem ele, o app captura o proprio
 * som de saida e devolve para a chamada, o que vira eco de quem ja esta
 * falando.
 */
const EXCLUIDOS_PADRAO = [
  'discord',
  'discordptb',
  'discordcanary',
  'discorddevelopment',
  'greenlabs',
];

/** Usados quando o PowerShell nao responde - a interface prefere algo a nada. */
const CONHECIDOS: ProcessoEmExecucao[] = [
  { name: 'discord', title: 'Discord' },
  { name: 'spotify', title: 'Spotify' },
  { name: 'chrome', title: 'Google Chrome' },
];

let excluidos = [...EXCLUIDOS_PADRAO];
let modo: ModoDeFiltro = 'blacklist';
let capturaDeAudio: ChildProcess | null = null;

/**
 * Liga ou desliga o silenciamento das sessoes escolhidas.
 *
 * A lista so e atualizada ao LIGAR: desligar precisa devolver o som ao mesmo
 * conjunto que silenciou, e nao a um conjunto novo que a interface tenha
 * mandado nesse meio tempo.
 */
export function ajustarSessoesDeAudio(silenciar: boolean, opcoes?: OpcoesDeExclusao): void {
  if (process.platform !== 'win32') return;

  const script = path.join(__dirname, '..', 'mute-audio.ps1');
  if (!fs.existsSync(script)) return;

  if (silenciar && opcoes) {
    if (opcoes.mode) modo = opcoes.mode;
    const lista =
      typeof opcoes.apps === 'string'
        ? opcoes.apps
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
        : opcoes.apps;
    if (lista?.length) excluidos = lista;
  }

  rodarArquivo(script, [
    '-MuteStr',
    silenciar ? 'true' : 'false',
    '-FilterMode',
    modo,
    '-Keywords',
    excluidos.join(','),
  ]);
}

/** Devolve o som a todo mundo. Chamado ao fechar o app. */
export function devolverAudio(): void {
  ajustarSessoesDeAudio(false);
}

/**
 * Sobe o AudioCapture.exe, que serve o PCM sem o Discord por HTTP local.
 *
 * So a familia do Discord entra na exclusao: o EXCLUDE do WASAPI aceita UMA
 * arvore de processos, e listar o proprio app aqui excluiria ele em vez do
 * Discord.
 */
export function iniciarCapturaDeAudio(): void {
  if (process.platform !== 'win32') return;
  if (!fs.existsSync(caminhos.audioCapture)) return;

  const doDiscord = excluidos.filter((n) => n.includes('discord'));
  const alvo = (doDiscord.length ? doDiscord : ['discord']).join(',');

  capturaDeAudio = execFile(
    caminhos.audioCapture,
    ['--port=25641', `--exclude=${alvo}`],
    () => {
      // A saida vai para o log abaixo; o retorno nao interessa.
    },
  );

  capturaDeAudio.stdout?.on('data', (d: Buffer) => process.stdout.write(`[audio] ${d}`));
  capturaDeAudio.stderr?.on('data', (d: Buffer) => process.stdout.write(`[audio!] ${d}`));
}

export function pararCapturaDeAudio(): void {
  try {
    capturaDeAudio?.kill();
  } catch {
    // Ja morto.
  }
  capturaDeAudio = null;
}

interface LinhaDoPowerShell {
  ProcessName?: unknown;
  MainWindowTitle?: unknown;
}

/**
 * Lista os programas com janela aberta, para a selecao rapida na configuracao.
 *
 * So os que TEM janela: um Windows comum roda centenas de processos, e a
 * pessoa nao reconhece nenhum servico do sistema pelo nome do executavel.
 */
export async function listarProcessos(): Promise<ProcessoEmExecucao[]> {
  if (process.platform !== 'win32') return CONHECIDOS;

  const saida = await rodar(
    "Get-Process | Where-Object {$_.MainWindowTitle -ne ''} " +
      '| Select-Object ProcessName, MainWindowTitle | ConvertTo-Json',
  );
  if (!saida.trim()) return CONHECIDOS;

  try {
    const analisado: unknown = JSON.parse(saida);
    // Com um unico resultado o ConvertTo-Json devolve objeto, nao lista.
    const linhas: LinhaDoPowerShell[] = Array.isArray(analisado)
      ? (analisado as LinhaDoPowerShell[])
      : [analisado as LinhaDoPowerShell];

    const vistos = new Set<string>();
    const unicos: ProcessoEmExecucao[] = [];

    for (const linha of linhas) {
      const nome = String(linha.ProcessName ?? '').trim().toLowerCase();
      const titulo = String(linha.MainWindowTitle ?? '').trim();
      if (!nome || !titulo || vistos.has(nome)) continue;
      vistos.add(nome);
      unicos.push({ name: nome, title: titulo });
    }

    return unicos.length ? unicos : CONHECIDOS;
  } catch {
    return CONHECIDOS;
  }
}
