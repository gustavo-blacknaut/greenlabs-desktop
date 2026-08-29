// Abrir tela e camera daqui: getDisplayMedia, getUserMedia e a ponte do
// Android, mais o audio do sistema que entra depois.
//
// Separado do useCall de proposito: a chamada nao precisa saber COMO um
// MediaStream nasceu, so recebe um pronto. E quem cuida da captura nao precisa
// saber o que e um RTCPeerConnection.

import { useCallback, useState } from 'react';

import { abrirAudioDoSistema } from '@/lib/wasapi-audio';
import { abrirTelaAndroid, pararTelaAndroid, temCapturaAndroid } from '@/lib/android-screen';
import { qualidadePorId } from '@/lib/media';
import type { Chamada } from '@/hooks/useCall';

export interface UsoDeCaptura {
  /** Falso onde nao ha nenhum caminho de captura de tela. */
  podeTransmitirTela: boolean;
  erro: string;
  limparErro(): void;

  cameras: MediaDeviceInfo[] | null;
  fecharSeletorDeCamera(): void;

  transmitirTela(qualidadeId: string, comAudio: boolean): Promise<void>;
  abrirSeletorDeCamera(): Promise<void>;
  transmitirCamera(deviceId: string): Promise<void>;
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

export function useLocalCapture(chamada: Chamada): UsoDeCaptura {
  const [erro, setErro] = useState('');
  const [cameras, setCameras] = useState<MediaDeviceInfo[] | null>(null);

  const podeTransmitirTela =
    temCapturaAndroid() || typeof navigator.mediaDevices?.getDisplayMedia === 'function';

  const transmitirTela = useCallback(
    async (qualidadeId: string, comAudio: boolean) => {
      const qualidade = qualidadePorId(qualidadeId);

      // No Android a captura vem do lado nativo: nenhum navegador de la
      // implementa getDisplayMedia.
      if (temCapturaAndroid()) {
        try {
          const { stream } = await abrirTelaAndroid({
            qualidade,
            aoCair: (motivo) => setErro(motivo),
          });
          await chamada.publicar('screen', `Tela — ${qualidade.rotulo}`, stream, qualidade);
        } catch (falha) {
          setErro(`Não foi possível compartilhar a tela: ${mensagemDe(falha)}`);
        }
        return;
      }

      let bruto: MediaStream;
      try {
        bruto = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: qualidade.largura, max: qualidade.largura },
            height: { ideal: qualidade.altura, max: qualidade.altura },
            frameRate: { ideal: qualidade.fps, max: qualidade.fps },
          },
          // O audio NAO vem daqui: o do navegador nao sabe excluir o Discord.
          // Ele entra logo abaixo, pela captura por processo.
          audio: false,
        });
      } catch {
        // Cancelar a janela de escolha do sistema nao e erro: a pessoa mudou
        // de ideia, e um aviso vermelho depois disso so assusta.
        return;
      }

      const faixaDeVideo = bruto.getVideoTracks()[0];
      if (!faixaDeVideo) return;

      const stream = new MediaStream([faixaDeVideo]);
      await chamada.publicar('screen', `Tela — ${qualidade.rotulo}`, stream, qualidade);
      if (!comAudio) return;

      // O video ja esta no ar; o audio entra quando abrir. Esperar por ele
      // aqui atrasaria a imagem em segundos, e a captura por processo demora
      // justamente porque precisa achar as sessoes de audio a excluir.
      const publicada = chamada.transmissoes.find(
        (t) => t.local && t.stream.getVideoTracks()[0] === faixaDeVideo,
      );

      void (async () => {
        try {
          const { faixa, encerrar } = await abrirAudioDoSistema();
          const alvo = publicada?.id;
          if (!alvo) {
            encerrar();
            return;
          }

          await chamada.anexarFaixa(alvo, faixa);

          const limpar = () => encerrar();
          faixa.addEventListener('ended', limpar);
          faixaDeVideo.addEventListener('ended', limpar);
        } catch {
          // Sem o AudioCapture.exe no ar, segue so o video. E o caso de quem
          // roda pelo navegador, e continua sendo uma transmissao valida.
        }
      })();
    },
    [chamada],
  );

  const abrirSeletorDeCamera = useCallback(async () => {
    try {
      // Uma permissao antes de listar: sem ela os rotulos vem vazios e o
      // seletor mostra "Camera 1", "Camera 2" sem dizer qual e qual.
      const provisoria = await navigator.mediaDevices.getUserMedia({ video: true });
      for (const faixa of provisoria.getTracks()) faixa.stop();

      const todos = await navigator.mediaDevices.enumerateDevices();
      const encontradas = todos.filter((d) => d.kind === 'videoinput');
      if (!encontradas.length) {
        setErro('Nenhuma câmera encontrada.');
        return;
      }
      setCameras(encontradas);
    } catch (falha) {
      setErro(`Não foi possível acessar a câmera: ${mensagemDe(falha)}`);
    }
  }, []);

  const transmitirCamera = useCallback(
    async (deviceId: string) => {
      setCameras(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: deviceId ? { exact: deviceId } : undefined },
          audio: false,
        });
        const qualidade = qualidadePorId('720p30');
        await chamada.publicar('camera', 'Câmera', stream, qualidade);
      } catch (falha) {
        setErro(`Não foi possível abrir a câmera: ${mensagemDe(falha)}`);
      }
    },
    [chamada],
  );

  return {
    podeTransmitirTela,
    erro,
    limparErro: useCallback(() => setErro(''), []),
    cameras,
    fecharSeletorDeCamera: useCallback(() => setCameras(null), []),
    transmitirTela,
    abrirSeletorDeCamera,
    transmitirCamera,
  };
}

/** Reexportado para o App avisar o Android quando a tela local encerra. */
export { pararTelaAndroid };
