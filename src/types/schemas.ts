// Validacao do que entra pela borda: a rede e o localStorage.
//
// Dentro do programa o compilador garante os tipos. Na borda ele nao garante
// nada: `JSON.parse` devolve `unknown`, e escrever `as MensagemRecebida` e so
// pedir para o compilador olhar para o outro lado. Uma mensagem malformada -
// servidor de outra versao, campo faltando, um byte trocado - passava como se
// fosse valida e so quebrava tres camadas adiante.
//
// Os tipos sao DERIVADOS destes esquemas, e nao escritos duas vezes: mudar o
// esquema muda o tipo junto, e nao ha como um ficar para tras.

import { z } from 'zod';

// Os nomes de campo aqui sao os do FIO. Traduzir derrubaria o servidor em Go e
// os clientes em C++ e Android, que leem exatamente estes.

const tipoDeTransmissao = z.enum(['screen', 'camera']);

const perfilDeQualidade = z.object({
  id: z.string(),
  rotulo: z.string(),
  largura: z.number(),
  altura: z.number(),
  fps: z.number(),
  bitrate: z.number(),
});

/**
 * O SDP e o candidato ICE vao para o navegador do jeito que chegaram.
 *
 * Validar campo a campo aqui nao ajudaria: quem sabe o que e um SDP valido e o
 * proprio WebRTC, e ele ja recusa o que nao presta. O que importa e garantir
 * que existe um objeto, e nao `undefined`.
 */
const descricaoDeSessao = z.object({
  type: z.enum(['offer', 'answer', 'pranswer', 'rollback']),
  sdp: z.string().optional(),
});

const candidatoIce = z.object({
  candidate: z.string().optional(),
  sdpMid: z.string().nullish(),
  sdpMLineIndex: z.number().nullish(),
  usernameFragment: z.string().nullish(),
});

const parDaSala = z.object({
  peerId: z.string(),
  name: z.string(),
});

const metaDeTransmissao = z.object({
  kind: tipoDeTransmissao,
  name: z.string(),
  ownerName: z.string(),
  quality: perfilDeQualidade.nullable(),
});

/**
 * Uniao discriminada pelo `type`.
 *
 * O `discriminatedUnion` do Zod olha so esse campo para escolher o esquema, em
 * vez de tentar todos - o erro que ele devolve aponta o campo errado da
 * mensagem certa, em vez de listar dez falhas de dez esquemas.
 */
export const esquemaDeMensagem = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('joined'),
    peerId: z.string(),
    peers: z.array(parDaSala),
    sfu: z.boolean().optional(),
  }),
  z.object({ type: z.literal('peer-joined'), peerId: z.string(), name: z.string() }),
  z.object({ type: z.literal('peer-left'), peerId: z.string() }),
  z.object({ type: z.literal('offer'), from: z.string(), description: descricaoDeSessao }),
  z.object({ type: z.literal('answer'), from: z.string(), description: descricaoDeSessao }),
  z.object({ type: z.literal('ice'), from: z.string(), candidate: candidatoIce }),
  metaDeTransmissao.extend({
    type: z.literal('stream-meta'),
    from: z.string(),
    streamId: z.string(),
  }),
  z.object({
    type: z.literal('stream-ended'),
    from: z.string(),
    streamId: z.string(),
    id: z.string().optional(),
  }),
  z.object({ type: z.literal('pong'), timestamp: z.number() }),
  z.object({ type: z.literal('room-pings'), pings: z.record(z.string(), z.number()) }),
]);

export type MensagemRecebida = z.infer<typeof esquemaDeMensagem>;
export type MetaDeTransmissao = z.infer<typeof metaDeTransmissao>;
export type ParDaSala = z.infer<typeof parDaSala>;

/**
 * Le uma mensagem do fio. Devolve nulo para o que nao for valido.
 *
 * Nulo em vez de excecao porque uma mensagem estranha nao e motivo para
 * derrubar a chamada: o servidor pode ser de uma versao mais nova e mandar algo
 * que este cliente ainda nao conhece.
 */
export function lerMensagem(bruto: string): MensagemRecebida | null {
  try {
    const analisado = esquemaDeMensagem.safeParse(JSON.parse(bruto));
    return analisado.success ? analisado.data : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------- localStorage

export const esquemaDeServidor = z.object({
  id: z.string().optional(),
  url: z.string(),
  sala: z.string(),
  rotulo: z.string().optional(),
  favorito: z.boolean().optional(),
});

export const esquemaDeServidores = z.array(esquemaDeServidor);

export type ServidorSalvo = z.infer<typeof esquemaDeServidor>;
