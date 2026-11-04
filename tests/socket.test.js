import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';
import { attachCoop } from '../server/socket.js';

test('real sockets isolate rooms, enforce four players, and clean up empty rooms', async t => {
  const server = createServer();
  const service = attachCoop(server);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const sockets = [];
  t.after(() => { for (const ws of sockets) ws.terminate(); service.close(); server.close(); });
  const connect = async message => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/coop`);
    sockets.push(ws);
    ws.messages = [];
    ws.on('message', data => ws.messages.push(JSON.parse(data)));
    await once(ws, 'open'); ws.send(JSON.stringify(message));
    return ws;
  };
  const wait = async predicate => {
    for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
    assert.fail('Timed out waiting for server state');
  };
  const host = await connect({ type: 'create', seed: 'shared' });
  await wait(() => host.messages.some(m => m.type === 'welcome'));
  const code = host.messages.find(m => m.type === 'welcome').code;
  for (let i = 0; i < 3; i++) await connect({ type: 'join', code });
  await wait(() => service.rooms.get(code).players.size === 4);
  const extra = await connect({ type: 'join', code });
  await wait(() => extra.messages.some(m => m.type === 'error'));
  assert.match(extra.messages.find(m => m.type === 'error').message, /megtelt/);
  const other = await connect({ type: 'create', seed: 'separate' });
  await wait(() => other.messages.some(m => m.type === 'state'));
  const otherCode = other.messages.find(m => m.type === 'welcome').code;
  assert.notEqual(otherCode, code);
  host.send(JSON.stringify({ type: 'begin' }));
  await wait(() => host.messages.some(m => m.type === 'state' && m.status === 'playing'));
  assert.ok(other.messages.filter(m => m.type === 'state').every(m => m.code === otherCode && m.status === 'lobby'));
  for (const ws of sockets.slice(0, 4)) ws.close();
  await wait(() => !service.rooms.has(code));
  assert.ok(service.rooms.has(otherCode));
});
