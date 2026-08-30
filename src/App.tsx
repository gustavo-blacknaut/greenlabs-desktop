// A tela inteira, montada a partir das pecas.
//
// Este arquivo NAO contem logica de WebRTC, de captura, de localStorage nem de
// IPC. Tudo isso mora nos hooks; aqui so se decide o que aparece e quem chama
// o que. Era um componente de 1522 linhas com 45 useState, e a maior parte
// disso nao era interface - era a chamada inteira embolada com o desenho.

import { useCallback, useEffect, useRef, useState } from 'react';

import AvisoServidor from '@/components/AvisoServidor';
import CameraPicker from '@/components/CameraPicker';
import ConfigModal from '@/components/config/ConfigModal';
import Onboarding from '@/components/Onboarding';
import SidePanel, { montarPessoas } from '@/components/SidePanel';
import SourcePicker from '@/components/SourcePicker';
import Stage from '@/components/Stage';
import TitleBar from '@/components/TitleBar';
import TopBar from '@/components/TopBar';

import { useChamada as useCall } from '@/hooks/useCall';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useHospedagem as useHosting } from '@/hooks/useHosting';
import { pararTelaAndroid, useLocalCapture } from '@/hooks/useLocalCapture';
import { usePreferencias as usePreferences } from '@/hooks/usePreferences';

import { CameraIcon, CloseIcon, GearIcon, LogOutIcon, MonitorIcon, PlugIcon, RadioIcon, SplitIcon, UsersIcon } from '@/icons';
import type { FonteDeTela, ProcessoEmExecucao } from '@/types/bridge';
import type { IdDeCartao } from '@/types/domain';

type AbaMovel = 'palco' | 'transmissoes' | 'usuarios';

const ABAS_MOVEIS = [
  { id: 'palco', rotulo: 'Telas', Icone: MonitorIcon },
  { id: 'transmissoes', rotulo: 'Transmissões', Icone: SplitIcon },
  { id: 'usuarios', rotulo: 'Pessoas', Icone: UsersIcon },
] as const satisfies readonly { id: AbaMovel; rotulo: string; Icone: unknown }[];

export default function App() {
  const { preferencias, definir, restaurarFabrica } = usePreferences();

  // Servidor e sala em uso agora, que podem diferir do padrao gravado: trocar
  // de servidor para uma chamada nao muda o que abre da proxima vez.
  const [servidor, setServidor] = useState(preferencias.servidorPadrao);
  const [sala, setSala] = useState(preferencias.salaPadrao);
  const [qualidadeId, setQualidadeId] = useState('1080p30');

  const [configAberta, setConfigAberta] = useState(false);
  const [fontes, setFontes] = useState<FonteDeTela[] | null>(null);
  const [processos, setProcessos] = useState<ProcessoEmExecucao[]>([]);
  const [painelEncolhido, setPainelEncolhido] = useState(false);
  const [abaMovel, setAbaMovel] = useState<AbaMovel>('palco');
  const [avisoAoVivo, setAvisoAoVivo] = useState(true);
  const [copiado, setCopiado] = useState('');

  const palco = useRef<HTMLDivElement>(null);
  const telaCheia = useFullscreen(palco);
  const hospedagem = useHosting();

  const chamada = useCall({
    nome: preferencias.nome,
    aoEncerrarTelaLocal: pararTelaAndroid,
  });
  const captura = useLocalCapture(chamada);

  // ------------------------------------------------------------------ efeitos

  // O Electron manda as fontes quando a pessoa pede para transmitir: quem abre
  // a janela de escolha e o processo principal, nao a interface.
  useEffect(() => {
    window.greenlabsPicker?.onPickSource(setFontes);
  }, []);

  // A lista de programas so interessa com a configuracao aberta, e le-la custa
  // uma chamada ao PowerShell.
  useEffect(() => {
    if (!configAberta) return;
    void window.greenlabsApp?.getRunningProcesses().then(setProcessos).catch(() => {});
  }, [configAberta]);

  // A acao "Sair da chamada" da notificacao do Android precisa chegar aqui
  // mesmo quando nao foi esta tela que iniciou a transmissao: a notificacao
  // sobrevive enquanto a captura existir.
  useEffect(() => {
    if (!window.greenlabsMobile) return;
    window.__glLeaveCall = chamada.desconectar;
    return () => {
      delete window.__glLeaveCall;
    };
  }, [chamada.desconectar]);

  // Fechar a janela sem soltar a captura deixa a webcam acesa e a notificacao
  // de gravacao no topo, mesmo com o app fora do ar.
  useEffect(() => {
    const aoFechar = () => {
      chamada.desconectar();
      pararTelaAndroid();
    };
    window.addEventListener('beforeunload', aoFechar);
    window.addEventListener('pagehide', aoFechar);
    return () => {
      window.removeEventListener('beforeunload', aoFechar);
      window.removeEventListener('pagehide', aoFechar);
    };
  }, [chamada.desconectar]);

  // O aviso de erro some sozinho: um banner vermelho parado na tela vira
  // parte do cenario e para de ser lido.
  useEffect(() => {
    if (!captura.erro) return;
    const t = setTimeout(captura.limparErro, 5000);
    return () => clearTimeout(t);
  }, [captura.erro, captura.limparErro]);

  // ------------------------------------------------------------------- acoes

  const copiar = useCallback(async (valor: string) => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(valor);
      setTimeout(() => setCopiado(''), 1500);
    } catch {
      // Area de transferencia negada. O endereco continua na tela para copiar
      // com o teclado.
    }
  }, []);

  const salvarComoPadrao = useCallback(
    (url: string, novaSala: string) => {
      definir('servidorPadrao', url);
      definir('salaPadrao', novaSala);
    },
    [definir],
  );

  const escolherFonte = useCallback(
    (id: string) => {
      window.greenlabsPicker?.chooseSource(id);
      setFontes(null);
    },
    [],
  );

  const transmitirTela = useCallback(() => {
    setAvisoAoVivo(true);
    void captura.transmitirTela(qualidadeId, preferencias.transmitirAudio);
  }, [captura, qualidadeId, preferencias.transmitirAudio]);

  const encerrar = useCallback(
    (id: IdDeCartao) => {
      void chamada.encerrar(id);
    },
    [chamada],
  );

  // ------------------------------------------------------------------ derivados

  const transmitindoMinhaTela = chamada.transmissoes.some(
    (t) => t.local && t.tipo === 'screen',
  );

  // O palco mostra so o que cabe nas divisoes escolhidas, comecando pela ativa.
  const divisoes = preferencias.colunasDaGrade;
  const ordenadas = [...chamada.transmissoes].sort((a, b) =>
    a.id === chamada.ativaId ? -1 : b.id === chamada.ativaId ? 1 : 0,
  );
  const noPalco = ordenadas.slice(0, divisoes);

  const pessoas = montarPessoas(
    chamada.participantes,
    preferencias.nome,
    chamada.pingMs,
    chamada.pingsDaSala,
  );

  if (!preferencias.jaPassouPelaAbertura) {
    return (
      <main className="shell single-layout">
        <TitleBar />
        <Onboarding
          aoConcluir={({ nome, servidor: url, sala: novaSala }) => {
            definir('nome', nome);
            definir('servidorPadrao', url);
            definir('salaPadrao', novaSala);
            definir('jaPassouPelaAbertura', true);
            setServidor(url);
            setSala(novaSala);
          }}
        />
      </main>
    );
  }

  return (
    <main className="shell single-layout">
      <TitleBar />

      {fontes && (
        <SourcePicker
          fontes={fontes}
          comAudio={preferencias.transmitirAudio}
          aoAlternarAudio={() => definir('transmitirAudio', !preferencias.transmitirAudio)}
          aoEscolher={escolherFonte}
          aoCancelar={() => {
            window.greenlabsPicker?.cancelPick();
            setFontes(null);
          }}
        />
      )}

      {captura.cameras && (
        <CameraPicker
          aparelhos={captura.cameras}
          aoConfirmar={(deviceId) => void captura.transmitirCamera(deviceId)}
          aoCancelar={captura.fecharSeletorDeCamera}
        />
      )}

      {configAberta && (
        <ConfigModal
          preferencias={preferencias}
          definir={definir}
          servidor={servidor}
          aoMudarServidor={setServidor}
          sala={sala}
          aoMudarSala={setSala}
          qualidadeId={qualidadeId}
          aoMudarQualidade={setQualidadeId}
          processos={processos}
          hospedagem={hospedagem}
          copiado={copiado}
          aoCopiar={(valor) => void copiar(valor)}
          aoSalvarComoPadrao={salvarComoPadrao}
          aoRestaurarFabrica={restaurarFabrica}
          aoFechar={() => setConfigAberta(false)}
        />
      )}

      <section className="main-panel full-width">
        {transmitindoMinhaTela && avisoAoVivo && (
          <div className="live-banner">
            <div className="live-banner-left">
              <span className="live-pulse" />
              <RadioIcon size={16} />
              <span>Você está transmitindo ao vivo</span>
            </div>
            <button
              className="live-banner-close"
              onClick={() => setAvisoAoVivo(false)}
              title="Fechar aviso"
            >
              <CloseIcon size={14} />
            </button>
          </div>
        )}

        <TopBar
          conectado={chamada.conectado}
          sala={sala}
          pessoas={pessoas.length}
          pingMs={chamada.pingMs}
          divisoes={divisoes}
          aoMudarDivisoes={(quantas) => definir('colunasDaGrade', quantas)}
          podeTransmitirTela={captura.podeTransmitirTela}
          aoTransmitirTela={transmitirTela}
          aoAdicionarCamera={() => void captura.abrirSeletorDeCamera()}
          aoAbrirConfiguracao={() => setConfigAberta(true)}
          aoEntrar={() => chamada.conectar(servidor, sala)}
          aoSair={chamada.desconectar}
        />

        {captura.erro && (
          <div className="error-banner">
            <span>{captura.erro}</span>
            <button className="live-banner-close" onClick={captura.limparErro} title="Fechar">
              <CloseIcon size={13} />
            </button>
          </div>
        )}

        <div
          className={`call-grid ${painelEncolhido ? 'streams-collapsed' : ''}`}
          data-mobile-tab={abaMovel}
        >
          <Stage
            visiveis={noPalco}
            divisoes={divisoes}
            ativaId={chamada.ativaId}
            painelEncolhido={painelEncolhido}
            aoExpandirPainel={() => setPainelEncolhido(false)}
            emTelaCheia={telaCheia.ativa}
            aoAlternarTelaCheia={() => void telaCheia.alternar()}
            aoEscolher={chamada.escolherAtiva}
            aoAlternarOculta={chamada.alternarOculta}
            ancora={palco}
          />

          <SidePanel
            transmissoes={chamada.transmissoes}
            pessoas={pessoas}
            ativaId={chamada.ativaId}
            encolhido={painelEncolhido}
            aoAlternarEncolhido={() => setPainelEncolhido((v) => !v)}
            aoEscolher={chamada.escolherAtiva}
            aoEncerrar={encerrar}
            aoMudarVolume={chamada.ajustarVolume}
            aoAlternarOculta={chamada.alternarOculta}
          />
        </div>

        {/* Só no telefone: os controles do topo ficam fora do alcance do
            polegar numa tela alta. Estes espelham os principais. */}
        <div className="mobile-actions">
          {captura.podeTransmitirTela && (
            <button className="mobile-action-btn" onClick={transmitirTela}>
              <MonitorIcon size={17} />
              <span>Tela</span>
            </button>
          )}
          <button
            className="mobile-action-btn"
            onClick={() => void captura.abrirSeletorDeCamera()}
          >
            <CameraIcon size={17} />
            <span>Câmera</span>
          </button>
          <button className="mobile-action-btn" onClick={() => setConfigAberta(true)}>
            <GearIcon size={17} />
            <span>Config</span>
          </button>
          {chamada.conectado ? (
            <button className="mobile-action-btn danger" onClick={chamada.desconectar}>
              <LogOutIcon size={17} />
              <span>Sair</span>
            </button>
          ) : (
            <button
              className="mobile-action-btn join"
              onClick={() => chamada.conectar(servidor, sala)}
            >
              <PlugIcon size={17} />
              <span>Entrar</span>
            </button>
          )}
        </div>

        <nav className="mobile-nav">
          {ABAS_MOVEIS.map(({ id, rotulo, Icone }) => {
            const quantos =
              id === 'transmissoes'
                ? chamada.transmissoes.length
                : id === 'usuarios'
                  ? pessoas.length
                  : 0;
            return (
              <button
                key={id}
                className={`mobile-nav-btn ${abaMovel === id ? 'active' : ''}`}
                onClick={() => setAbaMovel(id)}
              >
                <span className="mobile-nav-icon">
                  <Icone size={19} />
                  {quantos > 0 && <span className="mobile-nav-badge">{quantos}</span>}
                </span>
                <span className="mobile-nav-label">{rotulo}</span>
              </button>
            );
          })}
        </nav>

        {!chamada.conectado && <AvisoServidor />}
      </section>
    </main>
  );
}
