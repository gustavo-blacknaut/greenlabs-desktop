# Servidor de sinalização

Servidor WebSocket das calls do GreenLabs. Só repassa mensagens de conexão —
vídeo e áudio vão direto entre os participantes.

Roda sobre HTTP + WebSocket, então funciona sem certificado SSL.

## Rodando

Da raiz do projeto, com os endereços da rede listados:

```bash
npm run host
```

Com túnel público (cloudflared ou ngrok):

```bash
npm run host:tunnel
```

Só o servidor, sem nada em volta:

```bash
node signaling.js
```

Porta padrão: `25640`. Para trocar:

```bash
PORT=30000 node signaling.js
```

No Windows (PowerShell):

```powershell
$env:PORT = "30000"; node signaling.js
```

## Verificando

```
http://localhost:25640/rooms    salas e participantes
http://localhost:25640/stats    conexões e mensagens repassadas
```

## Hospedagem

O guia completo — LAN, Radmin VPN, túnel, VPS, requisitos por número de
participantes e por que hospedar no Brasil — está no
[README principal](../README.md#hospedando-o-servidor).
