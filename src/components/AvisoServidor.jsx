import React from 'react';

/**
 * Aviso sobre o servidor escolhido.
 *
 * Sempre visível, sem lista de domínios confiáveis. A primeira versão tentava
 * adivinhar quem era de confiança pelo endereço e errava: o br-02 é da
 * GreenCodes e aparecia como suspeito. E a lista nunca ficaria certa - o que
 * importa não é o domínio, é quem opera a máquina.
 *
 * O aviso importa porque com o retransmissor ligado o vídeo e o áudio passam
 * pelo servidor de verdade. É assim que ele resolve quem não consegue conexão
 * direta, e é o preço: quem opera aquela máquina pode gravar o que passa.
 */
export default function AvisoServidor() {
  return (
    <div className="aviso-servidor" role="note">
      <strong>Entre só em servidor de confiança</strong>
      <p>
        Sua tela e seu áudio podem passar pelo servidor quando a conexão direta
        entre vocês não fecha. Quem opera a máquina consegue gravar o que passa
        por ela.
      </p>
    </div>
  );
}
