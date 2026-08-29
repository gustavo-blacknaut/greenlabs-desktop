// Audio do sistema sem o Discord. So Windows, so dentro do Electron.
//
// O AudioCapture.exe captura por WASAPI process loopback em modo exclude e
// serve o PCM float32 cru por HTTP local. Isso e exclusao de verdade na
// captura, nao mute: o Discord continua tocando normalmente na maquina de quem
// transmite, so nao entra na transmissao.

const ENDERECO = 'http://127.0.0.1:25641/audio/';
const BYTES_POR_AMOSTRA = 4;

export interface FaixaDoSistema {
  faixa: MediaStreamTrack;
  encerrar(): void;
}

/**
 * Abre a captura e devolve uma faixa de audio pronta para entrar na chamada.
 *
 * Lanca quando o AudioCapture.exe nao esta no ar - quem chama decide se cai
 * para o audio comum do navegador ou avisa a pessoa.
 */
export async function abrirAudioDoSistema(): Promise<FaixaDoSistema> {
  // O `t` na URL evita o cache: sem ele, reconectar devolvia a resposta
  // antiga, ja encerrada, e a faixa nascia muda.
  const resposta = await fetch(`${ENDERECO}?t=${Date.now()}`);
  if (!resposta.ok || !resposta.body) {
    throw new Error('captura de audio do sistema indisponivel');
  }

  const taxa = Number(resposta.headers.get('X-Sample-Rate')) || 48000;
  const canais = Math.max(1, Number(resposta.headers.get('X-Channels')) || 2);

  const contexto = new AudioContext({ sampleRate: taxa });
  const destino = contexto.createMediaStreamDestination();

  // O AudioWorkletNode roda na thread de tempo real do audio. Sem ele, qualquer
  // engasgo da thread principal (desenho, coleta de lixo) virava irregularidade
  // no ritmo dos pacotes - e o jitter buffer do WebRTC respondia crescendo o
  // atraso de reproducao para compensar. O anel em si esta no worklet.
  await contexto.audioWorklet.addModule('./wasapi-audio-worklet.js');
  const no = new AudioWorkletNode(contexto, 'wasapi-audio-processor', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [canais],
    processorOptions: { channels: canais, sampleRate: taxa },
  });
  no.connect(destino);

  const leitor = resposta.body.getReader();
  let sobra = new Uint8Array(0);
  let parado = false;

  void (async () => {
    try {
      while (!parado) {
        const { value, done } = await leitor.read();
        if (done || !value) break;

        // O HTTP corta onde quiser, inclusive no meio de um quadro. O que nao
        // fecha um quadro inteiro espera o proximo pedaco - sem isto o audio
        // sairia com os canais trocados a cada leitura torta.
        let junto = value;
        if (sobra.length) {
          junto = new Uint8Array(sobra.length + value.length);
          junto.set(sobra, 0);
          junto.set(value, sobra.length);
        }

        const bytesPorQuadro = BYTES_POR_AMOSTRA * canais;
        const quadrosInteiros = Math.floor(junto.length / bytesPorQuadro);
        const bytesUsaveis = quadrosInteiros * bytesPorQuadro;
        sobra = junto.slice(bytesUsaveis);
        if (quadrosInteiros === 0) continue;

        const leitura = new DataView(junto.buffer, junto.byteOffset, bytesUsaveis);
        const porCanal = Array.from(
          { length: canais },
          () => new Float32Array(quadrosInteiros),
        );

        // Intercalado no fio, separado por canal no Web Audio.
        for (let quadro = 0; quadro < quadrosInteiros; quadro++) {
          for (let canal = 0; canal < canais; canal++) {
            const destinoDoCanal = porCanal[canal];
            if (destinoDoCanal) {
              destinoDoCanal[quadro] = leitura.getFloat32(
                (quadro * canais + canal) * BYTES_POR_AMOSTRA,
                true,
              );
            }
          }
        }

        // Transfere os buffers em vez de copiar: sao dezenas por segundo, e
        // copiar cada um daria trabalho de graca para a coleta de lixo.
        no.port.postMessage(
          porCanal,
          porCanal.map((a) => a.buffer),
        );
      }
    } catch {
      // Fluxo cortado - o app fechou a captura ou o AudioCapture.exe caiu.
      // Quem chamou percebe pela faixa terminando.
    }
  })();

  const faixa = destino.stream.getAudioTracks()[0];
  if (!faixa) throw new Error('a captura abriu sem faixa de audio');

  const encerrar = () => {
    parado = true;
    void leitor.cancel().catch(() => {});
    try {
      no.disconnect();
    } catch {
      // Ja desconectado.
    }
    void contexto.close().catch(() => {});
  };

  return { faixa, encerrar };
}
