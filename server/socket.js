import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createRoom, addPlayer, removePlayer, beginLevel, acceptInput, stepRoom, snapshot } from './simulation.js';

export function attachCoop(server) {
  const rooms = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
  const send = (socket, message) => {
    if (socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 256 * 1024) socket.send(JSON.stringify(message));
  };
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/coop') return;
    if (wss.clients.size >= 128) { socket.destroy(); return; }
    wss.handleUpgrade(request, socket, head, client => wss.emit('connection', client));
  });
  wss.on('connection', socket => {
    socket.id = randomUUID();
    socket.alive = true;
    socket.on('error', () => {});
    socket.on('pong', () => { socket.alive = true; });
    let tokens = 100;
    let refill = Date.now();
    socket.on('message', data => {
      const now = Date.now();
      tokens = Math.min(100, tokens + (now - refill) * 0.06); refill = now;
      if (--tokens < 0) { socket.close(1008, 'Rate limit'); return; }
      try {
        const msg = JSON.parse(data.toString());
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'create' || msg.type === 'join') {
          if (socket.room) throw new Error('Már csatlakoztál egy szobához.');
          let room;
          if (msg.type === 'create') {
            if (rooms.size >= 32) throw new Error('A szerver megtelt.');
            room = createRoom(typeof msg.seed === 'string' ? msg.seed : '');
            while (rooms.has(room.code)) room = createRoom(room.seed);
          } else {
            room = rooms.get(String(msg.code || '').trim().toUpperCase());
            if (!room) throw new Error('Nincs ilyen szobakód.');
          }
          addPlayer(room, socket.id, msg.name);
          rooms.set(room.code, room);
          socket.room = room;
          send(socket, { type: 'welcome', id: socket.id, code: room.code });
        } else if (msg.type === 'input' && socket.room) acceptInput(socket.room, socket.id, msg);
        else if (msg.type === 'begin' && socket.room) beginLevel(socket.room, socket.id);
      } catch (error) {
        send(socket, { type: 'error', message: error instanceof SyntaxError ? 'Hibás üzenet.' : error.message });
      }
    });
    socket.on('close', () => {
      if (!socket.room) return;
      removePlayer(socket.room, socket.id);
      if (!socket.room.players.size) rooms.delete(socket.room.code);
    });
  });
  let tick = 0;
  const timer = setInterval(() => {
    tick++;
    for (const room of rooms.values()) {
      stepRoom(room, 1 / 30);
      if (tick % 2 === 0 || room.status !== 'playing') {
        const state = snapshot(room);
        for (const client of wss.clients) if (client.room === room) send(client, state);
      }
    }
  }, 1000 / 30);
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (!client.alive) { client.terminate(); continue; }
      client.alive = false; client.ping();
    }
  }, 15000);
  const close = () => { clearInterval(timer); clearInterval(heartbeat); for (const client of wss.clients) client.terminate(); wss.close(); };
  server.once('close', close);
  return { rooms, close };
}
