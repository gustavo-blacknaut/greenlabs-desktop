import StreamCard from '@/components/StreamCard';
import { ExpandIcon, MonitorIcon, ShrinkIcon, UsersIcon } from '@/icons';
import type { IdDeCartao, Participante, Transmissao } from '@/types/domain';

export interface PessoaNaLista {
  chave: string;
  nome: string;
  souEu: boolean;
  pingMs: number;
}

interface Props {
  transmissoes: Transmissao[];
  pessoas: PessoaNaLista[];
  ativaId: IdDeCartao | null;

  encolhido: boolean;
  aoAlternarEncolhido(): void;

  aoEscolher(id: IdDeCartao): void;
  aoEncerrar(id: IdDeCartao): void;
  aoMudarVolume(id: IdDeCartao, volume: number): void;
  aoAlternarOculta(id: IdDeCartao): void;
}

/** Monta a lista de pessoas a partir de quem esta na sala mais eu mesmo. */
export function montarPessoas(
  participantes: Participante[],
  meuNome: string,
  meuPing: number,
  pingsDaSala: Record<string, number>,
): PessoaNaLista[] {
  return [
    { chave: 'eu', nome: meuNome || 'Você', souEu: true, pingMs: meuPing },
    ...participantes.map((p) => ({
      chave: p.parId,
      nome: p.nomeExibido ?? p.nome,
      souEu: false,
      pingMs: pingsDaSala[p.parId] ?? 0,
    })),
  ];
}

export default function SidePanel({
  transmissoes,
  pessoas,
  ativaId,
  encolhido,
  aoAlternarEncolhido,
  aoEscolher,
  aoEncerrar,
  aoMudarVolume,
  aoAlternarOculta,
}: Props) {
  return (
    <aside className={`streams-panel dual-section ${encolhido ? 'collapsed' : ''}`}>
      <div className="side-header">
        <span className="eyebrow">{encolhido ? '' : 'Painel de controle'}</span>
        <div className="side-header-actions">
          <button
            className="icon-btn collapse-toggle-btn"
            title={encolhido ? 'Expandir painel' : 'Minimizar painel'}
            onClick={aoAlternarEncolhido}
          >
            {encolhido ? <ExpandIcon size={16} /> : <ShrinkIcon size={16} />}
          </button>
        </div>
      </div>

      {encolhido ? (
        // Encolhido vira duas pastilhas com contador: cabe numa faixa estreita
        // e ainda diz quanta coisa esta acontecendo.
        <div className="collapsed-pill-stack">
          <button
            className="collapsed-pill-btn"
            onClick={aoAlternarEncolhido}
            title={`Transmissões (${transmissoes.length})`}
          >
            <MonitorIcon size={18} />
            <span className="pill-badge">{transmissoes.length}</span>
          </button>
          <button
            className="collapsed-pill-btn"
            onClick={aoAlternarEncolhido}
            title={`Pessoas (${pessoas.length})`}
          >
            <UsersIcon size={18} />
            <span className="pill-badge">{pessoas.length}</span>
          </button>
        </div>
      ) : (
        <div className="panel-sections-wrapper">
          <section className="side-sub-section streams-section">
            <div className="section-title-bar">
              <MonitorIcon size={14} />
              <span>Transmissões ({transmissoes.length})</span>
            </div>
            <div className="stream-list scrollable-area">
              {transmissoes.length === 0 ? (
                <div className="empty-list">Nenhuma transmissão ativa no momento.</div>
              ) : (
                transmissoes.map((item) => (
                  <StreamCard
                    key={item.id}
                    item={item}
                    ativo={ativaId === item.id}
                    encolhido={false}
                    aoEscolher={aoEscolher}
                    aoEncerrar={aoEncerrar}
                    aoMudarVolume={aoMudarVolume}
                    aoAlternarOculta={aoAlternarOculta}
                  />
                ))
              )}
            </div>
          </section>

          <section className="side-sub-section users-section">
            <div className="section-title-bar">
              <UsersIcon size={14} />
              <span>Pessoas ({pessoas.length})</span>
            </div>
            <div className="user-list scrollable-area">
              {pessoas.map((pessoa) => (
                <div className="user-row-card" key={pessoa.chave}>
                  <div className="user-avatar-circle">
                    {pessoa.nome.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="user-name-label">
                    <strong>{pessoa.nome}</strong>
                    {pessoa.souEu && <span className="tag-you">(Você)</span>}
                  </div>
                  {pessoa.pingMs > 0 && (
                    <div className="user-ping-pill" title={`Ping: ${pessoa.pingMs}ms`}>
                      {pessoa.pingMs}ms
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </aside>
  );
}
