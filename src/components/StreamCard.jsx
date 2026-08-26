import React from 'react';
import { CameraIcon, CloseIcon, EyeIcon, EyeOffIcon, MonitorIcon } from '../icons.jsx';
import { HiddenVisual, VideoPlayer } from './VideoPlayer.jsx';

const PASSO_DA_RODA = 0.05;

// Ocultar e encerrar aparecem nos dois formatos do cartão - ao lado do nome
// quando é câmera, no rodapé quando tem volume para mostrar.
function AcoesDoCartao({ item, onStop, onToggleHidden }) {
  return (
    <div className="card-actions-group">
      <button
        className="icon-btn sm"
        title={item.hidden ? 'Mostrar essa prévia' : 'Ocultar essa prévia'}
        onClick={(event) => { event.stopPropagation(); onToggleHidden(item.id); }}
      >
        {item.hidden ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
      </button>
      {item.local && (
        <button
          className="icon-btn sm stop"
          title="Encerrar transmissão"
          onClick={(event) => { event.stopPropagation(); onStop(item.id); }}
        >
          <CloseIcon size={15} />
        </button>
      )}
    </div>
  );
}

function Selo({ kind, comTexto }) {
  const Icone = kind === 'camera' ? CameraIcon : MonitorIcon;
  return (
    <span className={`badge ${kind}`}>
      <Icone size={12} />
      {comTexto && (kind === 'camera' ? 'Camera' : 'Tela')}
    </span>
  );
}

export default function StreamCard({
  item, active, collapsed, onSelect, onStop, onVolumeChange, onToggleHidden,
}) {
  const owner = item.local ? 'Você' : item.ownerName;
  const isCamera = item.kind === 'camera';
  const qualityLabel = item.quality
    ? `${item.quality.width}x${item.quality.height} ${item.quality.fps}fps`
    : '';

  const abrir = () => onSelect(item.id);
  const abrirComEnter = (e) => { if (e.key === 'Enter') abrir(); };

  const handleWheel = (event) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? PASSO_DA_RODA : -PASSO_DA_RODA;
    const nextVol = Math.max(0, Math.min(1, Math.round((item.volume + delta) * 100) / 100));
    onVolumeChange(item.id, nextVol);
  };

  const classes = `stream-card ${active ? 'active' : ''} ${item.hidden ? 'is-hidden' : ''}`;

  if (collapsed) {
    return (
      <div className={`${classes} mini`} onClick={abrir} role="button" tabIndex={0} title={item.name} onKeyDown={abrirComEnter}>
        <div className="thumb-wrap">
          {item.hidden || active
            ? <HiddenVisual label={active ? 'No palco' : ''} />
            : <VideoPlayer stream={item.stream} muted volume={0} />}
          <Selo kind={item.kind} />
        </div>
      </div>
    );
  }

  return (
    <div className={classes} onClick={abrir} role="button" tabIndex={0} onKeyDown={abrirComEnter}>
      <div className="thumb-wrap">
        {item.hidden ? (
          <HiddenVisual label="Oculto" />
        ) : active ? (
          <div className="hidden-visual active-badge-visual">
            <MonitorIcon size={24} />
            <span>Exibindo no palco</span>
          </div>
        ) : (
          <VideoPlayer stream={item.stream} muted volume={0} />
        )}
        <Selo kind={item.kind} comTexto />
        {item.hidden && (
          <span className="badge-hidden" title="Oculto para você">
            <EyeOffIcon size={13} />
          </span>
        )}
      </div>

      <div className="stream-info">
        <div className="stream-info-text">
          <strong>{item.name}</strong>
          <span>{owner}{qualityLabel ? ` • ${qualityLabel}` : ''}</span>
        </div>
        {/* Câmera não tem áudio, então sem linha de volume: as ações sobem para cá. */}
        {isCamera && <AcoesDoCartao item={item} onStop={onStop} onToggleHidden={onToggleHidden} />}
      </div>

      {!isCamera && (
        <div className="stream-card-footer">
          <label
            className="volume"
            onClick={(event) => event.stopPropagation()}
            onWheel={handleWheel}
            title="Gire o scroll do mouse para ajustar o volume"
          >
            Vol {Math.round(item.volume * 100)}%
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={item.volume}
              onChange={(event) => onVolumeChange(item.id, Number(event.target.value))}
            />
          </label>
          <AcoesDoCartao item={item} onStop={onStop} onToggleHidden={onToggleHidden} />
        </div>
      )}
    </div>
  );
}
