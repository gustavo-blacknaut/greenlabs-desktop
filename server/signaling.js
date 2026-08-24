import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { resolverPorta } from './env.js';

export function startSignaling({ port, log = defaultLog } = {}) {
  // A porta pode vir por argumento, por PORT no .env/ambiente, ou por
  // SERVER_PORT (que é como o Pterodactyl entrega a porta alocada).
  const portaFinal = resolverPorta(port);
  const rooms = new Map();
  const serverStats = {
    startedAt: new Date().toISOString(),
    totalConnections: 0,
    totalMessagesRelayed: 0,
  };

  const server = http.createServer((req, res) => {
    if (req.url?.startsWith('/rooms')) {
      const data = {};
      for (const [roomId, peers] of rooms) {
        data[roomId] = {
          total: peers.size,
          participantes: [...peers.values()].map((p) => ({
            id: p.peerId,
            nome: p.name,
            pingMs: p.lastPingMs ?? 0,
          })),
        };
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, aplicativo: 'Sinalizacao GreenLabs PT-BR', salas: data }, null, 2));
      return;
    }

    if (req.url?.startsWith('/stats')) {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, estatisticas: serverStats, salasAtivas: rooms.size }, null, 2));
      return;
    }

    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, mensagem: 'Servidor de Sinalizacao GreenLabs Ativo', salasAtivas: rooms.size }));
  });

  const wss = new WebSocketServer({ server, maxPayload: 0, perMessageDeflate: false });

  function send(ws, payload) {
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  function broadcastRoomPings(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    const pingMap = {};
    for (const peer of room.values()) {
      pingMap[peer.peerId] = peer.lastPingMs || 0;
    }
    for (const peer of room.values()) {
      send(peer, { type: 'room-pings', pings: pingMap });
    }
  }

  // Each client pings once a second, and each ping used to trigger a full
  // broadcast to the room - n pings/s x n recipients, so the traffic grew with
  // the square of the room. Measured: 30 participants pushed ~8 Mbps of nothing
  // but ping updates. Coalescing to one broadcast per second per room makes it
  // linear, and the numbers are the same either way since the clients only ping
  // that often to begin with.
  const pingDirty = new Set();
  const pingFlush = setInterval(() => {
    for (const roomId of pingDirty) broadcastRoomPings(roomId);
    pingDirty.clear();
  }, 1000);
  if (typeof pingFlush.unref === 'function') pingFlush.unref();

  function scheduleRoomPings(roomId) {
    if (roomId) pingDirty.add(roomId);
  }

  function leave(ws) {
    if (!ws.roomId || !rooms.has(ws.roomId)) return;
    const room = rooms.get(ws.roomId);
    room.delete(ws.peerId);
    log(`SAIDA: sala=${ws.roomId} id=${ws.peerId} nome=${ws.name} restantes=${room.size}`);
    for (const peer of room.values()) send(peer, { type: 'peer-left', peerId: ws.peerId });
    if (room.size === 0) {
      rooms.delete(ws.roomId);
      log(`SALA VAZIA: removida=${ws.roomId}`);
    } else {
      broadcastRoomPings(ws.roomId);
    }
  }

  const heartbeatInterval = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        log(`DEAD PEER / CRASH DETECTADO: id=${ws.peerId || 'desconhecido'}`);
        leave(ws);
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        leave(ws);
        ws.terminate();
      }
    }
  }, 3000);

  wss.on('close', () => clearInterval(heartbeatInterval));

  wss.on('connection', (ws, req) => {
    ws.peerId = randomUUID();
    ws.lastPingMs = 0;
    ws.isAlive = true;
    serverStats.totalConnections += 1;
    if (req.socket) req.socket.setNoDelay(true);

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    log(`CONEXAO: id=${ws.peerId} ip=${req.socket?.remoteAddress || '-'}`);

    ws.on('message', (raw) => {
      ws.isAlive = true;
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (message.type === 'ping') {
        const now = Date.now();
        const clientTime = Number(message.timestamp || now);
        // The round trip is measured by the client against its own clock and
        // reported back. Using (serverNow - clientTime) would measure clock
        // skew between machines instead of latency.
        const reported = Number(message.rtt);
        if (Number.isFinite(reported) && reported >= 0) {
          ws.lastPingMs = Math.max(1, Math.round(reported));
        }
        send(ws, { type: 'pong', timestamp: clientTime, serverTime: now });
        scheduleRoomPings(ws.roomId);
        return;
      }

      if (message.type === 'join') {
        leave(ws);
        ws.roomId = String(message.roomId || 'call1').trim() || 'call1';
        ws.name = String(message.name || 'Usuario').slice(0, 40);
        if (!rooms.has(ws.roomId)) rooms.set(ws.roomId, new Map());
        const room = rooms.get(ws.roomId);
        const peers = [...room.values()].map((peer) => ({ peerId: peer.peerId, name: peer.name, pingMs: peer.lastPingMs }));
        room.set(ws.peerId, ws);
        log(`ENTROU: sala=${ws.roomId} id=${ws.peerId} nome=${ws.name} total=${room.size}`);
        send(ws, { type: 'joined', peerId: ws.peerId, peers, count: room.size });
        for (const peer of room.values()) {
          if (peer !== ws) send(peer, { type: 'peer-joined', peerId: ws.peerId, name: ws.name, count: room.size });
        }
        broadcastRoomPings(ws.roomId);
        return;
      }

      if (!ws.roomId || !message.to) return;
      const target = rooms.get(ws.roomId)?.get(message.to);
      if (!target) return;
      serverStats.totalMessagesRelayed += 1;
      send(target, { ...message, from: ws.peerId });
    });

    ws.on('close', () => {
      log(`DESCONECTADO: id=${ws.peerId} sala=${ws.roomId || '-'}`);
      leave(ws);
    });

    ws.on('error', (err) => {
      log(`ERRO SOQUETE: id=${ws.peerId} ${err.message}`);
      leave(ws);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(portaFinal, '0.0.0.0', () => {
      server.removeListener('error', reject);
      log(`Servidor de Sinalizacao GreenLabs rodando em http://0.0.0.0:${portaFinal}`);
      resolve({
        port: portaFinal,
        get rooms() {
          return rooms.size;
        },
        close: () =>
          new Promise((done) => {
            clearInterval(heartbeatInterval);
            clearInterval(pingFlush);
            for (const client of wss.clients) {
              try { client.terminate(); } catch {}
            }
            wss.close(() => server.close(() => done()));
          }),
      });
    });
  });
}

function defaultLog(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  // Sem porta explícita: quem resolve é o startSignaling, via PORT/SERVER_PORT.
  startSignaling().then((instance) => {
    defaultLog(`Acesse http://localhost:${instance.port}/rooms para verificar estatisticas em PT-BR`);
  });
}
