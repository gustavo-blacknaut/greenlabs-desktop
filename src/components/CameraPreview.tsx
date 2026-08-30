import { useEffect, useRef } from 'react';

interface PropsDaPrevia {
  deviceId?: string;
}

/**
 * Previa da camera escolhida no seletor.
 *
 * Cada troca de aparelho abre uma stream nova, e a anterior precisa ser parada
 * na mao: sem isso a luz da webcam fica acesa e o aparelho continua ocupado
 * pelo app, o que impede outro programa de usar a camera.
 */
export default function CameraPreview({ deviceId }: PropsDaPrevia) {
  const ref = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelado = false;

    const parar = () => {
      for (const faixa of stream.current?.getTracks() ?? []) {
        try {
          faixa.stop();
        } catch {
          // Faixa ja encerrada; nao ha o que parar.
        }
      }
      stream.current = null;
    };

    parar();
    navigator.mediaDevices
      .getUserMedia({
        video: { deviceId: deviceId ? { exact: deviceId } : undefined },
        audio: false,
      })
      .then((nova) => {
        // A troca pode ter acontecido enquanto a permissao era pedida. Sem
        // esta checagem sobrariam duas cameras ligadas.
        if (cancelado) {
          for (const faixa of nova.getTracks()) {
            try {
              faixa.stop();
            } catch {
              // Idem.
            }
          }
          return;
        }
        stream.current = nova;
        if (ref.current) ref.current.srcObject = nova;
      })
      .catch(() => {
        // Camera negada ou em uso por outro programa. A previa fica preta, e
        // quem escolheu ve que aquele aparelho nao serve.
      });

    return () => {
      cancelado = true;
      parar();
    };
  }, [deviceId]);

  return <video ref={ref} className="camera-preview-video" autoPlay playsInline muted />;
}
