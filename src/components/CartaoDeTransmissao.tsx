import type { MouseEvent as ReactMouseEvent, WheelEvent as ReactWheelEvent } from 'react';

import { CameraIcon, CloseIcon, EyeIcon, EyeOffIcon, MonitorIcon } from '@/icons';
import { VideoPlayer, VisualOculto } from '@/components/VideoPlayer';
import type { IdDeCartao, TipoDeTransmissao, Transmissao } from '@/tipos/dominio';

const PASSO_DA_RODA = 0.05;

interface PropsDasAcoes {
  item: Transmissao;
  aoEncerrar(id: IdDeCartao): void;
  aoAlternarOculta(id: IdDeCartao): void;
}

/**
 * Ocultar e encerrar.
 *
 * Aparecem em dois lugares do cartao - ao lado do nome quando e camera, no
 * rodape quando ha volume para mostrar - e por isso sao um componente so.
 */
function AcoesDoCartao({ item, aoEncerrar, aoAlternarOculta }: PropsDasAcoes) {
  return (
    <div className="card-actions-group">
      <button
        className="icon-btn sm"
        title={item.oculta ? 'Mostrar essa prévia' : 'Ocultar essa prévia'}
        onClick={(evento) => {
          evento.stopPropagation();
          aoAlternarOculta(item.id);
        }}
      >
        {item.oculta ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
      </button>

      {/* So a minha propria transmissao pode ser encerrada por mim. */}
      {item.local && (
        <button
          className="icon-btn sm stop"
          title="Encerrar transmissão"
          onClick={(evento) => {
            evento.stopPropagation();
            aoEncerrar(item.id);
          }}
        >
          <CloseIcon size={15} />
        </button>
      )}
    </div>
  );
}

function Selo({ tipo, comTexto }: { tipo: TipoDeTransmissao; comTexto?: boolean }) {
  const Icone = tipo === 'camera' ? CameraIcon : MonitorIcon;
  return (
    <span className={`badge ${tipo}`}>
      <Icone size={12} />
      {comTexto && (tipo === 'camera' ? 'Camera' : 'Tela')}
    </span>
  );
}

interface PropsDoCartao {
  item: Transmissao;
  ativo: boolean;
  encolhido: boolean;
  aoEscolher(id: IdDeCartao): void;
  aoEncerrar(id: IdDeCartao): void;
  aoMudarVolume(id: IdDeCartao, volume: number): void;
  aoAlternarOculta(id: IdDeCartao): void;
}

export default function CartaoDeTransmissao({
  item,
  ativo,
  encolhido,
  aoEscolher,
  aoEncerrar,
  aoMudarVolume,
  aoAlternarOculta,
}: PropsDoCartao) {
  const dono = item.local ? 'Você' : item.nomeDoDono;
  const eCamera = item.tipo === 'camera';
  const resolucao = item.qualidade
    ? `${item.qualidade.largura}x${item.qualidade.altura} ${item.qualidade.fps}fps`
    : '';

  const abrir = () => aoEscolher(item.id);

  const naRoda = (evento: ReactWheelEvent<HTMLLabelElement>) => {
    evento.preventDefault();
    const passo = evento.deltaY < 0 ? PASSO_DA_RODA : -PASSO_DA_RODA;
    aoMudarVolume(item.id, Math.round((item.volume + passo) * 100) / 100);
  };

  const classes = `stream-card ${ativo ? 'active' : ''} ${item.oculta ? 'is-hidden' : ''}`;

  // Encolhido: so a miniatura, para a coluna caber quando ha muita gente.
  if (encolhido) {
    return (
      <div
        className={`${classes} mini`}
        onClick={abrir}
        role="button"
        tabIndex={0}
        title={item.nome}
        onKeyDown={(evento) => {
          if (evento.key === 'Enter') abrir();
        }}
      >
        <div className="thumb-wrap">
          {item.oculta || ativo ? (
            <VisualOculto rotulo={ativo ? 'No palco' : ''} />
          ) : (
            <VideoPlayer stream={item.stream} mudo volume={0} />
          )}
          <Selo tipo={item.tipo} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={classes}
      onClick={abrir}
      role="button"
      tabIndex={0}
      onKeyDown={(evento) => {
        if (evento.key === 'Enter') abrir();
      }}
    >
      <div className="thumb-wrap">
        {item.oculta ? (
          <VisualOculto rotulo="Oculto" />
        ) : ativo ? (
          // Quem esta no palco nao e desenhado duas vezes: decodificar a mesma
          // imagem em dois lugares custa o dobro sem mostrar nada de novo.
          <div className="hidden-visual active-badge-visual">
            <MonitorIcon size={24} />
            <span>Exibindo no palco</span>
          </div>
        ) : (
          <VideoPlayer stream={item.stream} mudo volume={0} />
        )}

        <Selo tipo={item.tipo} comTexto />
        {item.oculta && (
          <span className="badge-hidden" title="Oculto para você">
            <EyeOffIcon size={13} />
          </span>
        )}
      </div>

      <div className="stream-info">
        <div className="stream-info-text">
          <strong>{item.nome}</strong>
          <span>
            {dono}
            {resolucao ? ` • ${resolucao}` : ''}
          </span>
        </div>

        {/* Camera nao tem audio, entao nao ha linha de volume: as acoes sobem. */}
        {eCamera && (
          <AcoesDoCartao
            item={item}
            aoEncerrar={aoEncerrar}
            aoAlternarOculta={aoAlternarOculta}
          />
        )}
      </div>

      {!eCamera && (
        <div className="stream-card-footer">
          <label
            className="volume"
            onClick={(evento: ReactMouseEvent) => evento.stopPropagation()}
            onWheel={naRoda}
            title="Gire o scroll do mouse para ajustar o volume"
          >
            Vol {Math.round(item.volume * 100)}%
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={item.volume}
              onChange={(evento) => aoMudarVolume(item.id, Number(evento.target.value))}
            />
          </label>

          <AcoesDoCartao
            item={item}
            aoEncerrar={aoEncerrar}
            aoAlternarOculta={aoAlternarOculta}
          />
        </div>
      )}
    </div>
  );
}
