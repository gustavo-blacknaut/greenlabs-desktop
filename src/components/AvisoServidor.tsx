/**
 * Aviso sobre o servidor escolhido.
 *
 * Sempre visivel, sem lista de dominios confiaveis. A primeira versao tentava
 * adivinhar quem era de confianca pelo endereco e errava: o br-02 e da
 * GreenCodes e aparecia como suspeito. E a lista nunca ficaria certa - o que
 * importa nao e o dominio, e quem opera a maquina.
 *
 * O aviso importa porque com o retransmissor ligado o video e o audio passam
 * pelo servidor de verdade. E assim que ele resolve quem nao consegue conexao
 * direta, e e o preco: quem opera aquela maquina pode gravar o que passa.
 */
export default function AvisoServidor() {
  return (
    <div className="aviso-servidor" role="note">
      <strong>Entre só em servidor de confiança</strong>
      <p>
        Quando vocês não conseguem se conectar direto, sua tela e seu som passam
        pelo servidor. Quem controla esse servidor consegue gravar o que passa
        por ele.
      </p>
    </div>
  );
}
