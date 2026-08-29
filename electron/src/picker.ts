// A escolha do que transmitir.
//
// O Electron pergunta ao processo principal qual fonte usar. Em vez da janela
// padrao dele, a lista vai para a interface, que desenha a escolha com a cara
// do resto do aplicativo - e com o interruptor de audio junto.

import { desktopCapturer, session, type BrowserWindow } from 'electron';

/** Um minuto para escolher. Sem prazo, uma janela esquecida prende a captura para sempre. */
const PRAZO_MS = 60_000;

let responder: ((id: string | null) => void) | null = null;

/** Chamado pelo IPC quando a interface escolhe ou cancela. */
export function responderEscolha(id: string | null): void {
  responder?.(id);
  responder = null;
}

export function registrarEscolhaDeTela(janela: BrowserWindow): void {
  session.defaultSession.setPermissionRequestHandler((_conteudo, permissao, responderPermissao) => {
    // So o que a chamada precisa. Negar o resto por omissao e mais seguro que
    // liberar tudo e torcer.
    responderPermissao(['media', 'display-capture'].includes(permissao));
  });

  session.defaultSession.setDisplayMediaRequestHandler(async (_pedido, responderPedido) => {
    try {
      const fontes = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
      });

      if (!fontes.length) {
        responderPedido({});
        return;
      }

      const escolhido = await new Promise<string | null>((resolve) => {
        const prazo = setTimeout(() => {
          responder = null;
          resolve(null);
        }, PRAZO_MS);

        responder = (id) => {
          clearTimeout(prazo);
          resolve(id);
        };

        janela.webContents.send(
          'greenlabs:pick-source',
          fontes.map((fonte) => ({
            id: fonte.id,
            name: fonte.name,
            thumbnail: fonte.thumbnail.toDataURL(),
            displayId: fonte.display_id,
          })),
        );
      });

      const fonte = escolhido ? fontes.find((f) => f.id === escolhido) : undefined;
      if (!fonte) {
        responderPedido({});
        return;
      }

      // `loopback` pede o som do sistema junto. O que exclui o Discord e a
      // captura por processo, que entra por fora; este e o caminho de reserva
      // para quem nao tem o AudioCapture.exe.
      responderPedido({ video: fonte, audio: 'loopback' });
    } catch {
      responderPedido({});
    }
  });
}
