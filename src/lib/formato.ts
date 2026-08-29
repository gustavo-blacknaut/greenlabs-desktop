// Normalizacao do endereco do servidor e nomes da lista de participantes.

import type { Participante } from '@/tipos/dominio';

/**
 * Aceita o endereco do jeito que a pessoa digitar.
 *
 * Ninguem quer digitar `ws://`. Quem cola de um navegador cola `https://`.
 * Aqui tudo vira o esquema que o WebSocket entende, mantendo a seguranca de
 * quem colou um endereco seguro: https vira wss, http vira ws.
 */
export function normalizarServidor(valor: string): string {
  const limpo = valor.trim().replace(/\/$/, '');
  if (!limpo) return '';
  if (limpo.startsWith('ws://') || limpo.startsWith('wss://')) return limpo;
  if (limpo.startsWith('http://')) return `ws://${limpo.slice(7)}`;
  if (limpo.startsWith('https://')) return `wss://${limpo.slice(8)}`;
  return `ws://${limpo}`;
}

/** So o dominio, para mostrar na tela sem o esquema atrapalhando a leitura. */
export function apenasDominio(url: string): string {
  return normalizarServidor(url).replace(/^wss?:\/\//, '');
}

/**
 * Desempata nomes repetidos: o segundo "Gustavo" da sala vira "Gustavo (2)".
 *
 * Sem isto, duas pessoas de mesmo nome ficam indistinguiveis na lista e nos
 * cartoes de transmissao.
 */
export function desempatarNomes(lista: Participante[]): Participante[] {
  const vistos = new Map<string, number>();

  return lista.map((item) => {
    const base = (item.nome || 'Usuario').trim();
    const quantos = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, quantos);

    return {
      ...item,
      nomeExibido: quantos === 1 ? base : `${base} (${quantos})`,
    };
  });
}
