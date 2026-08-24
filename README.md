# GreenLabs Live Streaming

Aplicativo de transmissão de tela em grupo para Windows, com áudio do sistema
capturado por processo — o que permite transmitir o som do jogo, do Spotify e do
navegador **sem enviar o áudio do Discord**, e sem mutar nada para você.

Cada pessoa hospeda o próprio servidor de sinalização. Não existe servidor
central: o vídeo e o áudio vão direto entre os participantes (WebRTC P2P), e o
servidor só serve para as pessoas se encontrarem.

- Repositório: <https://github.com/gustavo-blacknaut/greenlabs-live-streaming>

---

## Índice

- [Como funciona](#como-funciona)
- [Instalação](#instalação)
- [Hospedando o servidor](#hospedando-o-servidor)
  - [1. Mesma rede (LAN)](#1-mesma-rede-lan)
  - [2. Radmin VPN / Hamachi](#2-radmin-vpn--hamachi)
  - [3. Túnel público (Cloudflare / ngrok)](#3-túnel-público-cloudflare--ngrok)
  - [4. VPS](#4-vps)
- [Por que um servidor no Brasil importa](#por-que-um-servidor-no-brasil-importa)
- [Requisitos mínimos](#requisitos-mínimos)
- [Desenvolvimento](#desenvolvimento)
- [Solução de problemas](#solução-de-problemas)
- [Créditos](#créditos)

---

## Como funciona

```
        VOCÊ (host)                              PARTICIPANTES
┌──────────────────────────┐              ┌──────────────────────────┐
│  GreenLabs (Electron)    │              │  GreenLabs (Electron)    │
│                          │              │                          │
│  captura de tela ────────┼──┐        ┌──┼──── exibe as telas       │
│  áudio sem Discord ──────┼──┤        │  │                          │
└──────────────────────────┘  │        │  └──────────────────────────┘
                              │        │
                         vídeo/áudio direto (WebRTC)
                              │        │
                    ┌─────────┴────────┴─────────┐
                    │  servidor de sinalização    │
                    │  (só troca de mensagens)    │
                    └─────────────────────────────┘
```

O servidor de sinalização é leve: ele apenas repassa mensagens de conexão
(offer/answer/ICE) e mantém a lista de quem está na sala. O tráfego pesado
— vídeo e áudio — nunca passa por ele.

A captura de áudio usa `AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK` do
WASAPI em modo *exclude*: capturamos o mix do sistema inteiro **menos** a árvore
de processos do Discord. Como é exclusão e não inclusão, qualquer aplicativo
aberto depois já entra na transmissão automaticamente.

---

## Instalação

### Usuário final

Baixe o instalador em [Releases](https://github.com/gustavo-blacknaut/greenlabs-live-streaming/releases)
e execute. O app fica na bandeja do sistema e inicia com o Windows.

### A partir do código

```bash
git clone https://github.com/gustavo-blacknaut/greenlabs-live-streaming.git
cd greenlabs-live-streaming
npm install
npm run app
```

Para gerar o instalador:

```bash
npm run build:installer
```

O `.exe` sai em `dist-installer/`.

---

## Hospedando o servidor

Escolha um dos quatro caminhos abaixo. Todos usam o mesmo comando de base:

```bash
npm run host
```

Ele sobe o servidor e lista os endereços que você pode compartilhar:

```
  Enderecos para quem esta na mesma rede:
    ws://26.99.130.99:25640   (Radmin VPN - VPN)
    ws://192.168.18.6:25640   (Wi-Fi)
```

Quem for entrar cola esse endereço no campo **Servidor** do GreenLabs. Pode
digitar com ou sem `ws://` — o app normaliza sozinho.

Para trocar a porta:

```bash
npm run host -- --port 30000
```

### 1. Mesma rede (LAN)

O caso mais simples: todos na mesma casa, no mesmo Wi-Fi ou cabo.

```bash
npm run host
```

Compartilhe o endereço da interface Wi-Fi/Ethernet (ex: `ws://192.168.18.6:25640`).
Não precisa configurar mais nada.

> Se o Windows perguntar sobre o firewall na primeira execução, permita o acesso
> em **redes privadas**.

### 2. Radmin VPN / Hamachi

Melhor opção para jogar com amigos pela internet **sem abrir portas no roteador**
e sem depender de serviço externo.

1. Instale o [Radmin VPN](https://www.radmin-vpn.com/) (gratuito) e crie uma rede.
2. Seus amigos entram na mesma rede.
3. Rode `npm run host`.
4. Compartilhe o endereço marcado como `VPN` (começa com `26.`).

O `npm run host` já separa e destaca esses endereços justamente porque é o
caminho mais usado aqui.

### 3. Túnel público (Cloudflare / ngrok)

Para quem vai entrar sem VPN e sem estar na sua rede. O túnel expõe seu servidor
na internet com um endereço temporário.

```bash
npm run host:tunnel
```

O script detecta automaticamente o que estiver instalado e imprime o endereço:

```
  Tunnel ativo. Compartilhe este endereco:
    wss://algo-aleatorio.trycloudflare.com
```

**Instalando o cloudflared** (recomendado — gratuito, sem cadastro, sem limite
de banda):

```bash
winget install --id Cloudflare.cloudflared
```

**Ou o ngrok** (precisa de conta gratuita):

```bash
winget install --id Ngrok.Ngrok
ngrok config add-authtoken SEU_TOKEN
```

Forçando um provedor específico:

```bash
npm run host -- --tunnel=cloudflared
npm run host -- --tunnel=ngrok
```

| | cloudflared | ngrok (grátis) |
|---|---|---|
| Cadastro | não precisa | precisa |
| Endereço fixo | não (muda a cada execução) | não |
| Limite de banda | sem limite prático | limitado |
| Latência extra | ~10–30 ms | ~20–60 ms |

> O túnel adiciona um salto na rota, então a latência sobe um pouco. Se todos
> puderem usar Radmin VPN, ela tende a ficar melhor.

### 4. VPS

Para um servidor sempre online, com endereço fixo. Em uma VPS Linux:

```bash
git clone https://github.com/gustavo-blacknaut/greenlabs-live-streaming.git
cd greenlabs-live-streaming
npm install --omit=dev
PORT=25640 node server/signaling.js
```

Mantendo no ar com systemd (`/etc/systemd/system/greenlabs.service`):

```ini
[Unit]
Description=GreenLabs Signaling
After=network.target

[Service]
Type=simple
User=greenlabs
WorkingDirectory=/opt/greenlabs-live-streaming
Environment=PORT=25640
ExecStart=/usr/bin/node server/signaling.js
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now greenlabs
```

Libere a porta no firewall:

```bash
sudo ufw allow 25640/tcp
```

Para usar `wss://` (recomendado se for público), coloque um Nginx ou Caddy na
frente com certificado. Exemplo com Caddy (`Caddyfile`):

```
call.seudominio.com {
    reverse_proxy localhost:25640
}
```

Verificando se está no ar:

```
http://SEU_IP:25640/rooms    lista as salas e participantes
http://SEU_IP:25640/stats    conexões e mensagens repassadas
```

---

## Por que um servidor no Brasil importa

O servidor de sinalização não carrega vídeo, mas **toda** troca de mensagens de
conexão passa por ele. Se ele estiver longe, o aperto de mão inicial fica lento
e o ping mostrado no app fica alto.

Latência típica até o servidor:

| Localização do servidor | Ping de um usuário no Brasil |
|---|---|
| Brasil (São Paulo) | 5–30 ms |
| Chile / Argentina | 40–70 ms |
| Estados Unidos (Leste) | 110–160 ms |
| Europa | 180–230 ms |

Recomendações:

- **Hospede no Brasil.** Se for VPS, escolha região São Paulo (`sa-east-1` na AWS,
  `southamerica-east1` no Google Cloud, ou provedores nacionais como Hostinger,
  Locaweb e KingHost).
- **Melhor ainda: hospede na sua própria máquina** com Radmin VPN, se todos
  estiverem no Brasil. Sem intermediário, é o menor ping possível.
- Evite hospedar fora do país se o grupo é todo brasileiro — o ganho de
  "estabilidade" não compensa 150 ms a mais em cada conexão.

---

## Requisitos mínimos

### Máquina de quem hospeda o servidor

O servidor de sinalização é muito leve. O gargalo é a **banda de upload de quem
transmite**, não o servidor.

| Participantes | CPU | RAM | Banda do servidor |
|---|---|---|---|
| até 4 | 1 core | 512 MB | 1 Mbps |
| até 8 | 1 core | 1 GB | 2 Mbps |
| até 16 | 2 cores | 2 GB | 5 Mbps |
| até 30 | 2 cores | 4 GB | 10 Mbps |

> Esses números são só para a sinalização. Uma VPS de R$ 20/mês aguenta
> tranquilamente 16 pessoas.

### Máquina de quem transmite

Como o WebRTC aqui é P2P (malha), **quem transmite envia uma cópia do vídeo para
cada participante**. É isso que limita o tamanho do grupo.

Upload necessário por qualidade, multiplicado pelo número de espectadores:

| Qualidade | Por espectador | 3 pessoas | 5 pessoas | 8 pessoas |
|---|---|---|---|---|
| 480p 30fps | ~0,9 Mbps | 2,7 Mbps | 4,5 Mbps | 7,2 Mbps |
| 720p 30fps | ~2,2 Mbps | 6,6 Mbps | 11 Mbps | 17,6 Mbps |
| 720p 60fps | ~3,2 Mbps | 9,6 Mbps | 16 Mbps | 25,6 Mbps |
| 1080p 30fps | ~4,5 Mbps | 13,5 Mbps | 22,5 Mbps | 36 Mbps |
| 1080p 60fps | ~7,5 Mbps | 22,5 Mbps | 37,5 Mbps | 60 Mbps |

Hardware para transmitir:

| | Mínimo | Recomendado |
|---|---|---|
| SO | Windows 10 64-bit | Windows 10 22H2 / 11 |
| CPU | 4 threads | 6+ threads |
| RAM | 4 GB | 8 GB |
| GPU | qualquer com aceleração de vídeo | GPU dedicada |
| Upload | 5 Mbps | 20+ Mbps |

**Regra prática:** se o seu upload é de 10 Mbps, transmita em 720p30 para até
4 pessoas, ou 480p30 para até 8. A qualidade é configurável em
**Configuração → Qualidade da tela**.

Para quem só assiste, o requisito é bem menor: qualquer PC que rode o app e
tenha download suficiente para receber os streams.

---

## Desenvolvimento

```bash
npm install
npm run app        # Vite + Electron juntos
npm run dev        # só o front (http://localhost:5173)
npm run server     # só a sinalização
npm run host       # sinalização + endereços da rede
npm run host:tunnel
npm run build      # front de produção
npm run build:installer
```

Estrutura:

```
electron/
  main.cjs            processo principal, janela, bandeja, IPC
  preload.cjs         ponte segura para o front
  AudioCapture.cs     captura de áudio por processo (WASAPI)
  AudioCapture.exe    binário compilado do arquivo acima
src/
  main.jsx            interface e toda a lógica de WebRTC
  styles.css
server/
  signaling.js        servidor WebSocket
  host.js             wrapper com endereços de rede e túnel
```

Recompilando a captura de áudio depois de mexer no `.cs`:

```bash
cd electron
csc -optimize -r:System.Management.dll -out:AudioCapture.exe AudioCapture.cs
```

O `csc.exe` vem com o .NET Framework, em
`C:\Windows\Microsoft.NET\Framework64\v4.0.30319\`.

---

## Solução de problemas

**O processo aparece como "Electron" no Gerenciador de Tarefas**
Isso só acontece no modo de desenvolvimento (`npm run app`), porque o executável
é o do Electron. No app instalado aparece como `GreenLabs.exe`.

**Não sai áudio na transmissão**
Confirme que o `AudioCapture.exe` está na pasta `electron/`. Se você mexeu no
`.cs`, recompile. Para diagnosticar, rode direto:

```bash
cd electron
AudioCapture.exe --port=25641 --exclude=discord
```

Ele imprime qual processo do Discord foi excluído e se a captura iniciou.

**O áudio do Discord ainda está sendo transmitido**
A exclusão pega uma árvore de processos por vez. Se você usa Discord PTB/Canary
junto com o normal, só um deles é excluído. Feche o que não estiver usando.

**Borda amarela ao redor da tela compartilhada**
É o Windows marcando a captura, não o app. Só é possível desativar no Windows 11
(ou Windows 10 build 20348+). No Windows 10 comum não há como remover.

**A janela abre transparente ou em branco**
Falha de composição da GPU. O app já força renderização por software para
contornar isso; se persistir, desative a aceleração por hardware em
**Configuração → Aceleração por Hardware**.

**"Ping alto" mas o vídeo está bom**
O ping mostrado é até o servidor de sinalização, não entre os participantes.
Um ping alto ali indica servidor distante — veja
[Por que um servidor no Brasil importa](#por-que-um-servidor-no-brasil-importa).

**Ninguém consegue entrar no meu servidor**
Nesta ordem: confirme que o firewall do Windows liberou a porta; teste
`http://SEU_IP:25640/rooms` no navegador de outra máquina; se estiver fora da
LAN, use Radmin VPN ou um túnel em vez do IP local.

---

## Créditos

Projeto pessoal desenvolvido com auxílio do **Claude Code** (Anthropic),
usado para pesquisa das APIs de áudio do Windows, depuração da interoperabilidade
COM e implementação da interface.

A captura de áudio por processo tomou como referência o
[win-capture-audio](https://github.com/bozbez/win-capture-audio) e o
[exemplo oficial de Application Loopback](https://github.com/microsoft/Windows-classic-samples/tree/main/Samples/ApplicationLoopback)
da Microsoft — em especial o formato IEEE float exigido pelo cliente de process
loopback e a necessidade de um completion handler *agile*.

### Stack

Electron · React · Vite · WebRTC · WASAPI (C#) · ws
