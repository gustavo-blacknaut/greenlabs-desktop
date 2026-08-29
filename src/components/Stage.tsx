import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';

import ZoomPane from '@/components/ZoomPane';
import { VideoPlayer, VisualOculto } from '@/components/VideoPlayer';
import {
  CameraIcon,
  ExpandIcon,
  EyeIcon,
  EyeOffIcon,
  MonitorIcon,
  ShrinkIcon,
  UsersIcon,
} from '@/icons';
import type { IdDeCartao, Transmissao } from '@/types/domain';

interface Props {
  /** Ja recortadas para o numero de divisoes escolhido. */
  visiveis: Transmissao[];
  divisoes: number;
  ativaId: IdDeCartao | null;

  painelEncolhido: boolean;
  aoExpandirPainel(): void;

  emTelaCheia: boolean;
  aoAlternarTelaCheia(): void;

  aoEscolher(id: IdDeCartao): void;
  aoAlternarOculta(id: IdDeCartao): void;

  ancora: RefObject<HTMLDivElement | null>;
}

/**
 * O conteudo de um quadro do palco.
 *
 * A propria tela transmitida NAO e reproduzida com som nem imagem viva por
 * cima: ver e ouvir a si mesmo produz eco e aquele tunel infinito de tela
 * dentro de tela. Por isso ela ganha uma capa explicando o motivo.
 */
function ConteudoDoQuadro({
  item,
  aoAlternarOculta,
}: {
  item: Transmissao;
  aoAlternarOculta(id: IdDeCartao): void;
}) {
  if (item.oculta) {
    return (
      <VisualOculto
        rotulo="Você ocultou essa prévia"
        aoMostrar={() => aoAlternarOculta(item.id)}
      />
    );
  }

  const minhaPropriaTela = item.local && item.tipo === 'screen';
  if (minhaPropriaTela) {
    return (
      <div className="own-screen-preview">
        <VideoPlayer stream={item.stream} mudo volume={0} className="tile-video" />
        <div className="own-screen-overlay">
          <MonitorIcon size={26} />
          <strong>Sua tela está sendo transmitida</strong>
          <span>Você não vê nem ouve a própria tela, para evitar eco</span>
        </div>
      </div>
    );
  }

  return (
    <VideoPlayer
      stream={item.stream}
      mudo={item.local}
      volume={item.volume}
      className="tile-video"
    />
  );
}

export default function Stage({
  visiveis,
  divisoes,
  ativaId,
  painelEncolhido,
  aoExpandirPainel,
  emTelaCheia,
  aoAlternarTelaCheia,
  aoEscolher,
  aoAlternarOculta,
  ancora,
}: Props) {
  const vazios = Math.max(0, divisoes - visiveis.length);

  return (
    <div className="stage" ref={ancora}>
      {painelEncolhido && (
        <button className="panel-reopen" title="Expandir painel" onClick={aoExpandirPainel}>
          <UsersIcon size={14} /> Painel
        </button>
      )}

      {visiveis.length === 0 ? (
        <div className="stage-empty">
          <MonitorIcon size={34} />
          <strong>Nenhuma transmissão ativa</strong>
          <span>Clique em transmitir tela para começar</span>
        </div>
      ) : (
        <div className="stage-grid" data-count={visiveis.length} data-slots={divisoes}>
          {visiveis.map((item) => (
            <div
              key={item.id}
              className={`grid-tile ${ativaId === item.id ? 'focused' : ''}`}
              onClick={() => aoEscolher(item.id)}
            >
              {/* O resetKey zera o zoom ao trocar de transmissao: o
                  enquadramento da anterior nao vale para a nova. */}
              <ZoomPane resetKey={item.id}>
                <ConteudoDoQuadro item={item} aoAlternarOculta={aoAlternarOculta} />
              </ZoomPane>

              <div className="tile-footer">
                <span className="tile-badge">
                  {item.tipo === 'camera' ? <CameraIcon size={11} /> : <MonitorIcon size={11} />}
                </span>
                <span className="tile-name">
                  {item.nome}
                  {item.local ? ' · Você' : ''}
                </span>
              </div>

              <div className="tile-actions">
                <button
                  className="icon-btn xs"
                  title={item.oculta ? 'Mostrar' : 'Ocultar'}
                  onClick={(evento: ReactMouseEvent) => {
                    evento.stopPropagation();
                    aoAlternarOculta(item.id);
                  }}
                >
                  {item.oculta ? <EyeOffIcon size={13} /> : <EyeIcon size={13} />}
                </button>
                <button
                  className="icon-btn xs"
                  title={emTelaCheia ? 'Sair da tela cheia' : 'Expandir'}
                  onClick={(evento: ReactMouseEvent) => {
                    evento.stopPropagation();
                    aoAlternarTelaCheia();
                  }}
                >
                  {emTelaCheia ? <ShrinkIcon size={13} /> : <ExpandIcon size={13} />}
                </button>
              </div>
            </div>
          ))}

          {/* Quadros livres mantem a grade estavel: sem eles, a unica
              transmissao pularia de tamanho a cada pessoa que entra. */}
          {Array.from({ length: vazios }).map((_, indice) => (
            <div className="grid-tile empty" key={`livre-${indice}`}>
              <MonitorIcon size={22} />
              <span>Slot livre</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
