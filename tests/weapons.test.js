import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, addPlayer, beginLevel, acceptInput, stepRoom, snapshot, idleInput } from '../server/simulation.js';
import { WEAPONS, WEAPON_ORDER, getWeapon, isWeapon } from '../src/data/weapons.js';
import { CHARACTERS, getCharacter, isCharacter } from '../src/data/characters.js';

function arena(characters = {}) {
  const room = createRoom('WEAPONS');
  addPlayer(room, 'a', 'Alpha', characters.a); addPlayer(room, 'b', 'Bravo', characters.b); beginLevel(room, 'a');
  room.world = { size: 5, grid: [[1, 1, 1, 1, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 1, 1, 1, 1]], exit: { x: 14, z: 14 } };
  Object.assign(room.players.get('a'), { x: 10, z: 14, yaw: 0, pitch: 0 });
  Object.assign(room.players.get('b'), { x: 14, z: 14 });
  room.pickups = [];
  room.enemies = [{ id: 0, x: 10, z: 8, hp: 3, cooldown: 999, pathTime: 999, path: [] }];
  return room;
}

function advance(room, seconds, input) {
  for (let i = 0; i < seconds * 30; i++) {
    acceptInput(room, 'a', { ...idleInput(), ...input });
    stepRoom(room, 1 / 30);
  }
}

test('registries are complete and reject inherited property names', () => {
  for (const id of WEAPON_ORDER) {
    const weapon = WEAPONS[id];
    assert.equal(weapon.id, id);
    assert.ok(weapon.magazine > 0 && weapon.reserve <= weapon.maxReserve && weapon.cooldown > 0 && weapon.pellets >= 1);
  }
  assert.equal(isWeapon('constructor'), false);
  assert.equal(getWeapon('constructor').id, 'rifle');
  assert.equal(isCharacter('toString'), false);
  assert.equal(getCharacter('nope').id, 'vanguard');
  assert.ok(Object.values(CHARACTERS).every(c => c.maxHealth > 0 && c.speed > 0));
});

test('character choice sets server health and speed; unknown choices fall back', () => {
  const room = arena({ a: 'scout', b: '__proto__' });
  const a = room.players.get('a');
  assert.equal(a.hp, CHARACTERS.scout.maxHealth);
  assert.equal(room.players.get('b').character, 'vanguard');
  room.enemies = [];
  const start = a.z;
  advance(room, 1, { forward: 1, yaw: 0 });
  assert.ok(Math.abs(Math.abs(a.z - start) - 5.5 * CHARACTERS.scout.speed) < 0.4);
  assert.equal(snapshot(room).players.find(p => p.id === 'a').stash, undefined);
});

test('weapon switch keeps per-weapon ammo and ignores invalid ids', () => {
  const room = arena();
  const a = room.players.get('a');
  advance(room, 0.1, { weapon: 'shotgun' });
  assert.equal(a.weapon, 'shotgun'); assert.equal(a.ammo, WEAPONS.shotgun.magazine);
  advance(room, 0.1, { weapon: 'constructor' });
  assert.equal(a.weapon, 'shotgun');
  advance(room, 0.5, { weapon: 'shotgun' });
  advance(room, 0.1, { weapon: 'shotgun', fire: true });
  assert.equal(a.ammo, WEAPONS.shotgun.magazine - 1);
  advance(room, 0.6, { weapon: 'rifle' });
  assert.equal(a.weapon, 'rifle'); assert.equal(a.ammo, WEAPONS.rifle.magazine);
  advance(room, 0.6, { weapon: 'shotgun' });
  assert.equal(a.ammo, WEAPONS.shotgun.magazine - 1);
});

test('shotgun fires pellets, semi-automatic weapons need a new trigger pull', () => {
  const room = arena();
  const a = room.players.get('a');
  advance(room, 0.5, { weapon: 'shotgun' });
  advance(room, 0.1, { fire: true });
  const shots = snapshot(room).events.filter(e => e.type === 'shot');
  assert.equal(shots.length, WEAPONS.shotgun.pellets);
  assert.ok(shots.every(e => e.weapon === 'shotgun'));
  advance(room, 3, { fire: true });
  assert.equal(a.ammo, WEAPONS.shotgun.magazine - 1);
  advance(room, 0.1, { fire: false });
  advance(room, 0.1, { fire: true });
  assert.equal(a.ammo, WEAPONS.shotgun.magazine - 2);
});

test('jump leaves the ground, lands, scales per character and raises the shot origin', () => {
  const room = arena({ a: 'scout', b: 'bulwark' });
  room.enemies = [];
  const a = room.players.get('a'); const b = room.players.get('b');
  advance(room, 0.1, { jump: true });
  assert.ok(a.y > 0);
  let apexA = 0;
  for (let i = 0; i < 45; i++) { acceptInput(room, 'a', idleInput()); stepRoom(room, 1 / 30); apexA = Math.max(apexA, a.y); }
  assert.equal(a.y, 0);
  let apexB = 0;
  for (let i = 0; i < 30; i++) { acceptInput(room, 'b', { ...idleInput(), jump: i === 0 }); stepRoom(room, 1 / 30); apexB = Math.max(apexB, b.y); }
  assert.ok(apexA > apexB && apexB > 0.4);
  advance(room, 0.1, { jump: true, weapon: 'sniper' });
  assert.ok(a.y > 0);
  assert.ok(snapshot(room).players.find(p => p.id === 'a').y > 0);
});

test('sniper kills in one hit and automatic rifle needs several', () => {
  const room = arena();
  advance(room, 0.5, { weapon: 'sniper' });
  advance(room, 0.1, { fire: true });
  assert.equal(room.enemies.length, 0);
  const second = arena();
  advance(second, 0.1, { fire: true });
  assert.equal(second.enemies[0].hp, 2);
});

test('third-person clients can aim the shot with aimYaw/aimPitch; invalid values are ignored', () => {
  const room = arena();
  const a = room.players.get('a');
  advance(room, 0.5, { weapon: 'sniper' });
  advance(room, 0.1, { fire: true, aimYaw: 1.5 });
  assert.equal(room.enemies.length, 1);
  advance(room, 1.5, { fire: false });
  advance(room, 0.1, { fire: true, aimYaw: NaN, aimPitch: 'x' });
  assert.equal(a.input.aimYaw, null);
  assert.equal(room.enemies.length, 0);
});
