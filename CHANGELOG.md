# Changelog

Todas as mudanças notáveis do app desktop, por versão. Formato livre, em
português, ligado aos [releases do GitHub](https://github.com/gustavo-blacknaut/greenlabs-live-streaming/releases).

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
