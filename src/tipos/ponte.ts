// O contrato entre a interface e o processo principal do Electron.
//
// O preload pendura quatro objetos em `window`, e ate agora nenhum deles tinha
// contrato nenhum: a interface chamava `window.greenlabsApp.startHost({...})` e
// so descobria o formato errado quando nao acontecia nada. Aqui esta escrito o
// que cada um aceita e devolve, e o compilador cobra.
//
// Quem mexer no preload.cjs precisa mexer aqui junto - e o compilador avisa,
// porque a chamada do outro lado para de casar.

export type IdDeFonte = string;

/** Uma tela ou janela que o Electron oferece para compartilhar. */
export interface FonteDeTela {
  id: IdDeFonte;
  name: string;
  thumbnail?: string;
}

/** Um processo em execucao, para a lista de exclusao de audio. */
export interface ProcessoEmExecucao {
  pid: number;
  nome: string;
}

export type ProvedorDeTunel = 'cloudflared' | 'ngrok';

/**
 * Quais tuneis existem na maquina.
 *
 * `bundled` sao os que o proprio app baixou, e por isso ficam separados: o app
 * sabe apagar e reinstalar esses, mas nao mexe no que a pessoa instalou por
 * fora.
 */
export interface ProvedoresDeTunel {
  cloudflared?: boolean;
  ngrok?: boolean;
  bundled?: Partial<Record<ProvedorDeTunel, boolean>>;
}

/** Estado da aba Hospedar. Os nomes sao os do processo principal. */
export interface EstadoDeHospedagem {
  running: boolean;
  port: number;
  tunnel: ProvedorDeTunel | null;
  tunnelUrl: string | null;
  tunnelError: string | null;
  /** Enderecos da rede local que servem para quem esta na mesma casa. */
  addresses: string[];
}

export interface OpcoesDeHospedagem {
  port: number;
  tunnel: boolean;
}

/** Resultado da instalacao de um tunel. */
export interface ResultadoDeInstalacao {
  ok: boolean;
  provider: ProvedorDeTunel;
  alreadyInstalled?: boolean;
  error?: string;
}

/**
 * Progresso da instalacao.
 *
 * O processo principal manda `{ provider, pct }`, mas versoes antigas mandavam
 * so o numero. Os dois formatos estao aqui porque a interface ainda encontra
 * os dois em maquina que nao atualizou.
 */
export type ProgressoDeInstalacao = number | { provider: ProvedorDeTunel; pct: number };

/** Escolha de tela: o principal manda as fontes, a interface responde o id. */
export interface PonteDeEscolha {
  onPickSource(cb: (fontes: FonteDeTela[]) => void): void;
  chooseSource(id: IdDeFonte): void;
  cancelPick(): void;
}

/** Captura de audio por processo, em modo exclusao. */
export interface PonteDeAudio {
  startExclusion(apps: string[]): void;
  stopExclusion(): void;
}

export interface PonteDoAplicativo {
  hideToTray(): void;
  toggleAutoLaunch(ligar: boolean): void;
  toggleHardwareAcceleration(ligar: boolean): void;
  getRunningProcesses(): Promise<ProcessoEmExecucao[]>;
  toggleFullscreen(): void;
  getWasapiAudioUrl(): string;
  getVersion(): Promise<string>;

  minimizeWindow(): void;
  toggleMaximizeWindow(): void;
  closeWindow(): void;
  isMaximized(): Promise<boolean>;
  onWindowStateChange(cb: (maximizada: boolean) => void): void;

  startHost(opcoes: OpcoesDeHospedagem): Promise<EstadoDeHospedagem>;
  stopHost(): Promise<EstadoDeHospedagem>;
  getHostState(): Promise<EstadoDeHospedagem | null>;
  getTunnelProviders(): Promise<ProvedoresDeTunel>;
  installTunnel(provedor: ProvedorDeTunel): Promise<ResultadoDeInstalacao>;
  onTunnelInstallProgress(cb: (info: ProgressoDeInstalacao) => void): void;
  onHostState(cb: (estado: EstadoDeHospedagem) => void): void;

  openExternal(url: string): void;
}

declare global {
  interface Window {
    // Marca de que estamos dentro do Electron. No navegador nao existe, e e
    // por isso que os quatro sao opcionais: a interface roda nos dois lugares
    // e precisa perguntar antes de usar.
    lightCall?: { isElectron: true };
    greenlabsPicker?: PonteDeEscolha;
    greenlabsAudio?: PonteDeAudio;
    greenlabsApp?: PonteDoAplicativo;
  }
}

/**
 * Verdadeiro quando a interface esta rodando dentro do Electron.
 *
 * Existe funcao em vez de checar `window.lightCall` espalhado porque a
 * pergunta aparece em varios lugares e a resposta e sempre a mesma.
 */
export function dentroDoElectron(): boolean {
  return typeof window !== 'undefined' && window.lightCall?.isElectron === true;
}
