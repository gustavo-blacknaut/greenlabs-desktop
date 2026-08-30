import { useEffect, useRef } from 'react';

import { EyeIcon, EyeOffIcon } from '@/icons';

interface PropsDoVideo {
  stream: MediaStream;
  mudo?: boolean;
  volume?: number;
  className?: string;
}

/**
 * `srcObject` nao existe como atributo, so como propriedade do elemento - por
 * isso o video nasce vazio e a stream entra depois, pelo ref.
 */
export function VideoPlayer({ stream, mudo = false, volume = 1, className = '' }: PropsDoVideo) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.volume = volume;
    ref.current.muted = mudo;
  }, [mudo, volume]);

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

interface PropsDoOculto {
  rotulo?: string;
  aoMostrar?: () => void;
}

/** Ocupa o lugar do video quando ele esta escondido, para o espaco nao sumir. */
export function VisualOculto({ rotulo = 'Prévia oculta', aoMostrar }: PropsDoOculto) {
  return (
    <div className="hidden-visual">
      <EyeOffIcon size={30} />
      <span>{rotulo}</span>
      {aoMostrar && (
        <button className="ghost" onClick={aoMostrar}>
          <EyeIcon size={15} /> Mostrar de novo
        </button>
      )}
    </div>
  );
}
