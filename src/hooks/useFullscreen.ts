// Tela cheia, nos dois mundos.
//
// No Electron quem manda e a janela nativa; no navegador e a API de
// fullscreen do documento. Sao caminhos diferentes com o mesmo nome, e sem
// separar isso o App teria um `if (electron)` no meio do clique do botao.

import { useCallback, useEffect, useState } from 'react';

import type { RefObject } from 'react';

export interface UsoDeTelaCheia {
  ativa: boolean;
  alternar(): Promise<void>;
}

export function useFullscreen(alvo: RefObject<HTMLElement | null>): UsoDeTelaCheia {
  const [ativa, setAtiva] = useState(false);

  // A pessoa pode sair com Esc, sem passar pelo nosso botao. Sem escutar o
  // evento, o icone ficaria mostrando "sair" com a tela ja normal.
  useEffect(() => {
    const aoMudar = () => setAtiva(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', aoMudar);
    return () => document.removeEventListener('fullscreenchange', aoMudar);
  }, []);

  const alternar = useCallback(async () => {
    const ponte = window.greenlabsApp;
    if (ponte) {
      // Dentro do Electron a janela inteira vai a tela cheia: e o que a pessoa
      // espera de um aplicativo, em vez de so o retangulo do video.
      ponte.toggleFullscreen();
      return;
    }

    try {
      if (!document.fullscreenElement && alvo.current) {
        await alvo.current.requestFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // Navegador que recusa fora de um gesto do usuario, ou politica de
      // permissao. Nao ha o que fazer alem de continuar na tela normal.
    }
  }, [alvo]);

  return { ativa, alternar };
}
