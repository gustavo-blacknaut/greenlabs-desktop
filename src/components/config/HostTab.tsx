import { CheckIcon, PlugIcon, PlusIcon, RadioIcon } from '@/icons';
import type { UsoDeHospedagem } from '@/hooks/useHosting';
import type { ProvedorDeTunel } from '@/types/bridge';

/**
 * O Radmin nao e um tunel: e uma rede virtual.
 *
 * Entra na mesma lista porque resolve o mesmo problema de quem so tem rede
 * local, e para muita gente resolve melhor - nao precisa de conta nem deixa um
 * endereco publico no ar.
 */
type OpcaoDeTunel =
  | { id: ProvedorDeTunel; rotulo: string; nota: string; externo?: never }
  | { id: 'radmin'; rotulo: string; nota: string; externo: string };

const OPCOES: OpcaoDeTunel[] = [
  { id: 'cloudflared', rotulo: 'cloudflared', nota: 'sem conta, recomendado' },
  { id: 'ngrok', rotulo: 'ngrok', nota: 'precisa de token' },
  {
    id: 'radmin',
    rotulo: 'Radmin VPN',
    nota: 'rede virtual, sem túnel',
    externo: 'https://www.radmin-vpn.com/',
  },
];

interface Props {
  hospedagem: UsoDeHospedagem;
  porta: number;
  aoMudarPorta(porta: number): void;
  comTunel: boolean;
  aoAlternarTunel(): void;
  copiado: string;
  aoCopiar(valor: string): void;
  aoUsarEsteServidor(url: string): void;
}

export default function HostTab({
  hospedagem,
  porta,
  aoMudarPorta,
  comTunel,
  aoAlternarTunel,
  copiado,
  aoCopiar,
  aoUsarEsteServidor,
}: Props) {
  const { estado, ocupado, provedores, instalacao, alternar, instalarTunel } = hospedagem;
  const noAr = estado?.running === true;
  const temAlgumTunel = Boolean(provedores?.cloudflared || provedores?.ngrok);

  return (
    <div className="field-grid">
      <div className="block-title">
        <RadioIcon size={15} /> <span>Hospedar do meu PC</span>
      </div>
      <p className="hint">
        Sobe o servidor de sinalização aqui mesmo. Quem for entrar usa um dos endereços
        abaixo — vídeo e áudio vão direto entre vocês.
      </p>

      <div className="host-port-row">
        <label className="host-port-field">
          Porta
          <input
            value={String(porta)}
            // Porta e numero: filtrar na digitacao evita o campo aceitar texto
            // que so falharia la na frente, ao tentar abrir o socket.
            onChange={(evento) =>
              aoMudarPorta(Number(evento.target.value.replace(/\D/g, '').slice(0, 5)))
            }
            placeholder="25640"
            disabled={noAr}
          />
        </label>
        <button
          type="button"
          className={`host-tunnel-toggle ${comTunel ? 'on' : ''}`}
          disabled={noAr}
          onClick={aoAlternarTunel}
        >
          <span className={`switch ${comTunel ? 'on' : ''}`} />
          <span>Abrir túnel</span>
        </button>
      </div>

      <div className="tunnel-box">
        <div className="tunnel-row">
          <div className="tunnel-main">
            <RadioIcon size={14} />
            <span className="tunnel-label">Túnel</span>
            {provedores === null ? (
              <span className="tunnel-chip">…</span>
            ) : temAlgumTunel ? (
              <span className="tunnel-chip ok">
                {provedores.cloudflared ? 'cloudflared' : 'ngrok'}
              </span>
            ) : (
              <span className="tunnel-chip off">indisponível</span>
            )}
          </div>
        </div>

        <p className="tunnel-explain">
          {temAlgumTunel
            ? 'Cria um endereço público temporário, acessível de qualquer rede.'
            : 'Sem túnel, só entra quem está na sua rede. O Radmin VPN resolve isso criando uma rede virtual, sem endereço público.'}
        </p>

        {provedores !== null && !temAlgumTunel && (
          <div className="tunnel-providers">
            {OPCOES.map((opcao) => {
              const emCurso = instalacao?.provedor === opcao.id ? instalacao : null;
              return (
                <div className="tunnel-provider" key={opcao.id}>
                  <div className="tunnel-provider-text">
                    <strong>{opcao.rotulo}</strong>
                    <span>{opcao.nota}</span>
                  </div>

                  {/* Discriminado pelo `id`, e nao pela presenca de `externo`: e o
                      campo que o TypeScript usa para estreitar a uniao. */}
                  {opcao.id === 'radmin' ? (
                    <button
                      className="ghost tunnel-install-btn"
                      onClick={() => window.greenlabsApp?.openExternal(opcao.externo)}
                    >
                      baixar
                    </button>
                  ) : emCurso?.erro ? (
                    <button
                      className="ghost tunnel-install-btn"
                      onClick={() => void instalarTunel(opcao.id)}
                    >
                      repetir
                    </button>
                  ) : emCurso ? (
                    <span className="tunnel-progress">{emCurso.pct}%</span>
                  ) : (
                    <button
                      className="ghost tunnel-install-btn"
                      onClick={() => void instalarTunel(opcao.id)}
                    >
                      instalar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {instalacao?.erro && <p className="tunnel-explain">Falhou: {instalacao.erro}</p>}

        <div className="tunnel-flow">
          <div className="tunnel-flow-row">
            <span className="tunnel-flow-tag">local</span>
            <code>ws://SEU_IP:{porta || 25640}</code>
          </div>
          <div className="tunnel-flow-row">
            <span className="tunnel-flow-tag accent">túnel</span>
            <code>wss://…trycloudflare.com</code>
          </div>
        </div>
      </div>

      <button
        className={`full-btn ${noAr ? 'ghost' : 'primary'}`}
        disabled={ocupado}
        onClick={() => void alternar(porta, comTunel)}
      >
        {ocupado ? 'Aguarde…' : noAr ? 'Parar servidor' : 'Iniciar servidor'}
      </button>

      {estado && noAr && (() => {
        // Extraido para uma constante: o TypeScript nao sabe que um campo de
        // objeto continua nao-nulo dentro de um callback, e sem isto so restava
        // o `!` - que e justamente a marca que apaga a checagem.
        const enderecoDoTunel = estado.tunnelUrl;
        return (
        <>
          <hr className="divider" />
          <div className="block-title">
            <PlugIcon size={15} /> <span>Endereços para compartilhar</span>
          </div>

          {enderecoDoTunel && (
            <div className="host-address highlight">
              <div className="host-address-text">
                <strong>{enderecoDoTunel}</strong>
                <span>Internet — via {estado.tunnel}</span>
              </div>
              <div className="host-address-actions">
                <button
                  className="icon-btn sm"
                  title="Copiar"
                  onClick={() => aoCopiar(enderecoDoTunel)}
                >
                  {copiado === enderecoDoTunel ? <CheckIcon size={15} /> : <PlusIcon size={15} />}
                </button>
              </div>
            </div>
          )}

          {comTunel && !estado.tunnelUrl && !estado.tunnelError && (
            <p className="hint">Abrindo túnel…</p>
          )}

          {estado.tunnelError && (
            <p className="hint">
              Túnel indisponível: {estado.tunnelError}. Use os endereços locais ou o Radmin
              VPN.
            </p>
          )}

          {estado.addresses.map((item) => {
            const url = `ws://${item.address}:${estado.port}`;
            return (
              <div className="host-address" key={url}>
                <div className="host-address-text">
                  <strong>{url}</strong>
                  <span>
                    {item.name}
                    {item.vpn ? ' — VPN' : ''}
                  </span>
                </div>
                <div className="host-address-actions">
                  <button className="icon-btn sm" title="Copiar" onClick={() => aoCopiar(url)}>
                    {copiado === url ? <CheckIcon size={15} /> : <PlusIcon size={15} />}
                  </button>
                  <button
                    className="ghost"
                    title="Usar este servidor"
                    onClick={() => aoUsarEsteServidor(url)}
                  >
                    Usar
                  </button>
                </div>
              </div>
            );
          })}
        </>
        );
      })()}
    </div>
  );
}
