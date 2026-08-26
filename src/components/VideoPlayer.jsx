import React, { useEffect, useRef } from 'react';
import { EyeIcon, EyeOffIcon } from '../icons.jsx';

// `srcObject` não existe como atributo, só como propriedade do elemento - por
// isso o vídeo é montado vazio e a stream entra depois, pelo ref.
export function VideoPlayer({ stream, muted = false, volume = 1, className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.volume = volume;
    ref.current.muted = muted;
  }, [muted, volume]);

  return (
    <video
      ref={ref}
      className={className}
      autoPlay
      playsInline
      disablePictureInPicture
      disableRemotePlayback
    />
  );
}

// Ocupa o lugar do vídeo quando ele está escondido, para o espaço não sumir.
export function HiddenVisual({ label = 'Prévia oculta', onReveal }) {
  return (
    <div className="hidden-visual">
      <EyeOffIcon size={30} />
      <span>{label}</span>
      {onReveal && (
        <button className="ghost" onClick={onReveal}>
          <EyeIcon size={15} /> Mostrar de novo
        </button>
      )}
    </div>
  );
}
