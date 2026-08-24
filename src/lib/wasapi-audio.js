// Áudio do sistema sem o Discord (só Windows/Electron).
//
// O AudioCapture.exe captura via WASAPI process loopback em modo exclude e
// serve o PCM float32 cru por HTTP local. Isso é exclusão de verdade na
// captura, não mute: o Discord continua tocando normalmente no seu PC, só não
// entra na transmissão.

export async function startWasapiAudioTrack() {
  const resp = await fetch(`http://127.0.0.1:25641/audio/?t=${Date.now()}`);
  if (!resp.ok || !resp.body) throw new Error('WASAPI audio endpoint unavailable');

  const sampleRate = Number(resp.headers.get('X-Sample-Rate')) || 48000;
  const channels = Math.max(1, Number(resp.headers.get('X-Channels')) || 2);

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
  const dest = audioCtx.createMediaStreamDestination();
  // AudioWorkletNode runs on the realtime audio thread, so main-thread jank
  // (UI work, GC) can't turn into irregular packet timing - that was feeding
  // WebRTC's jitter buffer bursts, making it grow the playout delay to
  // compensate. See wasapi-audio-worklet.js for the ring buffer itself.
  await audioCtx.audioWorklet.addModule('./wasapi-audio-worklet.js');
  const node = new AudioWorkletNode(audioCtx, 'wasapi-audio-processor', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [channels],
    processorOptions: { channels, sampleRate },
  });
  node.connect(dest);

  const reader = resp.body.getReader();
  let leftover = new Uint8Array(0);
  let stopped = false;

  (async () => {
    try {
      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        let combined = value;
        if (leftover.length) {
          combined = new Uint8Array(leftover.length + value.length);
          combined.set(leftover, 0);
          combined.set(value, leftover.length);
        }
        const frameBytes = 4 * channels;
        const usableFrames = Math.floor(combined.length / frameBytes);
        const usableBytes = usableFrames * frameBytes;
        const view = new DataView(combined.buffer, combined.byteOffset, usableBytes);
        const perChannel = Array.from({ length: channels }, () => new Float32Array(usableFrames));
        for (let f = 0; f < usableFrames; f++) {
          for (let ch = 0; ch < channels; ch++) {
            perChannel[ch][f] = view.getFloat32((f * channels + ch) * 4, true);
          }
        }
        leftover = combined.slice(usableBytes);
        if (usableFrames > 0) {
          node.port.postMessage(perChannel, perChannel.map((a) => a.buffer));
        }
      }
    } catch {}
  })();

  const audioTrack = dest.stream.getAudioTracks()[0];
  const cleanup = () => {
    stopped = true;
    try { reader.cancel(); } catch {}
    try { node.disconnect(); } catch {}
    try { audioCtx.close(); } catch {}
  };
  return { audioTrack, cleanup };
}
