// Os tipos do GreenLabs em si: o que e uma transmissao, um participante, um
// perfil de qualidade e cada mensagem que passa pela sinalizacao.
//
// Estavam todos implicitos dentro do main.jsx, em objetos montados na mao em
// cinco lugares diferentes. Sempre que um deles ganhava um campo, os outros
// quatro ficavam para tras em silencio.

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
   * sorteia um id novo, e em modo SFU o ontrack dispara de novo a cada
   * renegociacao - o que fazia nascer um cartao duplicado por pessoa a cada
   * entrada e saida na sala.
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

/** Servidor guardado na lista de atalhos. */
export interface ServidorSalvo {
  id?: string;
  url: string;
  sala: string;
  rotulo?: string;
  favorito?: boolean;
}

// ---------------------------------------------------------------- sinalizacao
//
// Os nomes de campo aqui sao os do FIO, e nao podem ser traduzidos: o servidor
// em Go e os clientes em C++ e Android leem exatamente estes. Trocar
// `description` por `sdp` aqui derrubaria a chamada com todos eles.

/** Descricao de uma transmissao, mandada por fora do WebRTC. */
export interface MetaDeTransmissao {
  kind: TipoDeTransmissao;
  name: string;
  ownerName: string;
  quality: PerfilDeQualidade | null;
}

/** O que sai daqui para o servidor. */
export type MensagemEnviada =
  | { type: 'join'; roomId: string; name: string }
  | { type: 'offer'; to: IdDePar; description: RTCSessionDescription | null }
  | { type: 'answer'; to: IdDePar; description: RTCSessionDescription | null }
  | { type: 'ice'; to: IdDePar; candidate: RTCIceCandidate }
  | { type: 'ping'; timestamp: number; rtt: number }
  | ({ type: 'stream-meta'; to: IdDePar; streamId: string } & MetaDeTransmissao)
  | { type: 'stream-ended'; streamId: string };

/**
 * O que o servidor manda para ca.
 *
 * Uniao discriminada pelo `type`: com ela o compilador sabe que um `offer` tem
 * `description` e um `ice` tem `candidate`, e recusa ler o campo errado.
 */
export type MensagemRecebida =
  | { type: 'joined'; peerId: IdDePar; peers: ParDaSala[]; sfu?: boolean }
  | { type: 'peer-joined'; peerId: IdDePar; name: string }
  | { type: 'peer-left'; peerId: IdDePar }
  | { type: 'offer'; from: IdDePar; description: RTCSessionDescriptionInit }
  | { type: 'answer'; from: IdDePar; description: RTCSessionDescriptionInit }
  | { type: 'ice'; from: IdDePar; candidate: RTCIceCandidateInit }
  | ({ type: 'stream-meta'; from: IdDePar; streamId: string } & MetaDeTransmissao)
  | { type: 'stream-ended'; from: IdDePar; streamId: string; id?: IdDeCartao }
  | { type: 'pong'; timestamp: number }
  | { type: 'room-pings'; pings: Record<IdDePar, number> };

export interface ParDaSala {
  peerId: IdDePar;
  name: string;
}

/**
 * O servidor em modo retransmissor se apresenta com este id.
 *
 * Ele oferece como se fosse um participante, e sem separa-lo aparecia na lista
 * da sala como "Usuario". E infraestrutura, nao gente.
 */
export const ID_DO_SFU = 'sfu';
