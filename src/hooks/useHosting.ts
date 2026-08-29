// A aba Hospedar: sobe um servidor de sinalizacao aqui mesmo.
//
// Tudo isto so existe dentro do Electron - no navegador nao ha como abrir
// porta. Por isso cada chamada comeca perguntando se a ponte existe, em vez de
// assumir que sim e quebrar em silencio.

import { useCallback, useEffect, useState } from 'react';

import type {
  EstadoDeHospedagem,
  ProgressoDeInstalacao,
  ProvedorDeTunel,
  ProvedoresDeTunel,
} from '@/types/bridge';

export interface InstalacaoEmCurso {
  provedor: ProvedorDeTunel;
  pct: number;
  erro?: string;
}

export interface UsoDeHospedagem {
  estado: EstadoDeHospedagem | null;
  ocupado: boolean;
  provedores: ProvedoresDeTunel | null;
  instalacao: InstalacaoEmCurso | null;

  /** Liga se estiver desligado, desliga se estiver ligado. */
  alternar(porta: number, comTunel: boolean): Promise<void>;
  instalarTunel(provedor: ProvedorDeTunel): Promise<void>;
}

function pctDe(info: ProgressoDeInstalacao): number {
  return typeof info === 'number' ? info : info.pct;
}

export function useHospedagem(): UsoDeHospedagem {
  const [estado, setEstado] = useState<EstadoDeHospedagem | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [provedores, setProvedores] = useState<ProvedoresDeTunel | null>(null);
  const [instalacao, setInstalacao] = useState<InstalacaoEmCurso | null>(null);

  // O servidor pode ja estar no ar de uma sessao anterior - o processo
  // principal sobrevive ao recarregar da janela. Perguntar na entrada evita a
  // aba mostrar "desligado" com a porta aberta.
  useEffect(() => {
    const ponte = window.greenlabsApp;
    if (!ponte) return;

    void ponte.getHostState().then(setEstado).catch(() => {});
    void ponte.getTunnelProviders().then(setProvedores).catch(() => {});

    // O tunel pode cair sozinho depois de ligado; sem escutar, a tela ficaria
    // mostrando um endereco publico que ja nao responde.
    ponte.onHostState(setEstado);
  }, []);

  const alternar = useCallback(
    async (porta: number, comTunel: boolean) => {
      const ponte = window.greenlabsApp;
      if (!ponte) return;

      setOcupado(true);
      try {
        setEstado(
          estado?.running
            ? await ponte.stopHost()
            : await ponte.startHost({ port: porta || 25640, tunnel: comTunel }),
        );
      } catch {
        // O processo principal ja registra o motivo. Aqui so nao pode ficar
        // preso em "ocupado" para sempre.
      } finally {
        setOcupado(false);
      }
    },
    [estado?.running],
  );

  const instalarTunel = useCallback(async (provedor: ProvedorDeTunel) => {
    const ponte = window.greenlabsApp;
    if (!ponte) return;

    setInstalacao({ provedor, pct: 0 });
    ponte.onTunnelInstallProgress((info) => {
      setInstalacao({ provedor, pct: pctDe(info) });
    });

    const resultado = await ponte.installTunnel(provedor);
    if (resultado.ok) {
      setInstalacao(null);
      void ponte.getTunnelProviders().then(setProvedores).catch(() => {});
    } else {
      setInstalacao({ provedor, pct: 0, erro: resultado.error ?? 'falhou' });
    }
  }, []);

  return { estado, ocupado, provedores, instalacao, alternar, instalarTunel };
}
