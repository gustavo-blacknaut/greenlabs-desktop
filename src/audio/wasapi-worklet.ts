// Roda na thread de tempo real do audio, e nao na principal.
//
// Substitui o ScriptProcessorNode justamente por isso: ali, qualquer engasgo
// da thread principal - desenho, coleta de lixo, o resto do WebRTC - virava
// irregularidade no ritmo dos pacotes. E o jitter buffer do WebRTC responde a
// ritmo irregular crescendo o atraso de reproducao para se defender. Era a
// origem mais provavel do atraso que se percebia.
//
// Este arquivo NAO pode importar nada: o AudioWorklet carrega um script solto,
// fora do grafo de modulos da pagina. Por isso os tipos estao declarados aqui
// dentro em vez de vir de um arquivo compartilhado.

interface OpcoesDoProcessador {
  processorOptions: {
    channels: number;
    sampleRate: number;
  };
}

declare const sampleRate: number;
declare function registerProcessor(
  nome: string,
  construtor: new (opcoes: OpcoesDoProcessador) => AudioWorkletProcessorLike,
): void;

interface AudioWorkletProcessorLike {
  readonly port: MessagePort;
  process(entradas: Float32Array[][], saidas: Float32Array[][]): boolean;
}

declare const AudioWorkletProcessor: {
  new (): AudioWorkletProcessorLike;
  prototype: AudioWorkletProcessorLike;
};

class ProcessadorWasapi extends AudioWorkletProcessor {
  private readonly canais: number;
  private readonly capacidade: number;

  /**
   * Alvo minimo de enchimento do anel.
   *
   * NAO pode ser um numero pequeno fixo: o audio chega em rajadas - o leitor
   * HTTP acorda com um bloco, nao pinga amostra a amostra - e cortar abaixo do
   * tamanho da rajada joga fora a maior parte de cada bloco assim que ele cai.
   *
   * Medido: alvo fixo de 40 ms contra rajadas de 60 ms tocava 66% do audio e
   * deixava um terco da saida em silencio. Entao o piso e 40 ms - baixo para a
   * entrega regular continuar de baixa latencia - mas cresce ate o dobro da
   * maior rajada realmente vista, o que nao custa nada quando a entrega e
   * regular e evita os buracos quando nao e.
   */
  private readonly pisoDeEnchimento: number;
  private tetoDeEnchimento: number;
  private maiorRajada = 0;

  private readonly aneis: Float32Array[];
  private readonly escrita: number[];
  private readonly leitura: number[];
  private readonly contido: number[];

  constructor(opcoes: OpcoesDoProcessador) {
    super();

    const { channels, sampleRate: taxa } = opcoes.processorOptions;
    this.canais = channels;

    // Teto duro de 300 ms por canal: passar disso e atraso, nao folga.
    this.capacidade = Math.ceil(taxa * 0.3);

    this.pisoDeEnchimento = Math.floor(taxa * 0.04);
    this.tetoDeEnchimento = this.pisoDeEnchimento;

    this.aneis = Array.from({ length: channels }, () => new Float32Array(this.capacidade));
    this.escrita = new Array<number>(channels).fill(0);
    this.leitura = new Array<number>(channels).fill(0);
    this.contido = new Array<number>(channels).fill(0);

    this.port.onmessage = (evento: MessageEvent<Float32Array[]>) => this.enfileirar(evento.data);
  }

  private enfileirar(porCanal: Float32Array[]): void {
    const tamanho = porCanal[0]?.length ?? 0;
    if (tamanho > this.maiorRajada) {
      this.maiorRajada = tamanho;
      this.tetoDeEnchimento = Math.min(
        this.capacidade,
        Math.max(this.pisoDeEnchimento, tamanho * 2),
      );
    }

    for (let canal = 0; canal < this.canais; canal++) {
      const origem = porCanal[canal];
      const anel = this.aneis[canal];
      if (!origem || !anel) continue;

      for (let i = 0; i < origem.length; i++) {
        anel[this.escrita[canal]!] = origem[i]!;
        this.escrita[canal] = (this.escrita[canal]! + 1) % this.capacidade;

        if (this.contido[canal]! < this.capacidade) {
          this.contido[canal]!++;
        } else {
          // Anel cheio: o mais antigo cede lugar. Som velho nao interessa, e o
          // atraso nao se recupera guardando mais.
          this.leitura[canal] = (this.leitura[canal]! + 1) % this.capacidade;
        }
      }

      while (this.contido[canal]! > this.tetoDeEnchimento) {
        this.leitura[canal] = (this.leitura[canal]! + 1) % this.capacidade;
        this.contido[canal]!--;
      }
    }
  }

  override process(_entradas: Float32Array[][], saidas: Float32Array[][]): boolean {
    const saida = saidas[0];
    if (!saida) return true;

    for (let canal = 0; canal < saida.length; canal++) {
      const destino = saida[canal];
      if (!destino) continue;

      // Mono alimentando estereo: os dois lados leem do canal 0.
      const indice = this.aneis[canal] ? canal : 0;
      const anel = this.aneis[indice];
      if (!anel) continue;

      for (let i = 0; i < destino.length; i++) {
        if (this.contido[indice]! > 0) {
          destino[i] = anel[this.leitura[indice]!]!;
          this.leitura[indice] = (this.leitura[indice]! + 1) % this.capacidade;
          this.contido[indice]!--;
        } else {
          // Secou: silencio. Repetir o ultimo bloco sairia como zumbido.
          destino[i] = 0;
        }
      }
    }

    return true;
  }
}

registerProcessor('wasapi-audio-processor', ProcessadorWasapi);

export {};
