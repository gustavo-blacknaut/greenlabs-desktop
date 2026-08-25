// Captura de tela no Android.
//
// Nenhum navegador Android implementa getDisplayMedia - é limitação da
// plataforma, não do WebView. Então a captura vem do lado nativo (repositório
// greenlabs-live-streaming-mobile): MediaProjection gera os frames, codifica em
// JPEG e entrega por um servidor HTTP local, com o mesmo enquadramento que o
// áudio do WASAPI usa no desktop (4 bytes de tamanho + payload).
//
// Aqui só mora a ponte: desenhar esses frames num canvas e usar captureStream()
// para virar uma MediaStream de verdade. A partir daí é o mesmo caminho que uma
// câmera percorre, e o resto do WebRTC não precisa saber a diferença.

// Só existe uma captura por vez: o Android entrega um MediaProjection só.
// Guardar o encerramento num módulo evita ter que passar o objeto de volta por
// toda a árvore de componentes.
let pararCapturaNativa = null;

/**
 * Encerra a captura de tela do Android de verdade — a faixa do canvas e o
 * MediaProjection do lado nativo. Seguro chamar sem nada capturando.
 */
export function stopAndroidScreenCapture() {
  const parar = pararCapturaNativa;
  pararCapturaNativa = null;
  if (parar) parar();
  else window.greenlabsMobile?.stopScreenCapture?.();
}

/** O app Android expõe window.greenlabsMobile; em qualquer outro lugar não existe. */
export function hasAndroidScreenCapture() {
  return typeof window !== 'undefined' && !!window.greenlabsMobile?.isAvailable?.();
}

// A captura é por software (JPEG quadro a quadro), então custa CPU e bateria de
// um jeito que a captura por hardware do desktop não custa. Estes tetos existem
// por isso, e não por limitação do protocolo.
export const ANDROID_MAX_WIDTH = 1280;
export const ANDROID_MAX_HEIGHT = 720;
// 30fps é experimental: dobra o número de frames a codificar em JPEG por
// software, então gasta mais CPU e bateria que os 15fps de antes. Em aparelho
// fraco pode engasgar - se acontecer, é só escolher uma qualidade menor, que o
// fps acompanha.
export const ANDROID_MAX_FPS = 30;

/**
 * Pede a permissão de captura, conecta no stream nativo e devolve uma
 * MediaStream alimentada por ele.
 *
 * @param {object} opts
 * @param {object} opts.quality  perfil escolhido pelo usuário
 * @param {(msg: string) => void} [opts.onDropped]  chamado se a conexão cair depois de começar
 * @returns {Promise<{stream: MediaStream, width: number, height: number, fps: number}>}
 */
export async function startAndroidScreenCapture({ quality, onDropped }) {
  const bridge = window.greenlabsMobile;
  const width = Math.min(quality.width, ANDROID_MAX_WIDTH);
  const height = Math.min(quality.height, ANDROID_MAX_HEIGHT);
  const fps = Math.min(quality.fps, ANDROID_MAX_FPS);

  const port = await new Promise((resolve, reject) => {
    window.__glScreenReady = (p) => resolve(p);
    window.__glScreenError = (msg) => reject(new Error(msg || 'falha ao capturar a tela'));
    bridge.requestScreenCapture(width, height, fps);
  });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx2d = canvas.getContext('2d');
  const stream = canvas.captureStream(fps);
  const videoTrack = stream.getVideoTracks()[0];

  // O socket nativo já está escutando quando onReady dispara, mas conectar
  // enquanto o serviço e a notificação de primeiro plano ainda estão se
  // acomodando se mostrou instável. Algumas tentativas cobrem isso sem
  // esconder uma falha real.
  let resp;
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      resp = await fetch(`http://127.0.0.1:${port}/stream`);
      if (resp.ok && resp.body) { lastErr = null; break; }
      lastErr = new Error(`stream respondeu ${resp.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
  }
  if (lastErr) throw lastErr;

  const reader = resp.body.getReader();
  let buffer = new Uint8Array(0);
  let stopped = false;
  let lastDrawAt = 0;
  const minDrawIntervalMs = 1000 / fps;

  const teardown = (err) => {
    if (stopped) return;
    stopped = true;
    onDropped?.(err?.message || 'a transmissão de tela caiu');
    try { reader.cancel(); } catch {}
    try { videoTrack.stop(); } catch {}
    bridge.stopScreenCapture?.();
  };

  (async () => {
    try {
      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) { teardown(new Error('stream encerrado pelo lado nativo')); break; }
        const merged = new Uint8Array(buffer.length + value.length);
        merged.set(buffer, 0);
        merged.set(value, buffer.length);
        buffer = merged;

        while (buffer.length >= 4) {
          const len = new DataView(buffer.buffer, buffer.byteOffset, 4).getUint32(0, false);
          if (buffer.length < 4 + len) break;
          const jpegBytes = buffer.slice(4, 4 + len);
          buffer = buffer.slice(4 + len);
          // Os frames chegam em rajadas. Desenhar cada um assim que decodifica
          // faz a imagem ficar parada e depois saltar - o que se vê como a tela
          // "teleportando". Espaçar os desenhos pelo intervalo alvo mantém uma
          // cadência estável para o captureStream amostrar.
          const now = performance.now();
          if (now - lastDrawAt < minDrawIntervalMs) continue;
          lastDrawAt = now;
          try {
            const bitmap = await createImageBitmap(new Blob([jpegBytes], { type: 'image/jpeg' }));
            ctx2d.drawImage(bitmap, 0, 0, width, height);
            bitmap.close();
          } catch {}
        }
      }
    } catch (err) {
      teardown(err);
    }
  })();

  // MediaStreamTrack.stop() NAO dispara 'ended' - por especificacao esse
  // evento so ocorre quando a faixa termina por causa externa (o usuario
  // parou pela notificacao do Android, o app foi para segundo plano). Entao
  // quando alguem clicava no X para encerrar a transmissao, a faixa do canvas
  // parava, o card sumia da tela... e o lado nativo continuava capturando, com
  // a notificacao no topo e o MediaProjection vivo.
  //
  // Por isso o encerramento explicito e registrado aqui, para o botao de fechar
  // conseguir avisar o Android de verdade.
  pararCapturaNativa = () => {
    if (stopped) return;
    stopped = true;
    try { reader.cancel(); } catch {}
    try { videoTrack.stop(); } catch {}
    bridge.stopScreenCapture?.();
  };

  videoTrack.addEventListener('ended', () => {
    if (stopped) return;
    stopped = true;
    try { reader.cancel(); } catch {}
    bridge.stopScreenCapture?.();
  });

  if (stopped) throw new Error('a captura caiu antes de começar a transmitir');
  return { stream, width, height, fps };
}
