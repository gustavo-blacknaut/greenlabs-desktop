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
- [Versão web (site)](#versão-web-site)
- [Compartilhar tela: onde funciona](#compartilhar-tela-onde-funciona)
- [Hospedando o servidor](#hospedando-o-servidor)
  - [Pelo aplicativo (mais simples)](#pelo-aplicativo-mais-simples)
  - [Pelo terminal](#pelo-terminal)
  - [Sobre a porta](#sobre-a-porta)
  - [Guia completo de hospedagem](#guia-completo-de-hospedagem)
  - [Atualizando um servidor que já estava rodando](#atualizando-um-servidor-que-já-estava-rodando)
- [Por que um servidor no Brasil importa](#por-que-um-servidor-no-brasil-importa)
- [Requisitos mínimos](#requisitos-mínimos)
- [Desenvolvimento](#desenvolvimento)
- [Solução de problemas](#solução-de-problemas)
- [Changelog](#changelog)
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

## Versão web (site)

O mesmo cliente roda no navegador, publicado por GitHub Pages a cada push na
`main` (workflow em `.github/workflows/pages.yml`).

Para ativar no seu fork: **Settings → Pages → Source: GitHub Actions**.

### O que muda no navegador

| Recurso | App Windows | Site |
|---|---|---|
| Assistir | ✅ | ✅ |
| Câmera e microfone | ✅ | ✅ |
| Compartilhar tela | ✅ | ✅ (só HTTPS) |
| Áudio do sistema junto da tela | ✅ sem o Discord | ⚠️ tudo ou nada |
| Hospedar servidor pelo app | ✅ | ❌ |

O filtro que remove o Discord depende do WASAPI, que só existe no Windows. No
navegador o que dá é a caixa nativa "compartilhar áudio", que envia o mix
inteiro — incluindo o Discord — ou nada.

### Atenção ao endereço do servidor

Um site em HTTPS **não consegue abrir `ws://`** (mixed content). Então:

| Origem do cliente | Servidor aceito |
|---|---|
| App Windows | `ws://` e `wss://` |
| Site HTTPS | só `wss://` |
| `http://localhost` (dev) | `ws://` e `wss://` |

Na prática, quem usa o site precisa de um servidor com `wss://` — o jeito mais
simples é ligar o túnel na aba **Hospedar**, que já entrega um endereço `wss://`.
Servidor em rede local por IP só funciona pelo app.

---

## Compartilhar tela: onde funciona

| Plataforma | Compartilhar tela | Qualidade | Motivo |
|---|---|---|---|
| App Windows | ✅ | até 1080p 60fps | `getDisplayMedia` + WASAPI |
| **[App Android](https://github.com/gustavo-blacknaut/greenlabs-live-streaming-mobile)** | ✅ | até 720p 15fps | `MediaProjection` nativo |
| Chrome/Edge/Firefox desktop (HTTPS) | ✅ | até 1080p 60fps | `getDisplayMedia` disponível |
| Safari desktop | ✅ | até 1080p 60fps | `getDisplayMedia` disponível |
| Qualquer navegador em HTTP | ❌ | — | exige secure context |
| Android pelo navegador | ❌ | — | `getDisplayMedia` não é implementado |
| iOS / iPadOS Safari | ❌ | — | não implementado |

Nenhum navegador Android implementa `getDisplayMedia` — o
[caniuse](https://caniuse.com/mdn-api_mediadevices_getdisplaymedia) marca como
não suportado em Chrome for Android, Android Browser e Samsung Internet. Não é
limitação do WebView, é da plataforma inteira para conteúdo web.

Por isso o **app Android** não usa a API do navegador: ele captura pelo
`MediaProjection` nativo (o mesmo que Discord e Zoom usam), entrega os frames ao
WebView por um servidor HTTP local, e o lado web transforma isso numa
`MediaStream` de verdade via `canvas.captureStream()`.

A resolução é menor que no desktop de propósito: os frames são codificados em
JPEG por software, não por hardware, então 720p/15fps é o limite razoável antes
do consumo de CPU e bateria ficar alto demais num celular. O Android também
exige uma notificação persistente enquanto a tela está sendo transmitida — é
política da plataforma, não dá para remover.

---

## Hospedando o servidor

### Pelo aplicativo (mais simples)

Abra **Configuração → Hospedar**, escolha a porta, marque **Abrir túnel** se
quiser acesso pela internet, e clique em **Iniciar servidor**.

O servidor roda dentro do próprio GreenLabs — não precisa de terminal nem de
Node instalado. A aba lista os endereços prontos para compartilhar, com botão de
copiar, e um botão **Usar** para você mesmo entrar no seu servidor.

Endereços marcados com **VPN** são de Radmin VPN ou Hamachi. Se o túnel estiver
ativo, o endereço público (`wss://...`) aparece destacado no topo.

Clicar em **Parar servidor** encerra tudo e libera a porta.

### Pelo terminal

Para hospedar sem abrir a interface — em uma VPS, por exemplo:

```bash
npm run host              # só rede local / Radmin VPN
npm run host:tunnel       # + túnel público (cloudflared ou ngrok)
```

Ele sobe o servidor e lista os endereços que você pode compartilhar:

```
  Enderecos para quem esta na mesma rede:
    ws://26.99.130.99:25640   (Radmin VPN - VPN)
    ws://192.168.18.6:25640   (Wi-Fi)
```

Quem for entrar cola esse endereço no campo **Servidor** do GreenLabs. Pode
digitar com ou sem `ws://` — o app normaliza sozinho.

### Sobre a porta

A porta `25640` é só o padrão do projeto — não tem nada de especial nela.
**Use a porta que estiver aberta na sua hospedagem.** Qualquer porta livre acima
de 1024 serve.

```bash
npm run host -- --port 30000
```

Ou por variável de ambiente:

```bash
PORT=30000 node server/signaling.js
```

Quem entra precisa usar a mesma porta no endereço (`ws://SEU_IP:30000`). Ao usar
túnel, a porta não aparece no endereço público — o cloudflared/ngrok cuida disso.

### Guia completo de hospedagem

Para hospedar em VPS, Linux, Windows como serviço, Pterodactyl ou Docker, sem
precisar baixar o app de desktop inteiro, existe um repositório dedicado só
para o servidor:

**→ [github.com/gustavo-blacknaut/greenlabs-live-streaming-server](https://github.com/gustavo-blacknaut/greenlabs-live-streaming-server)**

Lá tem o passo a passo completo de cada método:

| Método | Alcance | Precisa de conta/porta aberta? |
|---|---|---|
| Mesma rede (LAN) | só quem está na mesma Wi-Fi/cabo | não |
| Radmin VPN / Hamachi | qualquer lugar, rede virtual | não |
| Túnel (cloudflared/ngrok) | qualquer lugar, internet pública | cloudflared não, ngrok sim |
| VPS (systemd/pm2) | qualquer lugar, endereço fixo | porta no firewall |
| Windows como serviço (NSSM/pm2) | conforme o método acima | conforme o método acima |
| Pterodactyl | qualquer lugar, painel cuida da porta | depende do painel |
| Docker | qualquer lugar | porta exposta no container |

### Atualizando um servidor que já estava rodando

O servidor mudou nesta versão. Se você já tinha uma instância no ar:

```bash
cd greenlabs-live-streaming
git pull
npm install --omit=dev
sudo systemctl restart greenlabs   # ou reinicie como você subiu
```

O que mudou:

- `signaling.js` agora exporta `startSignaling()` além de rodar direto. Continua
  funcionando com `node server/signaling.js` e com `PORT=...` do mesmo jeito.
- Novos arquivos `server/tunnel.js` e `server/host.js` (opcionais para uma VPS —
  são usados pelo `npm run host` e pela aba Hospedar do app).
- **Correção no ping**: antes o servidor calculava a latência dos participantes
  como `horárioDoServidor - horárioDoCliente`, o que na prática media a diferença
  de relógio entre as máquinas, não a latência. Agora o cliente envia o RTT que
  ele mesmo mediu e o servidor só repassa.

Compatibilidade entre versões:

| Combinação | Resultado |
|---|---|
| Cliente novo + servidor novo | ping correto |
| Cliente antigo + servidor novo | conecta normal; o ping dos outros aparece como 0 |
| Cliente novo + servidor antigo | conecta normal; ping dos outros continua errado |

Ou seja, dá para atualizar servidor e clientes em qualquer ordem — nada quebra,
só o ping dos participantes fica impreciso até os dois lados estarem atualizados.

Verificando se um servidor está no ar (funciona com qualquer método acima):

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

O servidor de sinalização é **muito** leve — o gargalo é a banda de upload de
quem transmite, não o servidor.

Números medidos rodando o servidor de verdade e conectando N participantes que
trocam sinalização e pingam a cada segundo (`process.memoryUsage()` para a
memória, bytes contados no socket para a banda):

| Participantes | RAM (RSS) | Banda de sinalização |
|---|---|---|
| ocioso, ninguém conectado | 49 MB | — |
| 4 | 50 MB | 9 kbps |
| 8 | 51 MB | 30 kbps |
| 16 | 51 MB | 103 kbps |
| 30 | 56 MB | 338 kbps |

Quase toda essa memória é o próprio runtime do Node: 30 participantes custam
cerca de **7 MB acima do servidor vazio**. Um core basta em qualquer um desses
cenários — o processo fica ocioso a maior parte do tempo, só repassando
mensagens pequenas.

> Uma versão anterior deste README trazia uma tabela pedindo até 4 GB de RAM
> para 30 pessoas. Aquilo era estimativa, não medição, e estava errado por uma
> ordem de grandeza enorme. Os números acima vieram de medir.

O que costuma limitar não é o servidor, e sim a porta disponível na hospedagem
e o upload de quem transmite.

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
  main.jsx            componente da chamada: estado, WebRTC e a interface
  icons.jsx           ícones SVG
  styles.css
  lib/
    media.js          perfis de qualidade, ICE, ajuste do sender
    format.js         normalização do endereço e lista de participantes
    wasapi-audio.js   áudio do sistema sem o Discord (Windows)
    android-screen.js ponte para a captura de tela nativa do Android
server/
  signaling.js        servidor WebSocket (exporta startSignaling)
  tunnel.js           endereços da rede e cloudflared/ngrok
  host.js             CLI de hospedagem
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

## Changelog

O que mudou em cada versão está no [CHANGELOG.md](CHANGELOG.md).

## Créditos

Projeto pessoal desenvolvido com auxílio do **Claude Code** (Anthropic),
usado para pesquisa das APIs de áudio do Windows, depuração da interoperabilidade
COM e implementação da interface.

A captura de áudio por processo tomou como referência o
[win-capture-audio](https://github.com/bozbez/win-capture-audio) e o
[exemplo oficial de Application Loopback](https://github.com/microsoft/Windows-classic-samples/tree/main/Samples/ApplicationLoopback)
da Microsoft — em especial o formato IEEE float exigido pelo cliente de process
loopback e a necessidade de um completion handler *agile*.

### Projetos relacionados

- [greenlabs-live-streaming-server](https://github.com/gustavo-blacknaut/greenlabs-live-streaming-server) — só o servidor, para hospedar sem baixar o app inteiro
- [greenlabs-live-streaming-mobile](https://github.com/gustavo-blacknaut/greenlabs-live-streaming-mobile) — cliente Android

### Stack

Electron · React · Vite · WebRTC · WASAPI (C#) · ws
