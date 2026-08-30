import type { MouseEvent as ReactMouseEvent } from 'react';
import { useState } from 'react';

import CameraPreview from '@/components/CameraPreview';
import { CameraIcon, CloseIcon } from '@/icons';

interface Props {
  aparelhos: MediaDeviceInfo[];
  aoConfirmar(deviceId: string): void;
  aoCancelar(): void;
}

/**
 * Escolha da camera, com previa antes de transmitir.
 *
 * O aparelho escolhido e estado local: so importa enquanto o modal esta
 * aberto, e subir isso para o App faria a arvore inteira redesenhar a cada
 * troca no seletor.
 */
export default function CameraPicker({ aparelhos, aoConfirmar, aoCancelar }: Props) {
  const [escolhido, setEscolhido] = useState(aparelhos[0]?.deviceId ?? '');

  const naoPropagar = (evento: ReactMouseEvent) => evento.stopPropagation();

  return (
    <div className="picker-overlay" onClick={aoCancelar}>
      <div className="picker-modal" onClick={naoPropagar}>
        <div className="modal-head">
          <div className="modal-head-text">
            <span className="modal-head-icon">
              <CameraIcon size={19} />
            </span>
            <div>
              <h3>Escolher câmera</h3>
              <p>Veja a prévia antes de transmitir.</p>
            </div>
          </div>
          <button className="icon-btn" onClick={aoCancelar}>
            <CloseIcon size={17} />
          </button>
        </div>

        <div className="modal-body camera-body">
          <div className="camera-preview-wrap">
            <CameraPreview deviceId={escolhido} />
          </div>

          <label>
            Câmera
            <select
              className="styled-select"
              value={escolhido}
              onChange={(evento) => setEscolhido(evento.target.value)}
            >
              {aparelhos.map((aparelho, indice) => (
                <option key={aparelho.deviceId || indice} value={aparelho.deviceId}>
                  {/* O rotulo so vem depois da permissao concedida. */}
                  {aparelho.label || `Câmera ${indice + 1}`}
                </option>
              ))}
            </select>
          </label>

          <p className="hint">A câmera é transmitida sem áudio.</p>
        </div>

        <div className="modal-foot">
          <button className="primary full-btn" onClick={() => aoConfirmar(escolhido)}>
            <CameraIcon size={15} /> Transmitir câmera
          </button>
        </div>
      </div>
    </div>
  );
}
