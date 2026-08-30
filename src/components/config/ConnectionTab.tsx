import AvisoServidor from '@/components/AvisoServidor';
import { CameraIcon, CheckIcon, StarIcon } from '@/icons';
import { QUALIDADES } from '@/lib/media';
import type { Preferencias } from '@/lib/preferences';
import type { ProcessoEmExecucao } from '@/types/bridge';

interface Props {
  preferencias: Preferencias;
  definir<C extends keyof Preferencias>(chave: C, valor: Preferencias[C]): void;

  servidor: string;
  aoMudarServidor(valor: string): void;
  sala: string;
  aoMudarSala(valor: string): void;
  qualidadeId: string;
  aoMudarQualidade(id: string): void;

  processos: ProcessoEmExecucao[];
  aoSalvarComoPadrao(): void;
  aoRestaurarFabrica(): void;
}

export default function ConnectionTab({
  preferencias,
  definir,
  servidor,
  aoMudarServidor,
  sala,
  aoMudarSala,
  qualidadeId,
  aoMudarQualidade,
  processos,
  aoSalvarComoPadrao,
  aoRestaurarFabrica,
}: Props) {
  const listaAtual = preferencias.aplicativosExcluidos;
  const ehWhitelist = preferencias.modoDeFiltro === 'whitelist';

  /** Marca ou desmarca um programa na lista, mexendo no texto que ja existe. */
  const alternarPrograma = (nome: string) => {
    const partes = listaAtual
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const jaEsta = partes.some((p) => p.toLowerCase() === nome.toLowerCase());

    const novas = jaEsta
      ? partes.filter((p) => p.toLowerCase() !== nome.toLowerCase())
      : [...partes, nome];

    definir('aplicativosExcluidos', novas.join(', '));
  };

  return (
    <div className="field-grid">
      <label>
        Seu nome
        <input
          value={preferencias.nome}
          onChange={(evento) => definir('nome', evento.target.value)}
          placeholder="Digite seu nome…"
        />
      </label>

      <label>
        Servidor
        <input
          value={servidor}
          onChange={(evento) => aoMudarServidor(evento.target.value)}
          placeholder="localhost:25640"
        />
      </label>

      <AvisoServidor />

      <div className="split-fields">
        <label>
          Sala
          <input value={sala} onChange={(evento) => aoMudarSala(evento.target.value)} />
        </label>
        <label>
          Qualidade da tela
          <select
            className="styled-select"
            value={qualidadeId}
            onChange={(evento) => aoMudarQualidade(evento.target.value)}
          >
            {QUALIDADES.map((q) => (
              <option key={q.id} value={q.id}>
                {q.rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      <hr className="divider" />

      <label>
        O que os outros ouvem
        <select
          className="styled-select"
          value={preferencias.modoDeFiltro}
          // Comparacao explicita em vez de `as`: a lista de opcoes e o tipo
          // podem divergir, e um `as` esconderia isso ate virar valor invalido
          // gravado no localStorage.
          onChange={(evento) =>
            definir(
              'modoDeFiltro',
              evento.target.value === 'whitelist' ? 'whitelist' : 'blacklist',
            )
          }
        >
          <option value="blacklist">Tudo, menos os programas que eu escolher</option>
          <option value="whitelist">Só os programas que eu escolher</option>
        </select>
      </label>

      {processos.length > 0 && (
        <div className="process-selector-wrap">
          <div className="block-title">
            <CameraIcon size={14} />{' '}
            <span>Programas abertos agora ({processos.length})</span>
          </div>
          <div className="process-chips-grid scrollable-area">
            {processos.map((processo) => {
              const marcado = listaAtual.toLowerCase().includes(processo.name.toLowerCase());
              return (
                <button
                  key={processo.name}
                  type="button"
                  className={`process-chip ${marcado ? 'active-excluded' : ''}`}
                  onClick={() => alternarPrograma(processo.name)}
                >
                  <span className={`chip-check ${marcado ? 'checked' : ''}`}>
                    {marcado ? <CheckIcon size={12} /> : null}
                  </span>
                  <span className="chip-name">{processo.title || processo.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <label>
        {ehWhitelist ? 'Mandar só o som destes' : 'Não mandar o som destes'}
        <input
          value={listaAtual}
          onChange={(evento) => definir('aplicativosExcluidos', evento.target.value)}
          placeholder={ehWhitelist ? 'ex: chrome, vlc, jogo' : 'ex: discord, spotify, chrome'}
        />
      </label>

      <p className="hint">
        {ehWhitelist
          ? 'Só o som dos programas acima vai na transmissão. Todo o resto fica em silêncio pra quem assiste — inclusive chamadas.'
          : 'O som dos programas acima não vai na transmissão. Você continua ouvindo tudo normalmente.'}
      </p>

      <hr className="divider" />

      <label
        className="check-row"
        onClick={() => {
          const proximo = !preferencias.aceleracaoDeHardware;
          definir('aceleracaoDeHardware', proximo);
          window.greenlabsApp?.toggleHardwareAcceleration(proximo);
        }}
      >
        <span className={`switch ${preferencias.aceleracaoDeHardware ? 'on' : ''}`} />
        Usar a placa de vídeo
      </label>
      <p className="hint">
        Deixa o app mais leve. Desligue só se a imagem travar ou a tela piscar.
      </p>

      <hr className="divider" />

      <div className="config-actions">
        <button className="ghost" onClick={aoSalvarComoPadrao}>
          <StarIcon size={15} filled /> Salvar atual como padrão
        </button>
        <button className="ghost" onClick={aoRestaurarFabrica}>
          Restaurar fábrica
        </button>
      </div>
    </div>
  );
}
