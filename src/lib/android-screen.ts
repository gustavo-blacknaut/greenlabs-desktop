// Captura de tela no Android.
//
// Nenhum navegador Android implementa getDisplayMedia - e limitacao da
// plataforma, nao do WebView. Entao a captura vem do lado nativo (repositorio
// greenlabs-android): o MediaProjection gera os quadros, codifica em JPEG e
// entrega por um servidor HTTP local, com o mesmo enquadramento que o audio do
// WASAPI usa no desktop (4 bytes de tamanho, depois o conteudo).
//
// Aqui so mora a ponte: desenhar esses quadros num canvas e usar
// captureStream() para virar uma MediaStream de verdade. Dai em diante e o
// mesmo caminho de uma camera, e o resto do WebRTC nao sabe a diferenca.

import type { PerfilDeQualidade } from '@/types/domain';

/** A ponte que o app Android pendura na janela do WebView. */
interface PonteAndroid {
  isAvailable?(): boolean;
  requestScreenCapture(largura: number, altura: number, fps: number): void;
  stopScreenCapture?(): void;
}

declare global {
  interface Window {
    greenlabsMobile?: PonteAndroid;
    /**
     * A notificacao de gravacao do Android chama isto para sair da chamada.
     *
     * Ela sobrevive enquanto a captura existir, independente de qual tela a
     * iniciou - por isso o gancho e global, e nao um callback passado adiante.
     */
    __glLeaveCall?: () => void;
    /** O lado nativo chama estas duas para responder o pedido de captura. */
    __glScreenReady?: (porta: number) => void;
    __glScreenError?: (mensagem: string) => void;
  }
}

/**
 * A captura e por software (JPEG quadro a quadro), entao custa CPU e bateria
 * de um jeito que a captura por hardware do desktop nao custa. Estes tetos
 * existem por isso, e nao por limitacao do protocolo.
 */
export const ANDROID_LARGURA_MAX = 1280;
export const ANDROID_ALTURA_MAX = 720;

/**
 * 30 fps dobra o numero de quadros a codificar em JPEG por software. Em
 * aparelho fraco pode engasgar - e so escolher uma qualidade menor, que o fps
 * acompanha.
 */
export const ANDROID_FPS_MAX = 30;

// So existe uma captura por vez: o Android entrega um MediaProjection so.
// Guardar o encerramento no modulo evita passar o objeto de volta por toda a
// arvore de componentes.
let pararCapturaNativa: (() => void) | null = null;

/** O app Android expoe window.greenlabsMobile; em qualquer outro lugar nao existe. */
export function temCapturaAndroid(): boolean {
  return typeof window !== 'undefined' && window.greenlabsMobile?.isAvailable?.() === true;
}

/**
 * Encerra a captura de verdade - a faixa do canvas e o MediaProjection do lado
 * nativo. Seguro chamar sem nada capturando.
 */
export function pararTelaAndroid(): void {
  const parar = pararCapturaNativa;
  pararCapturaNativa = null;
  if (parar) parar();
  else window.greenlabsMobile?.stopScreenCapture?.();
}

export interface TelaAndroidAberta {
  stream: MediaStream;
  largura: number;
  altura: number;
  fps: number;
}

export interface OpcoesDaTelaAndroid {
  qualidade: PerfilDeQualidade;
  /** Chamado se a conexao cair depois de comecar. */
  aoCair?: (motivo: string) => void;
}

async function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pede a permissao, conecta no fluxo nativo e devolve uma MediaStream
 * alimentada por ele.
 */
export async function abrirTelaAndroid({
  qualidade,
  aoCair,
}: OpcoesDaTelaAndroid): Promise<TelaAndroidAberta> {
  const ponte = window.greenlabsMobile;
  if (!ponte) throw new Error('captura de tela do Android indisponivel');

  const largura = Math.min(qualidade.largura, ANDROID_LARGURA_MAX);
  const altura = Math.min(qualidade.altura, ANDROID_ALTURA_MAX);
  const fps = Math.min(qualidade.fps, ANDROID_FPS_MAX);

  const porta = await new Promise<number>((resolve, reject) => {
    window.__glScreenReady = resolve;
    window.__glScreenError = (mensagem) =>
      reject(new Error(mensagem || 'falha ao capturar a tela'));
    ponte.requestScreenCapture(largura, altura, fps);
  });

  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const pincel = canvas.getContext('2d');
  if (!pincel) throw new Error('canvas 2d indisponivel');

  const stream = canvas.captureStream(fps);
  const faixaDeVideo = stream.getVideoTracks()[0];
  if (!faixaDeVideo) throw new Error('captureStream nao devolveu faixa de video');

  // O socket nativo ja esta escutando quando o onReady dispara, mas conectar
  // enquanto o servico e a notificacao de primeiro plano ainda se acomodam se
  // mostrou instavel. Algumas tentativas cobrem isso sem esconder falha real.
  let resposta: Response | null = null;
  let ultimoErro: Error | null = null;
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    try {
      const tentada = await fetch(`http://127.0.0.1:${porta}/stream`);
      if (tentada.ok && tentada.body) {
        resposta = tentada;
        ultimoErro = null;
        break;
      }
      ultimoErro = new Error(`o fluxo respondeu ${tentada.status}`);
    } catch (erro) {
      ultimoErro = erro instanceof Error ? erro : new Error(String(erro));
    }
    await esperar(150 * (tentativa + 1));
  }
  if (ultimoErro) throw ultimoErro;
  if (!resposta?.body) throw new Error('o fluxo abriu sem conteudo');

  const leitor = resposta.body.getReader();
  let acumulado = new Uint8Array(0);
  let parado = false;
  let ultimoDesenho = 0;
  const intervaloMinimo = 1000 / fps;

  const derrubar = (erro?: Error) => {
    if (parado) return;
    parado = true;
    aoCair?.(erro?.message || 'a transmissão de tela caiu');
    void leitor.cancel().catch(() => {});
    try {
      faixaDeVideo.stop();
    } catch {
      // Ja parada.
    }
    ponte.stopScreenCapture?.();
  };

  void (async () => {
    try {
      while (!parado) {
        const { value, done } = await leitor.read();
        if (done || !value) {
          derrubar(new Error('fluxo encerrado pelo lado nativo'));
          break;
        }

        const junto = new Uint8Array(acumulado.length + value.length);
        junto.set(acumulado, 0);
        junto.set(value, acumulado.length);
        acumulado = junto;

        while (acumulado.length >= 4) {
          const tamanho = new DataView(
            acumulado.buffer,
            acumulado.byteOffset,
            4,
          ).getUint32(0, false);
          if (acumulado.length < 4 + tamanho) break;

          const jpeg = acumulado.slice(4, 4 + tamanho);
          acumulado = acumulado.slice(4 + tamanho);

          // Os quadros chegam em rajadas. Desenhar cada um assim que decodifica
          // faz a imagem ficar parada e depois saltar - o que se ve como a tela
          // "teleportando". Espacar os desenhos pelo intervalo alvo mantem uma
          // cadencia estavel para o captureStream amostrar.
          const agora = performance.now();
          if (agora - ultimoDesenho < intervaloMinimo) continue;
          ultimoDesenho = agora;

          try {
            const imagem = await createImageBitmap(new Blob([jpeg], { type: 'image/jpeg' }));
            pincel.drawImage(imagem, 0, 0, largura, altura);
            imagem.close();
          } catch {
            // Quadro corrompido: pula. O proximo chega em 33 ms.
          }
        }
      }
    } catch (erro) {
      derrubar(erro instanceof Error ? erro : new Error(String(erro)));
    }
  })();

  // MediaStreamTrack.stop() NAO dispara 'ended' - por especificacao esse evento
  // so ocorre quando a faixa termina por causa externa (a pessoa parou pela
  // notificacao do Android, o app foi para segundo plano). Entao ao clicar no X
  // para encerrar, a faixa do canvas parava, o cartao sumia da tela... e o lado
  // nativo continuava capturando, com a notificacao no topo e o
  // MediaProjection vivo.
  pararCapturaNativa = () => {
    if (parado) return;
    parado = true;
    void leitor.cancel().catch(() => {});
    try {
      faixaDeVideo.stop();
    } catch {
      // Ja parada.
    }
    ponte.stopScreenCapture?.();
  };

  faixaDeVideo.addEventListener('ended', () => {
    if (parado) return;
    parado = true;
    void leitor.cancel().catch(() => {});
    ponte.stopScreenCapture?.();
  });

  if (parado) throw new Error('a captura caiu antes de comecar a transmitir');
  return { stream, largura, altura, fps };
}
