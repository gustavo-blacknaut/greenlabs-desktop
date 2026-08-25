# Changelog

Todas as mudanças notáveis do app desktop, por versão. Formato livre, em
português, ligado aos [releases do GitHub](https://github.com/gustavo-blacknaut/greenlabs-live-streaming/releases).

## [0.2.7](https://github.com/gustavo-blacknaut/greenlabs-live-streaming/releases/tag/v0.2.7) — 2026-08-24

Quatro defeitos no áudio, todos localizados no código antes de qualquer correção:

- **O app podia excluir a si mesmo em vez do Discord.** O modo EXCLUDE do
  WASAPI aceita uma árvore de processos por vez, e o alvo era escolhido a
  partir de um `HashSet` — cuja ordem muda entre execuções. Com `electron` e
  `greenlabs` na lista, o capturador às vezes elegia a própria árvore, e o som
  do Discord passava direto. Agora a árvore do capturador nunca é candidata, e
  a escolha é ordenada: mesma situação, mesmo resultado.
- **O áudio virava um segundo card, rotulado como câmera.** Ao anexar a faixa
  de áudio, o app criava uma `MediaStream` nova. Como o id mudava, o outro lado
  via um stream desconhecido e abria outro card — sem vídeo, então classificado
  como câmera. A faixa agora entra na mesma stream já publicada.
- **O Electron entregava o som do sistema inteiro.** O handler de captura
  concedia `audio: 'loopback'`, que inclui o Discord — exatamente o que este
  app existe para evitar. O áudio da transmissão vem só do capturador por
  processo.
- **A tela de configuração de áudio não fazia nada.** A lista de programas era
  gravada no navegador e nunca chegava ao capturador, que seguia com a lista de
  fábrica. Agora mudar a lista reinicia a captura com ela.

Também:

- **Restaurar fábrica** só mexia no servidor e na sala. Agora repõe também a
  exclusão de áudio, o compartilhamento de som, a divisão de tela e a
  qualidade.
- **Removido o sistema antigo de mute** (`mute-audio.ps1`), que silenciava os
  aplicativos no mixer do Windows. Ele tirava o som do Discord da própria
  pessoa — o oposto do objetivo — e continuava no código sem uso.
- **Removida a opção "whitelist"** da configuração: ela prometia mutar o
  Windows inteiro, comportamento do sistema que saiu.

> **Nota sobre as versões 0.2.2 a 0.2.4:** algumas entradas descreviam
> correções do app Android como se fossem deste repositório. O app Android tem
> [repositório e versionamento próprios](https://github.com/gustavo-blacknaut/greenlabs-live-streaming-mobile);
> o que mora aqui é a metade web dessas correções, já que o app embute o mesmo
> cliente React. Corrigido a partir da 0.2.5.

## [0.2.5](https://github.com/gustavo-blacknaut/greenlabs-live-streaming/releases/tag/v0.2.5) — 2026-08-24

- **Tráfego de sinalização reduzido em até 23x.** Cada ping de cada
  participante disparava um broadcast para a sala inteira — n pings por
  segundo vezes n destinatários, ou seja, tráfego crescendo com o *quadrado*
  do tamanho da sala. Medido: 30 participantes geravam ~8 Mbps só de
  atualização de ping. Agora os broadcasts são agrupados em um por segundo por
  sala — o resultado para quem usa é o mesmo, já que os clientes só pingam
  nessa frequência.

  | Participantes | Antes | Depois |
  |---|---|---|
  | 4 | 28 kbps | 9 kbps |
  | 8 | 186 kbps | 30 kbps |
  | 16 | 1454 kbps | 103 kbps |
  | 30 | 7957 kbps | 338 kbps |

- **`main.jsx` dividido em módulos.** Eram 2140 linhas num arquivo só,
  misturando ícones, helpers, a ponte do Android e a lógica da chamada. Agora
  são `icons.jsx`, `lib/media.js`, `lib/format.js`, `lib/wasapi-audio.js` e
  `lib/android-screen.js` — este último isolando o código que só existe para o
  app Android e que antes ficava enterrado no meio do cliente desktop.
- **Requisitos mínimos corrigidos no README.** A tabela anterior pedia até
  4 GB de RAM para 30 participantes. Era estimativa, não medição, e estava
  errada por uma ordem de grandeza: medido, o servidor usa **56 MB** com 30
  participantes — cerca de 7 MB acima do processo ocioso.
- README atualizado: o app Android **transmite tela** desde a v1.0.3 (até
  720p/15fps, via `MediaProjection` nativo), com link para o repositório.

## [0.2.4](https://github.com/gustavo-blacknaut/greenlabs-live-streaming/releases/tag/v0.2.4) — 2026-08-24

- Metade web do ajuste de layout para celular: barra de ações no rodapé
  (transmitir tela, câmera, configuração, entrar/sair), alvos de toque maiores
  e leitura das variáveis `--android-inset-*` publicadas pelo app Android, para
  o layout não correr por baixo das barras do sistema. O layout de desktop não
  muda.

## [0.2.3](https://github.com/gustavo-blacknaut/greenlabs-live-streaming/releases/tag/v0.2.3) — 2026-08-24

- **Áudio sumiu de novo na 0.2.2 — regressão minha, corrigida.** Ao apertar
  o buffer para reduzir o delay, a margem de descarte ficou em 40ms, abaixo
  do tamanho natural das rajadas em que o áudio chega (o leitor HTTP acorda
  com um bloco, não com uma amostra de cada vez). Resultado medido: contra
  rajadas de 60ms, **só 66% do áudio tocava** — um terço era descartado no
  instante em que chegava, e a saída ficava com buracos de silêncio.
  Agora a margem parte de 40ms mas cresce sozinha até o dobro da maior
  rajada observada: medido em 98–99% de aproveitamento com rajadas de 10ms,
  60ms e 120ms, sem descarte, mantendo o delay baixo quando a entrega é
  suave.
- **Layout de celular refeito com abas.** Dividir uma tela de 375px entre o
  palco e um painel de duas colunas deixava tudo pequeno demais. Agora uma
  barra inferior alterna entre **Telas**, **Transmissões** e **Usuários**, e
  a seção ativa ocupa a tela inteira (medido: 638px em vez de 309px). O
  layout de desktop não muda.

## [0.2.2](https://github.com/gustavo-blacknaut/greenlabs-live-streaming/releases/tag/v0.2.2) — 2026-08-24

- **Delay do áudio da tela reduzido.** Com o áudio realmente chegando no
  remoto (fix da 0.2.1), o delay residual ficou perceptível — o buffer do
  `AudioWorklet` no navegador foi de 200ms/100ms de margem para 120ms/40ms.
- **Compartilhar tela "teleportando" no Android.** Os frames JPEG chegavam
  em rajadas e eram desenhados assim que decodificados; se várias chegassem
  juntas e depois nada por um tempo, dava a impressão de salto em vez de
  movimento contínuo. Agora o desenho no canvas é espaçado pelo intervalo
  do fps alvo, descartando o excesso entre um desenho e outro.
- **"Failed to fetch" ao tentar compartilhar tela.** Adicionado retry com
  backoff na conexão inicial ao stream nativo.
- **Transmissão caía e o app continuava dizendo que estava transmitindo.**
  Se a conexão com o stream de tela morresse no meio (rede, serviço
  encerrado), o erro era engolido silenciosamente e a UI nunca era
  avisada. Agora qualquer queda encerra a faixa de vídeo de verdade — o
  que já limpa o card na tela sozinho — e mostra um aviso.
- **Insets do Android não aplicavam no primeiro carregamento.** O listener
  de `WindowInsets` era registrado depois de `setContentView()`, perdendo o
  único despacho automático que acontece nesse momento — o padding do topo
  só aparecia depois de algum evento novo (rotação, teclado). Corrigido
  forçando um novo despacho (`requestApplyInsets`) logo após registrar o
  listener.
- **Notificação do compartilhamento de tela ganhou botões**: "Parar
  transmissão" e "Sair da chamada", direto da notificação, sem precisar
  voltar pro app.

## [0.2.1](https://github.com/gustavo-blacknaut/greenlabs-live-streaming/releases/tag/v0.2.1) — 2026-08-24

Dois bugs que só ficaram visíveis depois que o áudio da tela voltou a
funcionar (0.2.0 corrigiu a captura, mas a entrega tinha outro problema):

- **Áudio da tela nunca chegava no remoto.** `pc.addTrack(audioTrack, ...)`
  rodava sem renegociar a conexão depois. A faixa era enviada de verdade,
  só que o outro lado nunca ficava sabendo que ela existia — corrigido com
  `makeOffer(peerId)` após o `addTrack`.
- **`setShareError` nunca existiu.** Toda mensagem de erro de câmera ou
  tela, desde sempre, lançava `ReferenceError` e sumia sem avisar ninguém.
  Declarado o estado que faltava, com um aviso de verdade na tela.

## [0.2.0](https://github.com/gustavo-blacknaut/greenlabs-live-streaming/releases/tag/v0.2.0) — 2026-08-24

- **Delay de ~1-2s no áudio sem Discord, corrigido.** O buffer do WASAPI
  pedia 5 segundos (sobra de um teste antigo) — reduzido para 200ms. O
  pipeline no navegador trocou de `ScriptProcessorNode` (thread principal,
  vulnerável a travadas de UI) para `AudioWorkletNode` (thread dedicada de
  áudio), que não sofre com isso.
- **Compartilhar tela no Android.** Nenhum navegador Android implementa
  `getDisplayMedia`; o app mobile captura via `MediaProjection` nativo e
  entrega os frames por HTTP local, que viram uma `MediaStream` de verdade
  via `canvas.captureStream()` — reaproveita o mesmo caminho de código que
  uma câmera já usava.
- **Site publicado por GitHub Pages**, com HTTPS (exigido pelo
  `getDisplayMedia`) e documentação de onde compartilhar tela funciona.
- **Túnel instalável direto pelo app** (cloudflared e ngrok, sem depender
  de winget) e **Radmin VPN** como método de hospedagem sem túnel.
- **Servidor de sinalização extraído** para o repositório dedicado
  [greenlabs-live-streaming-server](https://github.com/gustavo-blacknaut/greenlabs-live-streaming-server).
- Removidos dois arquivos de ícone duplicados (mesma imagem, nomes
  trocados entre pastas, sem uso).
- Corrigido um bloco de instruções de hospedagem que tinha ficado
  duplicado por um patch anterior.

## 0.1.1 — primeira versão publicada no GitHub (sem release dedicado)

- **Captura de áudio por processo via WASAPI** (modo *exclude*): transmite
  o som do sistema sem o Discord, sem mutar nada localmente — você continua
  ouvindo normal, só quem entra na chamada não escuta o Discord.
- **Hospedagem do servidor direto pela interface do app** (aba
  Hospedar/Configuração), sem precisar de Node instalado nem terminal.
- Correção no cálculo de ping: o servidor media diferença de relógio entre
  máquinas em vez do RTT de verdade; agora usa o valor medido pelo cliente.
- Janela sem moldura com barra de título própria, divisor de tela de
  1/2/4, painel lateral recolhível, seletor de câmera com preview, tela de
  primeira execução.
- README com tutorial de hospedagem (LAN, Radmin VPN, túnel, VPS) e
  requisitos por número de participantes.
