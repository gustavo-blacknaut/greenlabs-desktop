import React from 'react';
import { cleanDomainOnly } from '../lib/format.js';

// Domínios da GreenCodes. Servidor fora desta lista é de terceiro, e quem opera
// um servidor de terceiro pode gravar o que passa por ele.
const CONFIAVEIS = ['greencodes.com.br', 'greenlabs.greencodes.com.br'];

// Endereços da própria máquina: quem hospeda é você, então não há terceiro.
const LOCAIS = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];

export function servidorEhDeTerceiro(endereco) {
  const host = (cleanDomainOnly(endereco) || '').split(':')[0].toLowerCase();
  if (!host) return false;
  if (LOCAIS.includes(host)) return false;

  // Faixas privadas: rede local, VPN tipo Radmin, container.
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (/^26\./.test(host)) return false; // Radmin VPN

  return !CONFIAVEIS.some((d) => host === d || host.endsWith(`.${d}`));
}

/**
 * Aviso de que o servidor não é da GreenCodes.
 *
 * Isto não é formalidade jurídica: quando o servidor está em modo
 * retransmissor, o vídeo e o áudio passam por ele de verdade — é assim que ele
 * resolve quem não consegue conexão direta. Quem opera a máquina pode gravar
 * tudo, e não há como o aplicativo impedir. Quem entra num endereço que alguém
 * mandou no chat merece saber disso antes, não depois.
 */
export default function AvisoServidor({ endereco }) {
  if (!servidorEhDeTerceiro(endereco)) return null;

  const host = (cleanDomainOnly(endereco) || '').split(':')[0];

  return (
    <div className="aviso-servidor" role="alert">
      <strong>Servidor de terceiro</strong>
      <p>
        <code>{host}</code> não é da GreenCodes. Quem opera esse servidor pode
        gravar sua tela e seu áudio, porque eles passam por lá quando a conexão
        direta não fecha.
      </p>
      <p className="aviso-servidor-fim">Entre só em servidor de quem você confia.</p>
    </div>
  );
}
