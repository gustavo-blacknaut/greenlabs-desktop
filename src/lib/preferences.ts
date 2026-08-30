// O que fica guardado entre uma sessao e outra.
//
// Antes cada preferencia era um useState com o proprio try/catch em volta do
// localStorage - doze chaves escritas a mao, o valor padrao repetido no `catch`
// (as vezes diferente do que estava no `try`), e nenhuma validacao do que
// voltava. Um localStorage com lixo derrubava a tela inteira.
//
// Aqui a chave, o tipo, o padrao e a leitura ficam no mesmo lugar, uma vez so.

import { esquemaDeServidores } from '@/types/schemas';
import type { ServidorSalvo } from '@/types/domain';

export const SERVIDOR_PADRAO = 'ws://localhost:25640';
export const SALA_PADRAO = 'call1';

/**
 * Aplicativos ignorados na captura de audio.
 *
 * O `greenlabs` e o `electron` estao na lista de proposito: sem eles o app
 * captura o proprio som de saida e devolve para a chamada, o que vira eco de
 * quem ja esta falando.
 */
export const EXCLUSOES_PADRAO =
  'discord, discordptb, discordcanary, discorddevelopment, electron, greenlabs';

export type ModoDeFiltro = 'blacklist' | 'whitelist';

export interface Preferencias {
  nome: string;
  servidorPadrao: string;
  salaPadrao: string;
  servidores: ServidorSalvo[];
  aceleracaoDeHardware: boolean;
  transmitirAudio: boolean;
  modoDeFiltro: ModoDeFiltro;
  aplicativosExcluidos: string;
  portaDeHospedagem: number;
  tunelDeHospedagem: boolean;
  colunasDaGrade: number;
  jaPassouPelaAbertura: boolean;
}

const CHAVES = {
  nome: 'greenlabs:userName',
  servidorPadrao: 'greenlabs:defaultServer',
  salaPadrao: 'greenlabs:defaultRoom',
  servidores: 'greenlabs:servers',
  aceleracaoDeHardware: 'greenlabs:hwAccel',
  transmitirAudio: 'greenlabs:shareAudio',
  modoDeFiltro: 'greenlabs:audioFilterMode',
  aplicativosExcluidos: 'greenlabs:excludedAudioApps',
  portaDeHospedagem: 'greenlabs:hostPort',
  tunelDeHospedagem: 'greenlabs:hostTunnel',
  colunasDaGrade: 'greenlabs:gridSlots',
  jaPassouPelaAbertura: 'greenlabs:onboarded',
} as const satisfies Record<keyof Preferencias, string>;

// O localStorage lanca em janela anonima com dados de site bloqueados, e
// tambem quando o disco enche. Nenhuma preferencia vale derrubar a tela.
function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function escrever(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // Sem lugar para guardar: a sessao atual continua valendo, so nao volta na
    // proxima. E melhor que uma tela branca.
  }
}

function lerTexto(chave: string, padrao: string): string {
  const bruto = ler(chave);
  return bruto === null || bruto === '' ? padrao : bruto;
}

/** Ausente conta como ligado: e o padrao de todas as marcas booleanas aqui. */
function lerBooleano(chave: string, desligadoQuando: string): boolean {
  const bruto = ler(chave);
  return bruto === null ? true : bruto !== desligadoQuando;
}

function lerNumero(chave: string, padrao: number): number {
  const numero = Number(ler(chave));
  return Number.isFinite(numero) && numero > 0 ? numero : padrao;
}

function lerServidores(): ServidorSalvo[] {
  const padrao: ServidorSalvo[] = [
    { url: SERVIDOR_PADRAO, sala: SALA_PADRAO, rotulo: 'Local' },
  ];

  const bruto = ler(CHAVES.servidores);
  if (!bruto) return padrao;

  // Validado pelo esquema, e nao por checagem manual campo a campo: um
  // localStorage com lixo - de uma versao antiga, ou editado a mao - devolve a
  // lista padrao em vez de derrubar a tela na primeira leitura.
  try {
    const lido = esquemaDeServidores.safeParse(JSON.parse(bruto));
    return lido.success && lido.data.length > 0 ? lido.data : padrao;
  } catch {
    return padrao;
  }
}

function nomeSugerido(): string {
  return `Usuario ${Math.floor(Math.random() * 99) + 1}`;
}

export function carregarPreferencias(): Preferencias {
  return {
    nome: lerTexto(CHAVES.nome, nomeSugerido()),
    servidorPadrao: lerTexto(CHAVES.servidorPadrao, SERVIDOR_PADRAO),
    salaPadrao: lerTexto(CHAVES.salaPadrao, SALA_PADRAO),
    servidores: lerServidores(),
    aceleracaoDeHardware: lerBooleano(CHAVES.aceleracaoDeHardware, 'false'),
    transmitirAudio: lerBooleano(CHAVES.transmitirAudio, '0'),
    modoDeFiltro: ler(CHAVES.modoDeFiltro) === 'whitelist' ? 'whitelist' : 'blacklist',
    aplicativosExcluidos: lerTexto(CHAVES.aplicativosExcluidos, EXCLUSOES_PADRAO),
    portaDeHospedagem: lerNumero(CHAVES.portaDeHospedagem, 25640),
    tunelDeHospedagem: ler(CHAVES.tunelDeHospedagem) === '1',
    colunasDaGrade: lerNumero(CHAVES.colunasDaGrade, 2),
    jaPassouPelaAbertura: ler(CHAVES.jaPassouPelaAbertura) === '1',
  };
}

/** Grava uma preferencia. O tipo do valor tem de casar com o da chave. */
export function guardar<C extends keyof Preferencias>(
  chave: C,
  valor: Preferencias[C],
): void {
  const alvo = CHAVES[chave];

  if (chave === 'servidores') {
    escrever(alvo, JSON.stringify(valor));
    return;
  }
  if (typeof valor === 'boolean') {
    // Cada marca tem o proprio texto de "desligado", por compatibilidade com o
    // que ja esta gravado na maquina de quem usa o app hoje.
    const desligado = chave === 'transmitirAudio' ? '0' : 'false';
    escrever(alvo, valor ? (chave === 'transmitirAudio' ? '1' : 'true') : desligado);
    return;
  }
  escrever(alvo, String(valor));
}

/** Apaga tudo e volta ao estado de app recem-instalado. */
export function restaurarPadraoDeFabrica(): void {
  for (const chave of Object.values(CHAVES)) {
    try {
      localStorage.removeItem(chave);
    } catch {
      // Nada a fazer: quem nao consegue apagar tambem nao conseguiu gravar.
    }
  }
}
