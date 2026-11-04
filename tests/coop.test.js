import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, addPlayer, beginLevel, acceptInput, stepRoom, snapshot, hurtPlayer, removePlayer, idleInput } from '../server/simulation.js';

function setup() {
  const room = createRoom('TEST-SECTOR');
  addPlayer(room, 'a', 'Alpha'); addPlayer(room, 'b', 'Bravo'); beginLevel(room, 'a');
  return room;
}

function advance(room, seconds, inputs = {}) {
  for (let i = 0; i < seconds * 30; i++) {
    for (const [id, input] of Object.entries(inputs)) acceptInput(room, id, { ...idleInput(), ...input });
    stepRoom(room, 1 / 30);
  }
}

test('rooms enforce capacity, host controls, shared seed, and host migration', () => {
  const room = createRoom('test');
  addPlayer(room, 'a', 'A');
  assert.throws(() => beginLevel(room, 'a'), /két/);
  addPlayer(room, 'b', 'B'); addPlayer(room, 'c', 'C'); addPlayer(room, 'd', 'D');
  assert.throws(() => addPlayer(room, 'e', 'E'), /megtelt/);
  assert.throws(() => beginLevel(room, 'b'), /szobagazda/);
  beginLevel(room, 'a');
  assert.equal(room.world.seed, 'test:1');
  assert.throws(() => addPlayer(room, 'e', 'E'), /elindult/);
  removePlayer(room, 'a'); assert.equal(room.host, 'b');
  assert.equal(snapshot(room).players.length, 3);
});

test('input cannot teleport or exceed speed, expires, and cannot use nonfinite values', () => {
  const room = setup(); room.enemies = [];
  const p = room.players.get('a'); const start = { ...p };
  acceptInput(room, 'a', { ...idleInput(), forward: 999, x: -1000 });
  stepRoom(room, 1 / 30);
  assert.ok(Math.hypot(p.x - start.x, p.z - start.z) <= 5.5 / 30 + 0.0001);
  acceptInput(room, 'a', { ...idleInput(), yaw: NaN });
  assert.equal(p.input.forward, 1);
  advance(room, 0.5);
  assert.equal(p.input.forward, 0);
});

test('revive requires a living nearby helper holding E; team wipe is shared', () => {
  const room = setup(); room.enemies = [];
  const a = room.players.get('a'); const b = room.players.get('b');
  b.invulnerable = 0; hurtPlayer(b, 100); assert.equal(b.down, true);
  advance(room, 1); assert.equal(b.reviveProgress, 0);
  advance(room, 1, { a: { revive: true } }); assert.ok(b.reviveProgress > 0);
  advance(room, 0.5); assert.equal(b.reviveProgress, 0);
  advance(room, 3.2, { a: { revive: true } });
  assert.equal(b.down, false); assert.equal(b.hp, 50); assert.ok(b.invulnerable > 0);
  a.invulnerable = 0; b.invulnerable = 0; hurtPlayer(a, 100); hurtPlayer(b, 100);
  stepRoom(room, 1 / 30); assert.equal(room.status, 'dead');
  beginLevel(room, 'a'); assert.equal(room.players.get('b').hp, 100);
});

test('pickups are consumed once and sector exit requires the whole living team', () => {
  const room = setup(); room.enemies = [];
  const a = room.players.get('a'); const b = room.players.get('b');
  b.x = a.x; b.z = a.z;
  room.pickups = [{ id: 0, x: a.x, z: a.z, type: 'ammo' }];
  stepRoom(room, 1 / 30);
  assert.equal(a.reserve + b.reserve, 276); assert.equal(room.pickups.length, 0);
  Object.assign(a, room.world.exit); stepRoom(room, 1 / 30); assert.equal(room.status, 'playing');
  Object.assign(b, room.world.exit); b.down = true; stepRoom(room, 1 / 30); assert.equal(room.status, 'playing');
  b.down = false; stepRoom(room, 1 / 30); assert.equal(room.status, 'cleared');
  beginLevel(room, 'a'); assert.equal(room.level, 2); assert.equal(room.revision, 2);
});

test('server shots damage shared enemies but walls block them; reload uses server ammo', () => {
  const room = setup();
  room.world = { size: 5, grid: [[1,1,1,1,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,1]], exit: { x: 14, z: 14 } };
  const a = room.players.get('a'); Object.assign(a, { x: 10, z: 14 });
  Object.assign(room.players.get('b'), { x: 14, z: 14 });
  room.pickups = [];
  room.enemies = [{ id: 0, x: 10, z: 6, hp: 3, cooldown: 999, pathTime: 999, path: [] }];
  room.world.grid[2][2] = 1;
  advance(room, 0.2, { a: { fire: true } }); assert.equal(room.enemies[0].hp, 3);
  room.world.grid[2][2] = 0;
  advance(room, 0.5, { a: { fire: true } }); assert.equal(room.enemies.length, 0); assert.equal(room.kills, 1);
  a.ammo = 0;
  advance(room, 1.8, { a: { fire: true } }); assert.equal(a.reserve, 90); assert.ok(a.ammo < 30 && a.ammo > 20);
  assert.ok(snapshot(room).events.some(e => e.hit === 0));
});
