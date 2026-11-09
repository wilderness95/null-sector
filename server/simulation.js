import { randomBytes } from 'node:crypto';
import { Ray, Vector3, Box3, Euler } from 'three';
import { generateWorld, isWalkable, findPath, CELL } from '../src/world.js';
import { WEAPONS, WEAPON_ORDER, DEFAULT_WEAPON, isWeapon, getWeapon } from '../src/data/weapons.js';
import { getCharacter } from '../src/data/characters.js';

const SWITCH_TIME = 0.4;
const GRAVITY = 22;
const JUMP_SPEED = 7.5;
const EYE = 1.65;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const idleInput = () => ({ forward: 0, strafe: 0, yaw: 0, pitch: 0, fire: false, reload: false, revive: false, sprint: false, aim: false, jump: false, weapon: null, aimYaw: null, aimPitch: null });
const freshArsenal = () => Object.fromEntries(WEAPON_ORDER.map(id => [id, { ammo: WEAPONS[id].magazine, reserve: WEAPONS[id].reserve }]));

// Active weapon ammo lives on the player (ammo/reserve); other weapons are parked in `stash`.
function equip(p, id) {
  p.stash[p.weapon] = { ammo: p.ammo, reserve: p.reserve };
  p.weapon = id;
  ({ ammo: p.ammo, reserve: p.reserve } = p.stash[id]);
  p.reloadTime = 0;
  p.cooldown = SWITCH_TIME;
}

function resetLoadout(p) {
  p.stash = freshArsenal();
  p.weapon = DEFAULT_WEAPON;
  ({ ammo: p.ammo, reserve: p.reserve } = p.stash[DEFAULT_WEAPON]);
  p.hp = p.maxHealth;
}

export function createRoom(seed = '') {
  return { code: randomBytes(3).toString('hex').toUpperCase(), seed: seed.slice(0, 32) || randomBytes(4).toString('hex'), level: 1, revision: 0, status: 'lobby', host: null, players: new Map(), enemies: [], pickups: [], bullets: [], events: [], time: 0, kills: 0, serial: 0 };
}

export function addPlayer(room, id, name, character) {
  if (room.status !== 'lobby') throw new Error('A bevetés már elindult. Várj a következő szobára.');
  if (room.players.size >= 4) throw new Error('A szoba megtelt (4/4).');
  const profile = getCharacter(character);
  const player = { id, name: String(name || 'Játékos').trim().slice(0, 18) || 'Játékos', character: profile.id, maxHealth: profile.maxHealth, speed: profile.speed, jump: profile.jump, x: 0, z: 0, y: 0, vy: 0, yaw: 0, pitch: 0, hp: profile.maxHealth, weapon: DEFAULT_WEAPON, ammo: 0, reserve: 0, stash: {}, down: false, reviveProgress: 0, invulnerable: 0, cooldown: 0, reloadTime: 0, triggerHeld: false, input: idleInput(), inputAt: room.time, moving: false };
  resetLoadout(player);
  room.players.set(id, player);
  room.host ??= id;
  return player;
}

export function removePlayer(room, id) {
  room.players.delete(id);
  if (room.host === id) room.host = room.players.keys().next().value ?? null;
  if (room.status === 'playing' && [...room.players.values()].every(p => p.down)) room.status = 'dead';
}

export function beginLevel(room, id) {
  if (id !== room.host) throw new Error('Csak a szobagazda indíthat.');
  if (!['lobby', 'cleared', 'dead'].includes(room.status)) throw new Error('A bevetés már fut.');
  if (room.status === 'lobby' && room.players.size < 2) throw new Error('Legalább két játékos szükséges.');
  if (room.status === 'cleared') room.level++;
  if (room.status === 'dead') { room.level = 1; room.kills = 0; }
  room.world = generateWorld(`${room.seed}:${room.level}`, room.level);
  room.revision++;
  room.status = 'playing';
  room.enemies = room.world.enemies.map((p, id) => ({ ...p, id, hp: 3, yaw: 0, moving: false, cooldown: 2 + id * 0.15, pathTime: 0, path: [] }));
  room.pickups = room.world.pickups.map((p, id) => ({ ...p, id }));
  room.bullets = [];
  room.events = [];
  let slot = 0;
  const open = [[0, -1], [1, 0], [0, 1], [-1, 0]].find(([x, z]) => isWalkable(room.world, room.world.spawn.x + x * CELL, room.world.spawn.z + z * CELL));
  const yaw = open ? Math.atan2(-open[0], -open[1]) : 0;
  for (const p of room.players.values()) {
    const offset = [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]][slot++];
    Object.assign(p, { x: room.world.spawn.x + offset[0], z: room.world.spawn.z + offset[1], y: 0, vy: 0, yaw, pitch: 0, down: false, reviveProgress: 0, invulnerable: 3, cooldown: 0, reloadTime: 0, triggerHeld: false, input: { ...idleInput(), yaw }, inputAt: room.time });
    resetLoadout(p);
  }
}

export function acceptInput(room, id, input) {
  const p = room.players.get(id);
  if (!p || room.status !== 'playing' || !input || !['forward', 'strafe', 'yaw', 'pitch'].every(key => Number.isFinite(input[key]))) return;
  p.input = {
    forward: Math.max(-1, Math.min(1, input.forward)), strafe: Math.max(-1, Math.min(1, input.strafe)),
    yaw: input.yaw % (Math.PI * 2), pitch: Math.max(-1.35, Math.min(1.35, input.pitch)),
    ...Object.fromEntries(['fire', 'reload', 'revive', 'sprint', 'aim', 'jump'].map(key => [key, input[key] === true])),
    weapon: isWeapon(input.weapon) ? input.weapon : null,
    // Third-person clients aim the shot from the eye at the crosshair target.
    aimYaw: Number.isFinite(input.aimYaw) ? input.aimYaw % (Math.PI * 2) : null,
    aimPitch: Number.isFinite(input.aimPitch) ? Math.max(-1.35, Math.min(1.35, input.aimPitch)) : null,
  };
  p.inputAt = room.time;
}

function move(world, p, dx, dz, radius = 0.32) {
  if (isWalkable(world, p.x + dx, p.z, radius)) p.x += dx;
  if (isWalkable(world, p.x, p.z + dz, radius)) p.z += dz;
}

function visible(world, a, b) {
  const steps = Math.ceil(distance(a, b) / 0.4);
  for (let i = 1; i < steps; i++) {
    if (!isWalkable(world, a.x + (b.x - a.x) * i / steps, a.z + (b.z - a.z) * i / steps, 0.05)) return false;
  }
  return true;
}

export function hurtPlayer(player, damage) {
  if (player.down || player.invulnerable > 0) return;
  player.hp = Math.max(0, player.hp - damage);
  if (!player.hp) { player.down = true; player.input = idleInput(); player.reloadTime = 0; }
}

function fire(room, p) {
  const weapon = getWeapon(p.weapon);
  p.ammo--;
  p.cooldown = weapon.cooldown;
  const origin = new Vector3(p.x, EYE + p.y, p.z);
  const aim = new Euler(p.input.aimPitch ?? p.pitch, p.input.aimYaw ?? p.yaw, 0, 'YXZ');
  const point = new Vector3();
  for (let pellet = 0; pellet < weapon.pellets; pellet++) {
    const spread = () => (Math.random() - 0.5) * 2 * weapon.spread;
    const direction = new Vector3(spread(), spread(), -1).normalize().applyEuler(aim);
    const ray = new Ray(origin, direction);
    let nearest = weapon.range;
    let target = null;
    // Server-owned hit volumes and wall geometry, never client-supplied damage or targets.
    for (let z = 0; z < room.world.size; z++) {
      for (let x = 0; x < room.world.size; x++) {
        if (!room.world.grid[z][x]) continue;
        const bounds = new Box3(new Vector3(x * CELL, 0, z * CELL), new Vector3((x + 1) * CELL, 4.12, (z + 1) * CELL));
        if (ray.intersectBox(bounds, point)) nearest = Math.min(nearest, point.distanceTo(origin));
      }
    }
    for (const enemy of room.enemies) {
      const bounds = new Box3(new Vector3(enemy.x - 0.55, 0.15, enemy.z - 0.55), new Vector3(enemy.x + 0.55, 2.4, enemy.z + 0.55));
      if (ray.intersectBox(bounds, point) && point.distanceTo(origin) < nearest) {
        nearest = point.distanceTo(origin);
        target = enemy;
      }
    }
    if (target) {
      target.hp -= weapon.damage;
      if (target.hp <= 1e-6) { room.enemies = room.enemies.filter(e => e !== target); room.kills++; }
    }
    room.events.push({ type: 'shot', player: p.id, weapon: weapon.id, from: origin.toArray(), to: ray.at(nearest, point).toArray(), hit: target?.id ?? null });
  }
}

export function stepRoom(room, dt) {
  room.time += dt;
  if (room.status !== 'playing') return;
  const players = [...room.players.values()];
  for (const p of players) {
    if (room.time - p.inputAt > 0.3) p.input = { ...idleInput(), yaw: p.yaw, pitch: p.pitch };
    const input = p.input;
    p.yaw = input.yaw; p.pitch = input.pitch;
    p.moving = false;
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    if (p.down) { p.y = 0; p.vy = 0; continue; }
    if (input.jump && p.y === 0) p.vy = JUMP_SPEED * p.jump;
    if (p.vy !== 0 || p.y > 0) {
      p.vy -= GRAVITY * dt;
      p.y = Math.max(0, p.y + p.vy * dt);
      if (p.y === 0) p.vy = 0;
    }
    const length = Math.max(1, Math.hypot(input.forward, input.strafe));
    const speed = (input.aim ? 3.5 : input.sprint ? 9 : 5.5) * p.speed;
    const forward = input.forward / length;
    const strafe = input.strafe / length;
    move(room.world, p, (-Math.sin(p.yaw) * forward + Math.cos(p.yaw) * strafe) * speed * dt, (-Math.cos(p.yaw) * forward - Math.sin(p.yaw) * strafe) * speed * dt);
    p.moving = Math.hypot(forward, strafe) > 0.1;
    if (input.weapon && input.weapon !== p.weapon) equip(p, input.weapon);
    const weapon = getWeapon(p.weapon);
    p.cooldown = Math.max(0, p.cooldown - dt);
    if (p.reloadTime > 0) {
      p.reloadTime = Math.max(0, p.reloadTime - dt);
      if (!p.reloadTime) { const amount = Math.min(weapon.magazine - p.ammo, p.reserve); p.ammo += amount; p.reserve -= amount; }
    }
    if (!p.reloadTime && p.reserve && p.ammo < weapon.magazine && (input.reload || (input.fire && !p.ammo))) p.reloadTime = weapon.reload;
    // Semi-automatic weapons need a fresh trigger pull for every shot.
    const pulled = input.fire && (weapon.auto || !p.triggerHeld);
    p.triggerHeld = input.fire;
    if (pulled && !input.revive && !p.reloadTime && !p.cooldown && p.ammo > 0) fire(room, p);
    for (let i = room.pickups.length - 1; i >= 0; i--) {
      const item = room.pickups[i];
      if (distance(p, item) > 1.2) continue;
      if (item.type === 'health' ? p.hp >= p.maxHealth : p.reserve >= weapon.maxReserve) continue;
      if (item.type === 'health') p.hp = Math.min(p.maxHealth, p.hp + 35);
      else p.reserve = Math.min(weapon.maxReserve, p.reserve + weapon.pickup);
      room.pickups.splice(i, 1);
    }
  }
  for (const p of players.filter(p => p.down)) {
    const helper = players.find(other => !other.down && other.input.revive && distance(other, p) < 2.5 && visible(room.world, other, p));
    p.reviveProgress = helper ? p.reviveProgress + dt : 0;
    if (p.reviveProgress >= 3) { p.down = false; p.hp = 50; p.reviveProgress = 0; p.invulnerable = 3; }
  }
  const active = players.filter(p => !p.down);
  if (!active.length) { room.status = 'dead'; room.bullets = []; return; }
  for (const enemy of room.enemies) {
    const target = active.reduce((a, b) => distance(enemy, a) < distance(enemy, b) ? a : b);
    const dist = distance(enemy, target);
    enemy.pathTime -= dt;
    enemy.cooldown -= dt;
    const canSee = dist < 30 && visible(room.world, enemy, target);
    enemy.moving = false;
    enemy.yaw = Math.atan2(target.x - enemy.x, target.z - enemy.z);
    if (enemy.pathTime <= 0) { enemy.path = findPath(room.world, enemy, target); enemy.pathTime = 0.6; }
    const next = canSee ? target : enemy.path[0];
    if ((dist > 6 || !canSee) && next) {
      const remaining = distance(enemy, next);
      if (remaining > 0.08) {
        const step = Math.min(remaining, dt * Math.min(4.5, 1.7 + room.level * 0.18));
        enemy.yaw = Math.atan2(next.x - enemy.x, next.z - enemy.z);
        move(room.world, enemy, (next.x - enemy.x) / remaining * step, (next.z - enemy.z) / remaining * step, 0.6);
        enemy.moving = true;
      } else enemy.path.shift();
    }
    if (canSee && dist < 27 && enemy.cooldown <= 0) {
      enemy.cooldown = Math.max(0.85, 2.4 - room.level * 0.1);
      const direction = new Vector3(target.x - enemy.x, 0.25, target.z - enemy.z).normalize();
      room.bullets.push({ id: room.serial++, x: enemy.x + direction.x * 0.9, y: 1.4 + direction.y * 0.9, z: enemy.z + direction.z * 0.9, vx: direction.x * 14, vy: direction.y * 14, vz: direction.z * 14, life: 4 });
    }
  }
  for (let i = room.bullets.length - 1; i >= 0; i--) {
    const bullet = room.bullets[i];
    bullet.life -= dt;
    const steps = Math.ceil(dt * 14 / 0.15);
    for (let j = 0; j < steps; j++) {
      bullet.x += bullet.vx * dt / steps; bullet.y += bullet.vy * dt / steps; bullet.z += bullet.vz * dt / steps;
      if (!isWalkable(room.world, bullet.x, bullet.z, 0.12)) { bullet.life = 0; break; }
      const victim = active.find(p => Math.hypot(p.x - bullet.x, EYE + p.y - bullet.y, p.z - bullet.z) < 0.52);
      if (victim) { hurtPlayer(victim, 9 + Math.min(room.level, 10)); bullet.life = 0; break; }
    }
    if (bullet.life <= 0) room.bullets.splice(i, 1);
  }
  if (players.every(p => p.down)) room.status = 'dead';
  else if (!room.enemies.length && players.every(p => !p.down && distance(p, room.world.exit) < 3)) room.status = 'cleared';
}

export function snapshot(room) {
  return {
    type: 'state', code: room.code, seed: room.seed, level: room.level, revision: room.revision, status: room.status, host: room.host, kills: room.kills,
    players: [...room.players.values()].map(({ input, inputAt, cooldown, invulnerable, stash, triggerHeld, ...p }) => p),
    enemies: room.enemies.map(({ path, pathTime, cooldown, ...e }) => e), pickups: room.pickups,
    bullets: room.bullets.map(({ vx, vy, vz, life, ...b }) => b), events: room.events.splice(0),
  };
}
