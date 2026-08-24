// Constantes e helpers de mídia: perfis de qualidade, servidores ICE e o
// ajuste de encoding do sender. Nada aqui depende de React.

export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
];
export const makeId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

export const QUALITIES = [
  { id: '480p15', label: '480p 15fps - ultra leve', width: 854, height: 480, fps: 15, bitrate: 700_000 },
  { id: '480p30', label: '480p 30fps', width: 854, height: 480, fps: 30, bitrate: 900_000 },
  { id: '720p30', label: '720p 30fps', width: 1280, height: 720, fps: 30, bitrate: 2_200_000 },
  { id: '720p60', label: '720p 60fps', width: 1280, height: 720, fps: 60, bitrate: 3_200_000 },
  { id: '1080p30', label: '1080p 30fps', width: 1920, height: 1080, fps: 30, bitrate: 4_500_000 },
  { id: '1080p60', label: '1080p 60fps', width: 1920, height: 1080, fps: 60, bitrate: 7_500_000 },
];

export function getQuality(id) {
  return QUALITIES.find((q) => q.id === id) ?? QUALITIES[4];
}

export async function configureSender(sender, quality) {
  if (!sender || sender.track?.kind !== 'video') return;
  try {
    const params = sender.getParameters();
    params.degradationPreference = quality.fps >= 45 ? 'maintain-framerate' : 'maintain-resolution';
    if (!params.encodings?.length) params.encodings = [{}];
    params.encodings[0].maxBitrate = quality.bitrate;
    params.encodings[0].maxFramerate = quality.fps;
    params.encodings[0].priority = 'high';
    params.encodings[0].networkPriority = 'high';
    await sender.setParameters(params);
  } catch {}
}

export function processCleanAudioStream(rawStream) {
  const audioTracks = rawStream.getAudioTracks();
  if (!audioTracks.length) return rawStream;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = ctx.createMediaStreamSource(rawStream);
    const filter1 = ctx.createBiquadFilter();
    filter1.type = 'notch';
    filter1.frequency.value = 1000;
    filter1.Q.value = 3.0;

    const filter2 = ctx.createBiquadFilter();
    filter2.type = 'highpass';
    filter2.frequency.value = 80;

    const dest = ctx.createMediaStreamDestination();
    source.connect(filter1);
    filter1.connect(filter2);
    filter2.connect(dest);

    const cleanAudioTrack = dest.stream.getAudioTracks()[0];
    return new MediaStream([
      ...rawStream.getVideoTracks(),
      cleanAudioTrack
    ]);
  } catch {
    return rawStream;
  }
}
