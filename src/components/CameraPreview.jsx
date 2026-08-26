import React, { useEffect, useRef } from 'react';

// Prévia da câmera escolhida no seletor. Cada troca de aparelho abre uma stream
// nova, e a anterior precisa ser parada na mão: sem isso a luz da webcam fica
// acesa e o aparelho continua ocupado.
export default function CameraPreview({ deviceId }) {
  const ref = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const stop = () => {
      if (!streamRef.current) return;
      streamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch {}
      });
      streamRef.current = null;
    };

    stop();
    navigator.mediaDevices
      .getUserMedia({ video: { deviceId: deviceId ? { exact: deviceId } : undefined }, audio: false })
      .then((stream) => {
        // A troca pode ter acontecido enquanto a permissão era pedida.
        if (cancelled) {
          stream.getTracks().forEach((t) => {
            try { t.stop(); } catch {}
          });
          return;
        }
        streamRef.current = stream;
        if (ref.current) ref.current.srcObject = stream;
      })
      .catch(() => {});

    return () => { cancelled = true; stop(); };
  }, [deviceId]);

  return <video ref={ref} className="camera-preview-video" autoPlay playsInline muted />;
}
