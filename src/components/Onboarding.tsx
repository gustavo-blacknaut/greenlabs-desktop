import { useState } from 'react';

import AvisoServidor from '@/components/AvisoServidor';
import { normalizarServidor } from '@/lib/format';
import { SALA_PADRAO } from '@/lib/preferences';

interface Props {
  /** Recebe os tres ja limpos e com o servidor normalizado. */
  aoConcluir(dados: { nome: string; servidor: string; sala: string }): void;
}

/**
 * Primeira abertura: nome, servidor e sala.
 *
 * Gravar as preferencias NAO acontece aqui - quem faz e o App, pelo
 * usePreferences. Antes esta tela escrevia direto no localStorage com quatro
 * setItem na mao, em paralelo ao estado do React, e as duas coisas saiam de
 * sincronia.
 */
export default function Onboarding({ aoConcluir }: Props) {
  const [nome, setNome] = useState('');
  const [servidor, setServidor] = useState('');
  const [sala, setSala] = useState(SALA_PADRAO);

  const podeComecar = nome.trim().length > 0 && servidor.trim().length > 0;

  const concluir = () => {
    const url = normalizarServidor(servidor);
    if (!url || !nome.trim()) return;
    aoConcluir({ nome: nome.trim(), servidor: url, sala: sala.trim() || SALA_PADRAO });
  };

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div className="onboarding-head">
          <img src="./logo.png" alt="GreenLabs" className="onboarding-logo" />
          <h2>Bem-vindo ao GreenLabs</h2>
          <p>Configure seu nome e o servidor para começar.</p>
        </div>

        <label>
          Seu nome
          <input
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            placeholder="Como você aparece para os outros"
            autoFocus
          />
        </label>

        <div className="split-fields">
          <label>
            Servidor
            <input
              value={servidor}
              onChange={(evento) => setServidor(evento.target.value)}
              placeholder="ex: 127.0.0.1:25640"
            />
          </label>
          <label>
            Sala
            <input
              value={sala}
              onChange={(evento) => setSala(evento.target.value)}
              placeholder={SALA_PADRAO}
            />
          </label>
        </div>

        <AvisoServidor />

        <p className="hint">
          Pode digitar com ou sem <code>ws://</code>
          {servidor.trim() ? (
            <>
              {' — vai conectar em '}
              <strong>{normalizarServidor(servidor)}</strong>
            </>
          ) : null}
        </p>

        <button className="primary full-btn" disabled={!podeComecar} onClick={concluir}>
          Começar
        </button>
      </div>
    </div>
  );
}
