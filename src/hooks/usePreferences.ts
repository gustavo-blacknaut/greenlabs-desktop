// As preferencias como estado de React, gravando sozinhas.
//
// Antes eram vinte `useState` com try/catch em volta do localStorage, e cada
// tela que mudava uma precisava lembrar de gravar - quando esquecia, a
// preferencia valia ate fechar o app e sumia. Aqui gravar faz parte de mudar.

import { useCallback, useState } from 'react';

import {
  carregarPreferencias,
  guardar,
  restaurarPadraoDeFabrica,
  type Preferencias,
} from '@/lib/preferences';

export interface UsoDePreferencias {
  preferencias: Preferencias;
  /** Muda uma preferencia e grava. Nao existe mudar sem gravar. */
  definir<C extends keyof Preferencias>(chave: C, valor: Preferencias[C]): void;
  restaurarFabrica(): void;
}

export function usePreferencias(): UsoDePreferencias {
  // Funcao no useState, e nao valor: sem ela o localStorage seria lido em toda
  // renderizacao, e sao doze leituras por vez.
  const [preferencias, setPreferencias] = useState<Preferencias>(carregarPreferencias);

  const definir = useCallback(
    <C extends keyof Preferencias>(chave: C, valor: Preferencias[C]) => {
      guardar(chave, valor);
      setPreferencias((atuais) => ({ ...atuais, [chave]: valor }));
    },
    [],
  );

  const restaurarFabrica = useCallback(() => {
    restaurarPadraoDeFabrica();
    setPreferencias(carregarPreferencias());
  }, []);

  return { preferencias, definir, restaurarFabrica };
}
