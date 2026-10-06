# GreenLabs Desktop

Cliente para Windows e Linux em Electron, React e TypeScript. Compartilha tela,
camera e audio, sem cadastro. No Windows, a captura WASAPI permite excluir a
arvore de processos de um aplicativo do som transmitido.

[Baixar aplicativo](https://github.com/gustavo-blacknaut/greenlabs-desktop/releases/latest)

## Uso

Informe apelido, endereco WebSocket do servidor e sala. Participantes precisam
usar o mesmo servidor e a mesma sala. A aba Hospedar inicia o servidor Go
incorporado; acesso pela internet pode exigir encaminhamento de portas ou tunel.

O servidor suporta P2P, com midia direta entre participantes, e SFU, com
retransmissao pelo servidor. No SFU, banda e processamento crescem com as
transmissoes e os espectadores. STUN nao garante conexao em toda rede; firewalls
e NAT restritivo podem exigir TURN ou ajustes de infraestrutura.

## Desenvolvimento

Use Node.js compativel com Electron e Vite do package-lock.json. O workflow
de release usa Node.js 24. Instale dependencias com `npm ci`.

```sh
npm run app
npm run typecheck
npm run build
```

O servidor incorporado vem do
[greenlabs-server](https://github.com/gustavo-blacknaut/greenlabs-server).
Para empacotar, compile ./src desse repositorio e coloque o executavel em
release/server/greenlabs-signaling.exe no Windows, ou
release/server/greenlabs-signaling no Linux. O executavel fica fora do ASAR.
Em desenvolvimento, a aba Hospedar procura a copia em electron/.

```sh
npx electron-builder --win nsis portable --x64 --publish never
npx electron-builder --linux --x64 --publish never
```

Tags v* acionam verificacao de tipos, builds e publicacao para Windows e Linux.
O workflow fixa a versao do servidor incorporado.

## Estabilidade

A reconexao tem atraso progressivo e variacao aleatoria para reduzir rajadas.
Eventos de sockets substituidos sao ignorados. Atualizacoes de ping sem mudanca
nao redesenham a chamada, e os elementos de video liberam os streams ao sair.
Logs detalhados do servidor hospedado sao habilitados com GREENLABS_DEBUG=1.

Se houver travamento, informe versao, sistema, GPU/driver, quantidade de pessoas,
resolucao, FPS e se a chamada usa P2P ou SFU. Build e verificacao de tipos nao
substituem testes de captura e reproducao em dispositivos reais.

## Outros clientes

- [Windows C++](https://github.com/gustavo-blacknaut/greenlabs-windows)
- [Android](https://github.com/gustavo-blacknaut/greenlabs-android)
- [Site](https://github.com/gustavo-blacknaut/greenlabs-site)

## Creditos e licenca

A captura por processo usa como referencias o
[win-capture-audio](https://github.com/bozbez/win-capture-audio) e o
[Application Loopback da Microsoft](https://github.com/microsoft/Windows-classic-samples/tree/main/Samples/ApplicationLoopback).
Veja LICENSE para a licenca do projeto.
