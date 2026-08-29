import type { MouseEvent as ReactMouseEvent } from 'react';
import { useState } from 'react';

import ConnectionTab from '@/components/config/ConnectionTab';
import HostTab from '@/components/config/HostTab';
import ServersTab from '@/components/config/ServersTab';
import { CheckIcon, CloseIcon, GearIcon, PlugIcon, RadioIcon, ServerIcon } from '@/icons';
import type { UsoDeHospedagem } from '@/hooks/useHosting';
import type { Preferencias } from '@/lib/preferences';
import { dentroDoElectron } from '@/types/bridge';
import type { ProcessoEmExecucao } from '@/types/bridge';
import type { ServidorSalvo } from '@/types/domain';

type Aba = 'conexao' | 'hospedar' | 'servidores';

export interface PropsDaConfiguracao {
  preferencias: Preferencias;
  definir<C extends keyof Preferencias>(chave: C, valor: Preferencias[C]): void;

  servidor: string;
  aoMudarServidor(valor: string): void;
  sala: string;
  aoMudarSala(valor: string): void;
  qualidadeId: string;
  aoMudarQualidade(id: string): void;

  processos: ProcessoEmExecucao[];
  hospedagem: UsoDeHospedagem;
  copiado: string;
  aoCopiar(valor: string): void;

  aoSalvarComoPadrao(url: string, sala: string): void;
  aoRestaurarFabrica(): void;
  aoFechar(): void;
}

export default function ConfigModal(props: PropsDaConfiguracao) {
  const {
    preferencias,
    definir,
    servidor,
    aoMudarServidor,
    sala,
    aoMudarSala,
    aoSalvarComoPadrao,
    aoFechar,
  } = props;

  const [aba, setAba] = useState<Aba>('conexao');

  // A aba Hospedar so existe dentro do Electron: no navegador nao ha como abrir
  // porta, e mostrar um botao que nunca funciona e pior que nao mostrar.
  const podeHospedar = dentroDoElectron();

  const naoPropagar = (evento: ReactMouseEvent) => evento.stopPropagation();

  const trocarServidor = (url: string, novaSala: string) => {
    aoMudarServidor(url);
    aoMudarSala(novaSala);
    setAba('conexao');
  };

  return (
    <div className="picker-overlay" onClick={aoFechar}>
      <div className="picker-modal" onClick={naoPropagar}>
        <div className="modal-head">
          <div className="modal-head-text">
            <span className="modal-head-icon">
              <GearIcon size={19} />
            </span>
            <div>
              <h3>Configuração</h3>
              <p>Conexão, hospedagem e servidores salvos.</p>
            </div>
          </div>
          <button className="icon-btn" onClick={aoFechar}>
            <CloseIcon size={17} />
          </button>
        </div>

        <div className="tab-row">
          <button
            className={`tab-btn ${aba === 'conexao' ? 'active' : ''}`}
            onClick={() => setAba('conexao')}
          >
            <PlugIcon size={15} /> <span>Conexão</span>
          </button>
          {podeHospedar && (
            <button
              className={`tab-btn ${aba === 'hospedar' ? 'active' : ''}`}
              onClick={() => setAba('hospedar')}
            >
              <RadioIcon size={15} /> <span>Hospedar</span>
            </button>
          )}
          <button
            className={`tab-btn ${aba === 'servidores' ? 'active' : ''}`}
            onClick={() => setAba('servidores')}
          >
            <ServerIcon size={15} /> <span>Servidores</span>
          </button>
        </div>

        <div className="modal-body">
          {aba === 'conexao' && (
            <ConnectionTab
              preferencias={preferencias}
              definir={definir}
              servidor={servidor}
              aoMudarServidor={aoMudarServidor}
              sala={sala}
              aoMudarSala={aoMudarSala}
              qualidadeId={props.qualidadeId}
              aoMudarQualidade={props.aoMudarQualidade}
              processos={props.processos}
              aoSalvarComoPadrao={() => aoSalvarComoPadrao(servidor, sala)}
              aoRestaurarFabrica={props.aoRestaurarFabrica}
            />
          )}

          {aba === 'hospedar' && podeHospedar && (
            <HostTab
              hospedagem={props.hospedagem}
              porta={preferencias.portaDeHospedagem}
              aoMudarPorta={(porta) => definir('portaDeHospedagem', porta)}
              comTunel={preferencias.tunelDeHospedagem}
              aoAlternarTunel={() =>
                definir('tunelDeHospedagem', !preferencias.tunelDeHospedagem)
              }
              copiado={props.copiado}
              aoCopiar={props.aoCopiar}
              aoUsarEsteServidor={(url) => {
                aoMudarServidor(url);
                aoFechar();
              }}
            />
          )}

          {aba === 'servidores' && (
            <ServersTab
              servidores={preferencias.servidores}
              aoMudarLista={(lista: ServidorSalvo[]) => definir('servidores', lista)}
              servidorAtual={servidor}
              salaAtual={sala}
              servidorPadrao={preferencias.servidorPadrao}
              salaPadrao={preferencias.salaPadrao}
              aoUsar={trocarServidor}
              aoDefinirPadrao={aoSalvarComoPadrao}
            />
          )}
        </div>

        <div className="modal-footer">
          <button className="primary" onClick={aoFechar}>
            <CheckIcon size={16} /> Concluir
          </button>
        </div>
      </div>
    </div>
  );
}
