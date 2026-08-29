// Os tipos do GreenLabs: o que e uma transmissao, um participante, um perfil
// de qualidade.
//
// Estavam todos implicitos dentro do main.jsx, em objetos montados na mao em
// cinco lugares diferentes. Sempre que um deles ganhava um campo, os outros
// quatro ficavam para tras em silencio.
//
// O que vem da REDE nao mora aqui: mora em schemas.ts, definido em Zod e
// validado na entrada. Tipo sem validacao na borda e so uma promessa.

export type IdDeCartao = string;
export type IdDePar = string;

/** Tela ou camera. Muda o icone, o rotulo e se ha controle de volume. */
export type TipoDeTransmissao = 'screen' | 'camera';

export interface PerfilDeQualidade {
  id: string;
  rotulo: string;
  largura: number;
  altura: number;
  fps: number;
  bitrate: number;
}

/**
 * Uma transmissao na tela - minha ou de outra pessoa.
 *
 * `local` separa as duas: so a minha pode ser encerrada por mim, e so a dos
 * outros tem volume para ajustar (a minha ja sai pelos alto-falantes daqui).
 */
export interface Transmissao {
  /**
   * Identificador do cartao, no formato `idDoPar:idDaStream`.
   *
   * NAO pode sair de uma MediaStream montada na hora: cada `new MediaStream()`
   * sorteia um id novo. Em modo SFU ha renegociacao toda vez que alguem entra
   * ou sai, o `ontrack` dispara de novo para a mesma faixa, e um id sorteado
   * fazia nascer um cartao duplicado por pessoa a cada entrada e saida.
   */
  id: IdDeCartao;
  streamId: string;
  nome: string;
  tipo: TipoDeTransmissao;
  stream: MediaStream;
  local: boolean;

  /** Quem esta transmitindo. Ausente nas minhas. */
  parId?: IdDePar;
  nomeDoDono: string;

  /** De 0 a 1. So faz sentido no que nao e meu. */
  volume: number;

  /** Escondida por mim: continua chegando, so nao e desenhada. */
  oculta: boolean;

  qualidade: PerfilDeQualidade | null;
}

export interface Participante {
  parId: IdDePar;
  nome: string;
  /** Com nomes repetidos na sala, vira "Gustavo (2)". */
  nomeExibido?: string;
}

/**
 * O servidor em modo retransmissor se apresenta com este id.
 *
 * Ele oferece como se fosse um participante, e sem separa-lo aparecia na lista
 * da sala como "Usuario". E infraestrutura, nao gente.
 */
export const ID_DO_SFU = 'sfu';

// ---------------------------------------------------------------- sinalizacao
//
// Os nomes de campo do protocolo sao os do FIO e nao foram traduzidos: o
// servidor em Go e os clientes em C++ e Android leem exatamente estes. Trocar
// `description` por `sdp` derrubaria a chamada com todos eles.

/** O que sai daqui para o servidor. */
export type MensagemEnviada =
  | { type: 'join'; roomId: string; name: string }
  | { type: 'offer'; to: IdDePar; description: RTCSessionDescription | null }
  | { type: 'answer'; to: IdDePar; description: RTCSessionDescription | null }
  | { type: 'ice'; to: IdDePar; candidate: RTCIceCandidate }
  | { type: 'ping'; timestamp: number; rtt: number }
  | {
      type: 'stream-meta';
      to: IdDePar;
      streamId: string;
      kind: TipoDeTransmissao;
      name: string;
      ownerName: string;
      quality: PerfilDeQualidade | null;
    }
  | { type: 'stream-ended'; streamId: string };

// O que ENTRA e derivado dos esquemas do Zod, e nao escrito de novo aqui:
// mudar o esquema muda o tipo junto, e nao ha como um ficar para tras.
export type {
  MensagemRecebida,
  MetaDeTransmissao,
  ParDaSala,
  ServidorSalvo,
} from '@/types/schemas';
