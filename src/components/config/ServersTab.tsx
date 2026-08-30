import { useState } from 'react';

import { CloseIcon, PlugIcon, PlusIcon, ServerIcon, StarIcon } from '@/icons';
import { apenasDominio, normalizarServidor } from '@/lib/format';
import { SALA_PADRAO } from '@/lib/preferences';
import { novoId } from '@/lib/media';
import type { ServidorSalvo } from '@/types/domain';

interface Props {
  servidores: ServidorSalvo[];
  aoMudarLista(lista: ServidorSalvo[]): void;

  servidorAtual: string;
  salaAtual: string;
  servidorPadrao: string;
  salaPadrao: string;

  aoUsar(url: string, sala: string): void;
  aoDefinirPadrao(url: string, sala: string): void;
}

export default function ServersTab({
  servidores,
  aoMudarLista,
  servidorAtual,
  salaAtual,
  servidorPadrao,
  salaPadrao,
  aoUsar,
  aoDefinirPadrao,
}: Props) {
  const [novoEndereco, setNovoEndereco] = useState('');
  const [novaSala, setNovaSala] = useState('');
  const [novoRotulo, setNovoRotulo] = useState('');

  const adicionar = () => {
    const url = normalizarServidor(novoEndereco);
    if (!url) return;

    const sala = novaSala.trim() || SALA_PADRAO;
    aoMudarLista([
      ...servidores,
      { id: novoId(), url, sala, rotulo: novoRotulo.trim() || sala },
    ]);

    setNovoEndereco('');
    setNovaSala('');
    setNovoRotulo('');
  };

  return (
    <div className="field-grid">
      <div className="block-title">
        <ServerIcon size={15} /> <span>Servidores disponíveis</span>
      </div>

      <div className="server-list">
        {servidores.map((servidor, indice) => {
          // Compara so o dominio: `ws://x:1` e `x:1` sao o mesmo servidor, e
          // sem normalizar o cartao em uso nunca aparecia marcado.
          const emUso =
            apenasDominio(servidorAtual) === apenasDominio(servidor.url) &&
            salaAtual === servidor.sala;
          const ehPadrao =
            apenasDominio(servidorPadrao) === apenasDominio(servidor.url) &&
            salaPadrao === servidor.sala;

          return (
            <div
              key={servidor.id ?? `${servidor.url}:${servidor.sala}:${indice}`}
              className={`server-card-premium ${emUso ? 'active-server' : ''}`}
            >
              <div className="server-card-left">
                <div className="server-card-badge">
                  {emUso ? 'CONECTADO' : ehPadrao ? 'PADRÃO' : 'SALVO'}
                </div>
                <strong className="server-title">
                  {servidor.rotulo || apenasDominio(servidor.url)}
                </strong>
                <span className="server-url-sub">
                  {apenasDominio(servidor.url)} • sala {servidor.sala}
                </span>
              </div>

              <div className="server-card-right">
                <button
                  className={`ghost ${emUso ? 'active' : ''}`}
                  title="Usar este servidor agora"
                  onClick={() => aoUsar(servidor.url, servidor.sala)}
                >
                  <PlugIcon size={14} /> {emUso ? 'Em uso' : 'Conectar'}
                </button>

                <button
                  className={`icon-btn ${ehPadrao ? 'accent' : ''}`}
                  title={ehPadrao ? 'Servidor padrão atual' : 'Definir como padrão'}
                  onClick={() => aoDefinirPadrao(servidor.url, servidor.sala)}
                >
                  <StarIcon size={15} filled={ehPadrao} />
                </button>

                {/* Sem o ultimo a lista ficaria vazia e nao haveria como voltar. */}
                {servidores.length > 1 && (
                  <button
                    className="icon-btn stop"
                    title="Remover servidor"
                    onClick={() => aoMudarLista(servidores.filter((_, i) => i !== indice))}
                  >
                    <CloseIcon size={15} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <hr className="divider" />

      <div className="block-title">
        <PlusIcon size={15} /> <span>Adicionar novo servidor</span>
      </div>

      <div className="add-server-box">
        <div className="split-fields">
          <label>
            Endereço / IP
            <input
              placeholder="127.0.0.1:25640"
              value={novoEndereco}
              onChange={(evento) => setNovoEndereco(evento.target.value)}
            />
          </label>
          <label>
            Sala
            <input
              placeholder={`ex: ${SALA_PADRAO}`}
              value={novaSala}
              onChange={(evento) => setNovaSala(evento.target.value)}
            />
          </label>
        </div>

        <label>
          Nome do servidor (opcional)
          <input
            placeholder="ex: Servidor Principal"
            value={novoRotulo}
            onChange={(evento) => setNovoRotulo(evento.target.value)}
          />
        </label>

        <button className="primary full-btn" onClick={adicionar}>
          <PlusIcon size={16} /> Adicionar servidor
        </button>
      </div>
    </div>
  );
}
