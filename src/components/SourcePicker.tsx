import type { MouseEvent as ReactMouseEvent } from 'react';
import { useState } from 'react';

import { CameraIcon, CloseIcon, MonitorIcon } from '@/icons';
import type { FonteDeTela, IdDeFonte } from '@/types/bridge';

type Aba = 'telas' | 'janelas';

interface Props {
  fontes: FonteDeTela[];
  comAudio: boolean;
  aoAlternarAudio(): void;
  aoEscolher(id: IdDeFonte): void;
  aoCancelar(): void;
}

/**
 * Escolha do que transmitir, separada entre telas inteiras e janelas.
 *
 * O Electron devolve as duas categorias na mesma lista, e o `id` e a unica
 * coisa que as separa: fonte de tela comeca com "screen:".
 */
export default function SourcePicker({
  fontes,
  comAudio,
  aoAlternarAudio,
  aoEscolher,
  aoCancelar,
}: Props) {
  const [aba, setAba] = useState<Aba>('telas');

  const telas = fontes.filter((f) => f.id.startsWith('screen:'));
  const janelas = fontes.filter((f) => !f.id.startsWith('screen:'));
  const visiveis = aba === 'telas' ? telas : janelas;

  // Sem isto, clicar dentro do modal fecharia junto com o clique no fundo.
  const naoPropagar = (evento: ReactMouseEvent) => evento.stopPropagation();

  return (
    <div className="picker-overlay" onClick={aoCancelar}>
      <div className="picker-modal wide" onClick={naoPropagar}>
        <div className="modal-head">
          <div className="modal-head-text">
            <span className="modal-head-icon">
              <MonitorIcon size={19} />
            </span>
            <div>
              <h3>Escolha o que transmitir</h3>
              <p>Separado entre telas inteiras e janelas de aplicativos.</p>
            </div>
          </div>
          <button className="icon-btn" onClick={aoCancelar}>
            <CloseIcon size={17} />
          </button>
        </div>

        <div className="tab-row">
          <button
            className={`tab-btn ${aba === 'telas' ? 'active' : ''}`}
            onClick={() => setAba('telas')}
          >
            <MonitorIcon size={15} /> <span>Telas ({telas.length})</span>
          </button>
          <button
            className={`tab-btn ${aba === 'janelas' ? 'active' : ''}`}
            onClick={() => setAba('janelas')}
          >
            <CameraIcon size={15} /> <span>Aplicativos ({janelas.length})</span>
          </button>
        </div>

        <div className="modal-body">
          <div className="picker-grid">
            {visiveis.map((fonte) => (
              <button
                key={fonte.id}
                className="picker-card"
                onClick={() => aoEscolher(fonte.id)}
              >
                <img src={fonte.thumbnail} alt={fonte.name} />
                <span>{fonte.name}</span>
              </button>
            ))}
            {visiveis.length === 0 && (
              <div className="empty-list">Nada encontrado nessa categoria.</div>
            )}
          </div>

          <div className="audio-option">
            <label className="check-row" onClick={aoAlternarAudio}>
              <span className={`switch ${comAudio ? 'on' : ''}`} />
              Compartilhar áudio junto com a tela
            </label>
            <p className="hint">
              {comAudio
                ? 'O áudio do sistema vai junto, sem o Discord.'
                : 'Transmissão só de vídeo, sem nenhum áudio do seu PC.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
