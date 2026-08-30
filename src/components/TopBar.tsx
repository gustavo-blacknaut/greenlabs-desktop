import {
  CameraIcon,
  GearIcon,
  GridIcon,
  LogOutIcon,
  MonitorIcon,
  PlugIcon,
  SingleIcon,
  SplitIcon,
} from '@/icons';

/** As tres divisoes possiveis do palco. */
const DIVISOES = [
  { quantas: 1, Icone: SingleIcon, titulo: '1 tela' },
  { quantas: 2, Icone: SplitIcon, titulo: '2 telas' },
  { quantas: 4, Icone: GridIcon, titulo: '4 telas' },
] as const;

interface Props {
  conectado: boolean;
  sala: string;
  pessoas: number;
  pingMs: number;

  divisoes: number;
  aoMudarDivisoes(quantas: number): void;

  podeTransmitirTela: boolean;
  aoTransmitirTela(): void;
  aoAdicionarCamera(): void;
  aoAbrirConfiguracao(): void;
  aoEntrar(): void;
  aoSair(): void;
}

export default function TopBar({
  conectado,
  sala,
  pessoas,
  pingMs,
  divisoes,
  aoMudarDivisoes,
  podeTransmitirTela,
  aoTransmitirTela,
  aoAdicionarCamera,
  aoAbrirConfiguracao,
  aoEntrar,
  aoSair,
}: Props) {
  return (
    <header className="call-topbar compact">
      <div className="topbar-title">
        <div className="brand-badge-only-logo" title="GreenLabs">
          <img src="./logo.png" alt="GreenLabs" className="brand-logo-img" />
        </div>

        <div className="compact-status">
          <span className={`compact-dot ${conectado ? 'online' : ''}`} />
          <strong className="compact-text">
            {conectado ? `Conectado em ${sala} (${pessoas})` : 'Desconectado'}
          </strong>
        </div>
      </div>

      <div className="actions">
        <div className="mini-ping" title="Ping em tempo real">
          <span className={`mini-ping-dot ${conectado && pingMs > 0 ? 'online' : ''}`} />
          <span>{pingMs > 0 ? `${pingMs}ms` : '0ms'}</span>
        </div>

        {conectado ? (
          <button
            className="icon-btn-only connected-exit sm"
            onClick={aoSair}
            title="Sair da sala"
          >
            <LogOutIcon size={16} />
          </button>
        ) : (
          <button
            className="primary icon-btn-only sm"
            onClick={aoEntrar}
            title="Entrar na sala"
          >
            <PlugIcon size={16} />
          </button>
        )}

        <div className="layout-picker" role="group" aria-label="Divisão de tela">
          {DIVISOES.map(({ quantas, Icone, titulo }) => (
            <button
              key={quantas}
              className={`layout-btn ${divisoes === quantas ? 'active' : ''}`}
              title={titulo}
              onClick={() => aoMudarDivisoes(quantas)}
            >
              <Icone size={15} />
            </button>
          ))}
        </div>

        {/* No Android nao existe getDisplayMedia; o botao so aparece onde ha
            algum caminho de captura de tela. */}
        {podeTransmitirTela && (
          <button
            className="ghost icon-btn-only sm"
            onClick={aoTransmitirTela}
            title="Transmitir tela"
          >
            <MonitorIcon size={16} />
          </button>
        )}

        <button
          className="ghost icon-btn-only sm"
          onClick={aoAdicionarCamera}
          title="Adicionar câmera"
        >
          <CameraIcon size={16} />
        </button>

        <button
          className="icon-btn-only sm"
          onClick={aoAbrirConfiguracao}
          title="Configuração"
        >
          <GearIcon size={17} />
        </button>
      </div>
    </header>
  );
}
