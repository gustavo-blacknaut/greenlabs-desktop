// Constantes e ajudantes de midia: perfis de qualidade, servidores ICE e o
// ajuste do sender. Nada aqui depende de React nem do Electron.

import type { PerfilDeQualidade } from '@/types/domain';

export const SERVIDORES_ICE: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export function novoId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export const QUALIDADES: readonly PerfilDeQualidade[] = [
  { id: '480p15', rotulo: '480p 15fps - ultra leve', largura: 854, altura: 480, fps: 15, bitrate: 700_000 },
  { id: '480p30', rotulo: '480p 30fps', largura: 854, altura: 480, fps: 30, bitrate: 900_000 },
  { id: '720p30', rotulo: '720p 30fps', largura: 1280, altura: 720, fps: 30, bitrate: 2_200_000 },
  { id: '720p60', rotulo: '720p 60fps', largura: 1280, altura: 720, fps: 60, bitrate: 3_200_000 },
  { id: '1080p30', rotulo: '1080p 30fps', largura: 1920, altura: 1080, fps: 30, bitrate: 4_500_000 },
  { id: '1080p60', rotulo: '1080p 60fps', largura: 1920, altura: 1080, fps: 60, bitrate: 7_500_000 },
] as const;

export const QUALIDADE_PADRAO: PerfilDeQualidade = QUALIDADES[4]!;

export function qualidadePorId(id: string): PerfilDeQualidade {
  return QUALIDADES.find((q) => q.id === id) ?? QUALIDADE_PADRAO;
}

/**
 * Aplica o perfil de qualidade no sender de video.
 *
 * `degradationPreference` decide o que sacrificar quando o encoder ou a rede
 * nao dao conta, e a escolha aqui era pela taxa pedida: 30 fps ganhava
 * `maintain-resolution`, para nitidez de apresentacao e codigo na tela.
 *
 * Errado, e o motivo e medido. maintain-resolution manda o navegador NUNCA
 * encolher a imagem - quando falta CPU, ele derruba quadro. Codificar 1080p em
 * software custa 101 ms por quadro, o que poe o teto em ~10 fps; o que saiu
 * foi 1920x1080 a 6 fps, uma sequencia de fotos. E nao ha perda de pacote
 * nenhuma no caminho: a imagem simplesmente nao chega a ser produzida, entao
 * procurar o defeito na rede nao leva a lugar nenhum.
 *
 * `balanced` deixa o navegador encolher a resolucao e manter o movimento. Uma
 * tela menor e fluida se le melhor do que uma tela cheia que anda de dois em
 * dois segundos.
 */
export async function configurarSender(
  sender: RTCRtpSender | null | undefined,
  qualidade: PerfilDeQualidade,
): Promise<void> {
  if (!sender || sender.track?.kind !== 'video') return;

  try {
    const parametros = sender.getParameters();
    parametros.degradationPreference = 'balanced';

    if (!parametros.encodings?.length) parametros.encodings = [{}];
    const primeira = parametros.encodings[0]!;
    primeira.maxBitrate = qualidade.bitrate;
    primeira.maxFramerate = qualidade.fps;
    primeira.priority = 'high';
    primeira.networkPriority = 'high';

    await sender.setParameters(parametros);
  } catch {
    // Navegador que nao aceita algum destes campos ainda transmite; recusar a
    // chamada inteira por causa do ajuste fino seria pior.
  }
}

/**
 * Tira o assobio de 1 kHz e o ronco abaixo de 80 Hz do audio capturado.
 *
 * Sao dois filtros do proprio navegador: um notch estreito no 1 kHz e um
 * passa-alta. Se o AudioContext nao abrir, devolve o audio cru - som com
 * chiado e melhor que chamada sem som.
 */
export function limparAudio(original: MediaStream): MediaStream {
  if (!original.getAudioTracks().length) return original;

  try {
    const contexto = new AudioContext();
    const fonte = contexto.createMediaStreamSource(original);

    const notch = contexto.createBiquadFilter();
    notch.type = 'notch';
    notch.frequency.value = 1000;
    notch.Q.value = 3.0;

    const passaAlta = contexto.createBiquadFilter();
    passaAlta.type = 'highpass';
    passaAlta.frequency.value = 80;

    const destino = contexto.createMediaStreamDestination();
    fonte.connect(notch);
    notch.connect(passaAlta);
    passaAlta.connect(destino);

    const limpa = destino.stream.getAudioTracks()[0];
    if (!limpa) return original;

    return new MediaStream([...original.getVideoTracks(), limpa]);
  } catch {
    return original;
  }
}
