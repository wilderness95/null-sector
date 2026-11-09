import * as THREE from 'three';
import { CELL, generateWorld, isWalkable, findPath } from './world.js';
import { loadCharacterAsset, loadCharacterAssets, createCharacter, setCharacterAnimation, disposeCharacter } from './characters.js';
import { CoopConnection } from './coop.js';
import { CHARACTERS, getCharacter } from './data/characters.js';
import { WEAPONS, WEAPON_ORDER, DEFAULT_WEAPON, getWeapon } from './data/weapons.js';
import { loadWeaponAssets, createWeaponModel, holdWeapon } from './weapons.js';
import { setupCharacterSelect } from './character-select.js';
import { tone, unlockAudio, setSoundEnabled, isSoundEnabled } from './audio.js';
import { createChaseCamera, updateChaseCamera, chaseAimAngles, loadThirdPerson, saveThirdPerson } from './third-person.js';
import './style.css';

const $ = id => document.getElementById(id);
const canvas = $('game');
const touch = matchMedia('(pointer: coarse)').matches;
const keys = new Set();
const ray = new THREE.Raycaster();
const clock = new THREE.Clock();
const mapContext = $('minimap').getContext('2d');
let renderer;
let scene;
let camera;
let world;
let walls;
let stage;
let weapon;
let flash;
let portal;
let enemies = [];
let fallen = [];
let characterAsset;
let characterAssets;
let weaponAssets;
let characterSelect;
let weaponId = DEFAULT_WEAPON;
let selectedWeapon = DEFAULT_WEAPON;
let stash = {};
let muzzle = new THREE.Vector3(0, 0.02, -0.4);
let maxHealth = 100;
let speedScale = 1;
let jumpScale = 1;
let jumpY = 0;
let jumpVelocity = 0;
let touchJump = false;
let chase;
let thirdPerson = false;
let playerModel = null;
let playerMoving = false;
let pickups = [];
let projectiles = [];
let effects = [];
let mode = 'menu';
let seed = '';
let level = 1;
let health = 100;
let ammo = 0;
let reserve = 0;
let yaw = 0;
let pitch = 0;
let firing = false;
let aiming = false;
let aimBlend = 0;
let shotCooldown = 0;
let reloadTime = 0;
let elapsed = 0;
let runTime = 0;
let kills = 0;
let recoil = 0;
let damageFlash = 0;
let hitTime = 0;
let noticeTime = 0;
let mapTimer = 0;
let joystick = { x: 0, y: 0 };
let coop = null;
let coopRevision = -1;
let networkTimer = 0;
let reloadRequested = false;
let reviveHeld = false;
const teammates = new Map();
const networkBullets = new Map();

const material = (color, emissive = 0x000000, intensity = 0) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.65, metalness: 0.4 });
const palette = {
  wall: material(0x263e3d), floor: material(0x172b2b), edge: material(0x435c4b),
  neon: material(0xc4f76b, 0x9edd42, 2), dark: material(0x182528),
  red: material(0xff544c, 0xff241f, 3),
  ammo: material(0xefbd66, 0xf6a329, 1.5), health: material(0x7affb5, 0x2dff81, 1.5),
};
const box = new THREE.BoxGeometry(1, 1, 1);
const orb = new THREE.IcosahedronGeometry(0.65, 0);
const bulletGeometry = new THREE.SphereGeometry(0.16, 6, 6);

function mesh(geometry, surface, parent, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const object = new THREE.Mesh(geometry, surface);
  object.position.set(x, y, z);
  object.scale.set(sx, sy, sz);
  parent.add(object);
  return object;
}

function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().slice(0, 7);
}

function notify(text, duration = 2.5) {
  $('notice').textContent = text;
  noticeTime = duration;
}

function updateHud() {
  $('level').textContent = String(level).padStart(2, '0');
  $('health').textContent = Math.ceil(health);
  $('max-health').textContent = maxHealth;
  $('health-bar').style.width = `${health / maxHealth * 100}%`;
  $('health-bar').style.background = health < maxHealth * 0.3 ? '#ff665b' : '#c4f76b';
  $('weapon-name').textContent = getWeapon(weaponId).name;
  $('weapon-kind').textContent = getWeapon(weaponId).kind;
  for (const slot of $('weapon-slots').children) slot.classList.toggle('active', slot.dataset.weapon === weaponId);
  $('ammo').textContent = String(ammo).padStart(2, '0');
  $('reserve').textContent = reserve;
  $('enemy-count').textContent = `${String(enemies.length).padStart(2, '0')} / ${String(world.enemies.length).padStart(2, '0')}`;
  $('objective').textContent = enemies.length ? 'Semlegesítsd az őrrobotokat' : 'A kijárat nyitva. Keresd a zöld jelzést!';
  $('reload-status').textContent = reloadTime > 0 ? 'ÚJRATÖLTÉS...' : ammo === 0 && reserve === 0 ? 'KERESS LŐSZERT A TÉRKÉPEN' : 'R  ÚJRATÖLTÉS';
  $('map-seed').textContent = `${seed} / ${String(level).padStart(2, '0')}`;
}

function clearLevel() {
  if (!stage) return;
  for (const enemy of [...enemies, ...fallen]) disposeCharacter(enemy);
  for (const friend of teammates.values()) disposeCharacter(friend);
  teammates.clear();
  networkBullets.clear();
  fallen = [];
  // Shared geometries and materials are reused; only per-level GPU buffers are released.
  stage.traverse(object => {
    if (object.isInstancedMesh) object.dispose();
    if (object.userData.transientGeometry) object.geometry.dispose();
    if (object.userData.ownMaterial) object.material.dispose();
  });
  scene.remove(stage);
  projectiles = [];
  effects = [];
}

function buildLevel(code) {
  clearLevel();
  world = generateWorld(code, level);
  stage = new THREE.Group();
  scene.add(stage);
  const width = world.size * CELL;
  mesh(box, palette.floor, stage, width / 2, -0.25, width / 2, width, 0.5, width);
  const grid = new THREE.GridHelper(width, world.size * 2, 0x52694a, 0x304b42);
  grid.position.set(width / 2, 0.012, width / 2);
  grid.material.transparent = true;
  grid.material.opacity = 0.22;
  grid.userData.transientGeometry = true;
  // GridHelper owns its material; dispose it when this level is replaced.
  grid.userData.ownMaterial = true;
  stage.add(grid);
  const cells = [];
  for (let z = 0; z < world.size; z++) {
    for (let x = 0; x < world.size; x++) {
      if (world.grid[z][x]) cells.push({ x, z });
    }
  }
  walls = new THREE.InstancedMesh(box, palette.wall, cells.length);
  const rims = new THREE.InstancedMesh(box, palette.edge, cells.length);
  const strips = new THREE.InstancedMesh(box, palette.neon, cells.length);
  const dummy = new THREE.Object3D();
  cells.forEach(({ x, z }, i) => {
    dummy.position.set((x + 0.5) * CELL, 2, (z + 0.5) * CELL);
    dummy.scale.set(CELL, 4, CELL);
    dummy.updateMatrix();
    walls.setMatrixAt(i, dummy.matrix);
    walls.setColorAt(i, new THREE.Color().setHSL(0.46, 0.17, 0.14 + ((x * 7 + z * 3) % 5) * 0.013));
    dummy.position.y = 4.04;
    dummy.scale.set(CELL + 0.04, 0.12, CELL + 0.04);
    dummy.updateMatrix();
    rims.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 3.45;
    dummy.scale.set(CELL + 0.015, 0.035, CELL + 0.015);
    dummy.updateMatrix();
    strips.setMatrixAt(i, dummy.matrix);
  });
  stage.add(walls, rims, strips);

  enemies = world.enemies.map((position, index) => {
    const character = createCharacter(characterAsset, index);
    const { group } = character;
    group.position.set(position.x, 0, position.z);
    stage.add(group);
    const enemy = { ...character, id: index, hp: 3, cooldown: 1 + index * 0.2, path: [], pathTime: index * 0.08 };
    group.traverse(object => { object.userData.enemy = enemy; });
    return enemy;
  });
  pickups = world.pickups.map((position, id) => {
    const group = new THREE.Group();
    group.position.set(position.x, 0.65, position.z);
    stage.add(group);
    const surface = palette[position.type];
    mesh(box, palette.dark, group, 0, 0, 0, 0.8, 0.6, 0.8);
    mesh(box, surface, group, 0, 0.32, 0, 0.7, 0.05, 0.22);
    if (position.type === 'health') mesh(box, surface, group, 0, 0.32, 0, 0.22, 0.05, 0.7);
    else mesh(box, surface, group, 0, 0, -0.41, 0.6, 0.3, 0.03);
    return { ...position, id, group };
  });
  portal = new THREE.Group();
  portal.position.set(world.exit.x, 0, world.exit.z);
  stage.add(portal);
  mesh(box, palette.dark, portal, 0, 0.06, 0, 3, 0.12, 3);
  mesh(box, palette.red, portal, -1.3, 1.8, 0, 0.16, 3.6, 0.35);
  mesh(box, palette.red, portal, 1.3, 1.8, 0, 0.16, 3.6, 0.35);
  mesh(box, palette.red, portal, 0, 3.5, 0, 2.7, 0.16, 0.35);
  mesh(box, palette.red, portal, 0, 0.15, 0, 2.5, 0.05, 2.5);
  camera.position.set(world.spawn.x, 1.65, world.spawn.z);
  const openDirection = [[0, -1], [1, 0], [0, 1], [-1, 0]].find(([x, z]) => isWalkable(world, world.spawn.x + x * CELL, world.spawn.z + z * CELL));
  yaw = openDirection ? Math.atan2(-openDirection[0], -openDirection[1]) : 0;
  pitch = 0;
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  shotCooldown = 0;
  reloadTime = 0;
  jumpY = 0;
  jumpVelocity = 0;
  damageFlash = 0;
  recoil = 0;
  updateHud();
}

function buildWeapon() {
  weapon = new THREE.Group();
  camera.add(weapon);
  weapon.visible = false;
}

function equipWeapon(id) {
  const definition = getWeapon(id);
  weaponId = definition.id;
  weapon.clear();
  const model = createWeaponModel(weaponAssets.get(definition.model), definition);
  weapon.add(model.group);
  muzzle = model.muzzle;
  flash = mesh(orb, palette.neon, weapon, muzzle.x, muzzle.y, muzzle.z, 0.15, 0.15, 0.3);
  flash.visible = false;
  if (world) updateHud();
}

function resetLoadout() {
  stash = Object.fromEntries(WEAPON_ORDER.map(id => [id, { ammo: WEAPONS[id].magazine, reserve: WEAPONS[id].reserve }]));
  ({ ammo, reserve } = stash[DEFAULT_WEAPON]);
  selectedWeapon = DEFAULT_WEAPON;
  reloadTime = 0;
  equipWeapon(DEFAULT_WEAPON);
}

function switchWeapon(id) {
  if (mode !== 'playing' || !WEAPONS[id]) return;
  if (coop) { selectedWeapon = id; sendCoopInput(); return; }
  if (id === weaponId) return;
  stash[weaponId] = { ammo, reserve };
  ({ ammo, reserve } = stash[id]);
  selectedWeapon = id;
  reloadTime = 0;
  shotCooldown = 0.4;
  recoil = 0;
  equipWeapon(id);
  tone(380, 0.06, 'triangle', 0.03, 520);
}

function cycleWeapon(step) {
  const index = WEAPON_ORDER.indexOf(selectedWeapon);
  switchWeapon(WEAPON_ORDER[(index + step + WEAPON_ORDER.length) % WEAPON_ORDER.length]);
}

function requestControl() {
  if (touch) return;
  try {
    const request = canvas.requestPointerLock();
    request?.catch(() => {
      if (mode === 'playing') pause('Kattints a Folytatás gombra az egérvezérlés engedélyezéséhez.');
    });
  } catch { pause('Az egérvezérlés nem érhető el. Nyisd meg a játékot külön böngészőlapon.'); }
}

function clearInput() {
  keys.clear();
  firing = false;
  reviveHeld = false;
  touchJump = false;
  reloadRequested = false;
  coop?.send({ type: 'input', forward: 0, strafe: 0, yaw, pitch });
  setAiming(false);
  aimBlend = 0;
  $('scope').classList.remove('active');
  if (camera) {
    camera.fov = 76;
    camera.updateProjectionMatrix();
  }
  joystick = { x: 0, y: 0 };
  $('stick').style.transform = '';
}

function setAiming(active) {
  aiming = active;
  $('hud').classList.toggle('aiming', active);
  $('touch-aim').setAttribute('aria-pressed', String(active));
}

function startRun() {
  leaveCoop();
  unlockAudio();
  seed = $('seed').value.trim() || randomSeed();
  level = 1;
  const character = characterSelect.selected;
  maxHealth = character.maxHealth;
  speedScale = character.speed;
  jumpScale = character.jump;
  health = maxHealth;
  resetLoadout();
  runTime = 0;
  kills = 0;
  clearInput();
  buildLevel(`${seed}:${level}`);
  mode = 'playing';
  weapon.visible = true;
  $('menu').classList.add('hidden');
  $('modal').classList.add('hidden');
  $('hud').classList.remove('hidden');
  notify('SZEKTOR AKTÍV. SEMLEGESÍTSD AZ ŐRROBOTOKAT.', 4);
  requestControl();
}

function showModal(tag, title, text, action) {
  clearInput();
  $('modal-tag').textContent = tag;
  $('modal-title').textContent = title;
  $('modal-text').textContent = text;
  $('resume').textContent = action;
  $('modal').classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}

function pause(text = 'A szektor megvár. Folytasd, amikor készen állsz.') {
  if (mode !== 'playing') return;
  mode = 'paused';
  showModal('KAPCSOLAT FELFÜGGESZTVE', 'SZÜNET', coop ? 'A közös bevetés nem áll meg! A robotok továbbra is támadhatnak. Folytasd, vagy lépj ki a szobából.' : text, 'FOLYTATÁS →');
}

function finishLevel() {
  mode = 'cleared';
  tone(440, 0.5, 'sine', 0.05, 880);
  showModal('SZEKTOR BIZTOSÍTVA', 'TERÜLET TISZTA.', `${level}. szektor teljesítve. ${kills} kiiktatott őrrobot, ${Math.floor(runTime)} másodperc. A következő szektorban több és gyorsabb ellenfél vár.`, 'KÖVETKEZŐ SZEKTOR →');
}

function takeDamage(amount) {
  health = Math.max(0, health - amount);
  damageFlash = 0.75;
  tone(85, 0.2, 'sawtooth', 0.05, 30);
  updateHud();
  if (health === 0) {
    mode = 'dead';
    showModal('ÉLETJEL MEGSZAKADT', 'KAPCSOLAT VÉGE.', `${level}. szektor · ${kills} kiiktatott őrrobot · ${Math.floor(runTime)} másodperc. Pályakód: ${seed}. Próbáld újra ugyanazt a bevetést!`, 'ÚJRAPRÓBÁLOM →');
  }
}

function reload() {
  if (coop) { reloadRequested = true; return; }
  if (mode !== 'playing' || reloadTime > 0 || ammo === getWeapon(weaponId).magazine || reserve === 0) return;
  reloadTime = getWeapon(weaponId).reload;
  tone(230, 0.13, 'triangle', 0.035, 500);
  updateHud();
}

function shoot() {
  if (coop) { sendCoopInput(); return; }
  if (mode !== 'playing' || shotCooldown > 0 || reloadTime > 0) return;
  if (ammo === 0) {
    if (reserve > 0) reload();
    else { shotCooldown = 0.4; tone(90, 0.04, 'square', 0.02); }
    return;
  }
  const definition = getWeapon(weaponId);
  ammo--;
  shotCooldown = definition.cooldown;
  recoil = definition.recoil;
  tone(...definition.sound);
  // Input can arrive between frames: raycast with the latest aim and target transforms.
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  refreshEnemyBounds();
  const aim = aimAngles();
  const aimEuler = new THREE.Euler(aim.pitch, aim.yaw, 0, 'YXZ');
  const start = chaseView() ? new THREE.Vector3(0.25, -0.25, -0.8).applyEuler(aimEuler).add(camera.position) : weapon.localToWorld(muzzle.clone());
  ray.far = definition.range;
  let landed = false;
  for (let pellet = 0; pellet < definition.pellets; pellet++) {
    const spread = () => (Math.random() - 0.5) * 2 * definition.spread;
    const direction = new THREE.Vector3(spread(), spread(), -1).normalize().applyEuler(aimEuler);
    ray.set(camera.position, direction);
    const hit = ray.intersectObjects([walls, ...enemies.map(enemy => enemy.group)], true)[0];
    const end = hit ? hit.point : ray.ray.at(definition.range, new THREE.Vector3());
    const trace = mesh(box, palette.neon, stage);
    trace.position.copy(start).lerp(end, 0.5);
    trace.scale.set(0.018, 0.018, start.distanceTo(end));
    trace.lookAt(end);
    effects.push({ mesh: trace, time: 0.045 });
    if (hit?.object.userData.enemy) {
      landed = true;
      damageEnemy(hit.object.userData.enemy, definition.damage);
    }
  }
  ray.far = Infinity;
  if (landed) {
    hitTime = 0.15;
    tone(650, 0.06, 'triangle', 0.025, 300);
  }
  updateHud();
}

function damageEnemy(enemy, damage) {
  enemy.hp -= damage;
  if (enemy.hp > 1e-6) return;
  setCharacterAnimation(enemy, 'Death');
  enemy.deathTime = 3;
  fallen.push(enemy);
  enemies = enemies.filter(item => item !== enemy);
  kills++;
  for (let i = 0; i < 7; i++) {
    const spark = mesh(orb, palette.red, stage, enemy.group.position.x, 1.3, enemy.group.position.z, 0.12, 0.12, 0.12);
    effects.push({ mesh: spark, time: 0.4, velocity: new THREE.Vector3((Math.random() - 0.5) * 7, Math.random() * 5, (Math.random() - 0.5) * 7) });
  }
  if (!enemies.length) {
    portal.children.slice(1).forEach(part => { part.material = palette.neon; });
    notify('SZEKTOR TISZTA. A ZÖLD KIJÁRAT NYITVA.', 5);
    tone(330, 0.4, 'sine', 0.05, 660);
  }
  updateHud();
}

function updateScope(definition) {
  const scoped = Boolean(definition.scope) && aimBlend > 0.9;
  $('scope').classList.toggle('active', scoped);
  weapon.visible = !scoped && mode !== 'menu';
}

function move(position, dx, dz, radius = 0.32) {
  if (isWalkable(world, position.x + dx, position.z, radius)) position.x += dx;
  if (isWalkable(world, position.x, position.z + dz, radius)) position.z += dz;
}

function visible(from, to) {
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  const steps = Math.ceil(length / 0.6);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (!isWalkable(world, from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t, 0.05)) return false;
  }
  return true;
}

function updateEnemies(dt) {
  for (const enemy of enemies) {
    const position = enemy.group.position;
    const distance = Math.hypot(position.x - camera.position.x, position.z - camera.position.z);
    enemy.group.rotation.y = Math.atan2(camera.position.x - position.x, camera.position.z - position.z);
    let moving = false;
    enemy.cooldown -= dt;
    enemy.pathTime -= dt;
    if (enemy.pathTime <= 0) {
      enemy.path = findPath(world, position, camera.position);
      enemy.canSee = distance < 30 && visible(position, camera.position);
      enemy.pathTime = 0.6;
    }
    if (distance > 6 || !enemy.canSee) {
      const target = enemy.canSee ? camera.position : enemy.path[0];
      if (target) {
        const dx = target.x - position.x;
        const dz = target.z - position.z;
        const remaining = Math.hypot(dx, dz);
        if (remaining > 0.08) {
          const step = Math.min(remaining, dt * Math.min(4.5, 1.7 + level * 0.18));
          move(position, dx / remaining * step, dz / remaining * step, 0.6);
          enemy.group.rotation.y = Math.atan2(dx, dz);
          moving = true;
        } else enemy.path.shift();
      }
    }
    setCharacterAnimation(enemy, moving ? (level >= 5 ? 'Running' : 'Walking') : 'Idle');
    enemy.mixer.update(dt);
    if (enemy.canSee && enemy.cooldown <= 0 && distance < 27 && visible(position, camera.position)) {
      enemy.cooldown = Math.max(0.85, 2.4 - level * 0.1) + Math.random() * 0.4;
      const origin = position.clone().add(new THREE.Vector3(0, 1.4, 0));
      const direction = camera.position.clone().sub(origin).normalize();
      const bullet = mesh(bulletGeometry, palette.red, stage);
      bullet.position.copy(origin).addScaledVector(direction, 0.9);
      projectiles.push({ mesh: bullet, velocity: direction.multiplyScalar(13 + Math.min(level, 10)), time: 4 });
      if (distance < 18) tone(220, 0.1, 'triangle', 0.015, 90);
    }
  }
}

function updateGame(dt) {
  runTime += dt;
  shotCooldown = Math.max(0, shotCooldown - dt);
  if (reloadTime > 0) {
    reloadTime = Math.max(0, reloadTime - dt);
    if (reloadTime === 0) {
      const amount = Math.min(getWeapon(weaponId).magazine - ammo, reserve);
      ammo += amount;
      reserve -= amount;
      tone(500, 0.08, 'triangle');
      updateHud();
    }
  }
  let forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')) - joystick.y;
  let strafe = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + joystick.x;
  const magnitude = Math.hypot(forward, strafe);
  playerMoving = magnitude > 0.1;
  if (magnitude > 1) { forward /= magnitude; strafe /= magnitude; }
  const speed = (aiming ? 3.5 : keys.has('ShiftLeft') || keys.has('ShiftRight') ? 9 : 5.5) * speedScale;
  move(camera.position, (-Math.sin(yaw) * forward + Math.cos(yaw) * strafe) * speed * dt, (-Math.cos(yaw) * forward - Math.sin(yaw) * strafe) * speed * dt);
  const jumping = keys.has('Space') || touchJump;
  if (jumpY === 0 && jumping) jumpVelocity = 7.5 * jumpScale;
  if (jumpVelocity !== 0 || jumpY > 0) {
    jumpVelocity -= 22 * dt;
    jumpY = Math.max(0, jumpY + jumpVelocity * dt);
    if (jumpY === 0) jumpVelocity = 0;
  }
  camera.position.y = 1.65 + jumpY + (magnitude > 0.1 && jumpY === 0 ? Math.sin(elapsed * speed * 1.8) * 0.035 : 0);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  aimBlend = THREE.MathUtils.damp(aimBlend, aiming && reloadTime === 0 ? 1 : 0, 18, dt);
  const definition = getWeapon(weaponId);
  const [baseX, baseY, baseZ] = definition.view.position;
  const fov = THREE.MathUtils.lerp(76, definition.zoom, aimBlend);
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  recoil = Math.max(0, recoil - dt * 8);
  weapon.position.set(
    (baseX + Math.sin(elapsed * 8) * Math.min(magnitude, 1) * 0.008) * (1 - aimBlend),
    THREE.MathUtils.lerp(baseY, baseY + 0.065, aimBlend) - (reloadTime > 0 ? Math.sin(reloadTime / definition.reload * Math.PI) * 0.25 : 0),
    baseZ + recoil * THREE.MathUtils.lerp(0.09, 0.035, aimBlend),
  );
  weapon.rotation.x = recoil * THREE.MathUtils.lerp(0.08, 0.015, aimBlend) - (reloadTime > 0 ? 0.3 : 0);
  if (firing && definition.auto) shoot();
  flash.visible = recoil > definition.recoil * 0.65;
  updateScope(definition);
  updateEnemies(dt);
  for (let i = fallen.length - 1; i >= 0; i--) {
    const enemy = fallen[i];
    enemy.mixer.update(dt);
    enemy.deathTime -= dt;
    if (enemy.deathTime < 1) enemy.group.position.y -= dt * 1.5;
    if (enemy.deathTime <= 0) {
      disposeCharacter(enemy);
      fallen.splice(i, 1);
    }
  }
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const bullet = projectiles[i];
    bullet.time -= dt;
    // Substeps prevent fast projectiles from tunneling through walls or the player.
    const steps = Math.max(1, Math.ceil(bullet.velocity.length() * dt / 0.2));
    for (let step = 0; step < steps; step++) {
      bullet.mesh.position.addScaledVector(bullet.velocity, dt / steps);
      const p = bullet.mesh.position;
      if (!isWalkable(world, p.x, p.z, 0.12)) { bullet.time = 0; break; }
      if (p.distanceTo(camera.position) < 0.52) {
        bullet.time = 0;
        takeDamage(9 + Math.min(level, 10));
        break;
      }
    }
    if (bullet.time <= 0) { stage.remove(bullet.mesh); projectiles.splice(i, 1); }
    if (mode !== 'playing') return;
  }
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pickup = pickups[i];
    pickup.group.rotation.y += dt;
    pickup.group.position.y = 0.65 + Math.sin(elapsed * 2 + i) * 0.12;
    if (Math.hypot(camera.position.x - pickup.x, camera.position.z - pickup.z) < 1.2) {
      if (pickup.type === 'health' && health >= maxHealth) continue;
      if (pickup.type === 'ammo' && reserve >= getWeapon(weaponId).maxReserve) continue;
      if (pickup.type === 'health') { health = Math.min(maxHealth, health + 35); notify('+35 VITALITÁS'); }
      else { reserve = Math.min(getWeapon(weaponId).maxReserve, reserve + getWeapon(weaponId).pickup); notify(`+${getWeapon(weaponId).pickup} LŐSZER`); }
      stage.remove(pickup.group);
      pickups.splice(i, 1);
      tone(520, 0.15, 'sine', 0.035, 800);
      updateHud();
    }
  }
  if (Math.hypot(camera.position.x - world.exit.x, camera.position.z - world.exit.z) < 1.5) {
    if (!enemies.length) finishLevel();
    else if (noticeTime <= 0) notify(`KIJÁRAT ZÁRVA. MÉG ${enemies.length} ŐRROBOT AKTÍV.`);
  }
}

function leaveCoop() {
  coop?.close();
  coop = null;
  coopRevision = -1;
  for (const friend of teammates.values()) disposeCharacter(friend);
  teammates.clear();
  for (const bullet of networkBullets.values()) stage?.remove(bullet);
  networkBullets.clear();
  $('team-hud').classList.add('hidden');
  $('lobby').classList.add('hidden');
  $('touch-revive').classList.add('hidden');
  $('revive-hint').textContent = '';
  $('resume').disabled = false;
  $('restart').textContent = 'ÚJ BEVETÉS';
}

function connectCoop(type) {
  leaveCoop();
  unlockAudio();
  $('coop-error').textContent = 'Kapcsolódás...';
  const connection = new CoopConnection(
    state => { if (coop === connection) receiveCoop(state); },
    message => {
      $('coop-error').textContent = message;
      $('lobby-status').textContent = message;
      if (!connection.id && coop === connection) leaveCoop();
    },
    () => {
      if (coop !== connection) return;
      leaveCoop();
      mode = 'disconnected';
      showModal('KAPCSOLAT MEGSZAKADT', 'NINCS KAPCSOLAT', 'A kooperatív szerver nem elérhető. Lépj vissza a menübe, és hozzatok létre új szobát.', 'VISSZA A MENÜBE');
    },
  );
  coop = connection;
  connection.connect({ type, name: $('player-name').value, code: $('room-code').value, seed: $('seed').value.trim(), character: characterSelect.selected.id });
}

function receiveCoop(state) {
  const me = state.players.find(p => p.id === coop.id);
  if (!me) return;
  $('coop-error').textContent = '';
  $('restart').textContent = 'KILÉPÉS A SZOBÁBÓL';
  const host = state.host === coop.id;
  if (state.status === 'lobby') {
    mode = 'lobby';
    $('lobby').classList.remove('hidden');
    $('lobby-code').textContent = state.code;
    $('lobby-players').replaceChildren(...state.players.map(p => {
      const row = document.createElement('div');
      row.textContent = `${p.id === state.host ? '[GAZDA] ' : ''}${p.name} [${getCharacter(p.character).name}]${p.id === coop.id ? ' (TE)' : ''}`;
      return row;
    }));
    $('lobby-start').disabled = !host || state.players.length < 2;
    $('lobby-status').textContent = `${state.players.length}/4 játékos. ${host ? 'Legalább két fővel indítható.' : 'Várakozás a szobagazdára.'}`;
    return;
  }
  if (state.revision !== coopRevision) {
    coopRevision = state.revision;
    seed = state.seed; level = state.level;
    buildLevel(`${seed}:${level}`);
    yaw = me.yaw; pitch = me.pitch;
    camera.position.set(me.x, 1.65, me.z);
    $('menu').classList.add('hidden');
    $('lobby').classList.add('hidden');
    $('hud').classList.remove('hidden');
    mode = 'paused';
    showModal('CSAPAT ÖSSZEÁLLT', `SZEKTOR ${level}`, 'Közös bevetés. E nyomva tartva: közeli társ újraélesztése. A szünetmenü nem állítja meg a játékot.', 'BELÉPÉS A BEVETÉSBE →');
  }
  if (me.hp < health) damageFlash = 0.75;
  maxHealth = me.maxHealth; speedScale = me.speed; jumpScale = me.jump;
  health = me.hp; ammo = me.ammo; reserve = me.reserve; reloadTime = me.reloadTime; kills = state.kills;
  if (me.weapon !== weaponId) equipWeapon(me.weapon);
  const enemyIds = new Set(state.enemies.map(e => e.id));
  for (const enemy of enemies.filter(e => !enemyIds.has(e.id))) {
    setCharacterAnimation(enemy, 'Death'); enemy.deathTime = 3; fallen.push(enemy);
  }
  enemies = enemies.filter(e => enemyIds.has(e.id));
  for (const enemy of enemies) enemy.network = state.enemies.find(e => e.id === enemy.id);
  for (const item of pickups.filter(p => !state.pickups.some(other => other.id === p.id))) stage.remove(item.group);
  pickups = pickups.filter(p => state.pickups.some(other => other.id === p.id));
  portal.children.slice(1).forEach(part => { part.material = enemies.length ? palette.red : palette.neon; });
  const playerIds = new Set(state.players.map(p => p.id));
  for (const [id, friend] of teammates) {
    if (!playerIds.has(id)) { disposeCharacter(friend); teammates.delete(id); }
  }
  for (const p of state.players.filter(p => p.id !== coop.id)) {
    if (!teammates.has(p.id)) {
      const character = createCharacter(characterAssets.get(getCharacter(p.character).model), getCharacter(p.character));
      character.group.position.set(p.x, 0, p.z);
      // Cyan beacon distinguishes teammates from hostile robots at a distance.
      mesh(orb, palette.health, character.group, 0, 2.8, 0, 0.16, 0.16, 0.16);
      stage.add(character.group);
      teammates.set(p.id, character);
    }
    teammates.get(p.id).network = p;
  }
  const bulletIds = new Set(state.bullets.map(b => b.id));
  for (const [id, bullet] of networkBullets) if (!bulletIds.has(id)) { stage.remove(bullet); networkBullets.delete(id); }
  for (const bullet of state.bullets) {
    if (!networkBullets.has(bullet.id)) networkBullets.set(bullet.id, mesh(bulletGeometry, palette.red, stage));
    networkBullets.get(bullet.id).position.set(bullet.x, bullet.y, bullet.z);
  }
  for (const event of state.events) {
    if (event.type !== 'shot') continue;
    const from = new THREE.Vector3().fromArray(event.from);
    const to = new THREE.Vector3().fromArray(event.to);
    const trace = mesh(box, palette.neon, stage);
    trace.position.copy(from).lerp(to, 0.5);
    trace.scale.set(0.025, 0.025, from.distanceTo(to)); trace.lookAt(to);
    effects.push({ mesh: trace, time: 0.07 });
    if (event.player === coop.id) {
      recoil = 1;
      tone(160, 0.12, 'sawtooth', 0.065, 35);
      if (event.hit !== null) hitTime = 0.15;
    } else if (from.distanceTo(camera.position) < 25) tone(160, 0.1, 'sawtooth', 0.02, 35);
  }
  $('team-hud').classList.remove('hidden');
  $('team-code').textContent = `SZOBA: ${state.code}`;
  $('team-list').replaceChildren(...state.players.map(p => {
    const row = document.createElement('div'); row.dataset.player = p.id;
    row.className = p.down ? 'down' : '';
    row.textContent = `${p.name}${p.id === coop.id ? ' (TE)' : ''} / ${p.down ? `FÖLDÖN ${Math.round(p.reviveProgress / 3 * 100)}%` : `${Math.ceil(p.hp)} HP`}`;
    return row;
  }));
  updateHud();
  if (!enemies.length) $('objective').textContent = 'Mindenki a kijárathoz! A földre került társakat élesszétek újra.';
  if (state.status === 'dead' || state.status === 'cleared') {
    if (mode !== state.status) {
      mode = state.status;
      showModal('KÖZÖS BEVETÉS', state.status === 'dead' ? 'A CSAPAT ELESETT' : 'SZEKTOR BIZTOSÍTVA', host ? 'A csapat együtt folytatja a bevetést.' : 'Várakozás a szobagazdára.', state.status === 'dead' ? 'ÚJRAPRÓBÁLÁS →' : 'KÖVETKEZŐ SZEKTOR →');
    }
    $('resume').disabled = !host;
  }
}

function sendCoopInput() {
  if (!coop?.state || coop.state.status !== 'playing') return;
  const active = mode === 'playing';
  const aim = active && firing && chaseView() ? aimAngles() : null;
  coop.send({ type: 'input', aimYaw: aim?.yaw ?? null, aimPitch: aim?.pitch ?? null,
    forward: active ? Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')) - joystick.y : 0,
    strafe: active ? Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + joystick.x : 0,
    yaw, pitch, fire: active && firing, reload: active && reloadRequested, revive: active && (keys.has('KeyE') || reviveHeld),
    sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'), aim: aiming, jump: active && (keys.has('Space') || touchJump), weapon: selectedWeapon,
  });
  reloadRequested = false;
}

function updateCoop(dt) {
  const me = coop.state.players.find(p => p.id === coop.id);
  if (!me || coop.state.status === 'lobby') return;
  networkTimer -= dt;
  if (networkTimer <= 0) { sendCoopInput(); networkTimer = 1 / 30; }
  const blend = 1 - Math.exp(-18 * dt);
  camera.position.x = THREE.MathUtils.lerp(camera.position.x, me.x, blend);
  camera.position.z = THREE.MathUtils.lerp(camera.position.z, me.z, blend);
  camera.position.y = THREE.MathUtils.damp(camera.position.y, me.down ? 0.65 : 1.65 + me.y, 12, dt);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  weapon.visible = !me.down;
  aimBlend = THREE.MathUtils.damp(aimBlend, aiming && !me.down && !reloadTime ? 1 : 0, 18, dt);
  const definition = getWeapon(weaponId);
  const [baseX, baseY, baseZ] = definition.view.position;
  camera.fov = THREE.MathUtils.lerp(76, definition.zoom, aimBlend); camera.updateProjectionMatrix();
  recoil = Math.max(0, recoil - dt * 8);
  weapon.position.set(baseX * (1 - aimBlend), THREE.MathUtils.lerp(baseY, baseY + 0.065, aimBlend) - (reloadTime > 0 ? 0.2 : 0), baseZ + recoil * 0.05);
  weapon.rotation.x = recoil * 0.025;
  flash.visible = recoil > definition.recoil * 0.65;
  if (!me.down) updateScope(definition);
  else $('scope').classList.remove('active');
  for (const character of [...enemies, ...teammates.values()]) {
    const p = character.network;
    if (!p) continue;
    character.group.position.x = THREE.MathUtils.lerp(character.group.position.x, p.x, blend);
    character.group.position.z = THREE.MathUtils.lerp(character.group.position.z, p.z, blend);
    character.group.position.y = THREE.MathUtils.lerp(character.group.position.y, p.y ?? 0, blend);
    const rotation = teammates.has(p.id) ? p.yaw + Math.PI : p.yaw;
    character.group.rotation.y += Math.atan2(Math.sin(rotation - character.group.rotation.y), Math.cos(rotation - character.group.rotation.y)) * blend;
    holdWeapon(character, weaponAssets, getWeapon(p.weapon));
    setCharacterAnimation(character, p.down ? 'Death' : p.y > 0.05 ? 'Jumping' : p.moving ? 'Walking' : 'Idle');
    character.mixer.update(dt);
  }
  for (let i = fallen.length - 1; i >= 0; i--) {
    const enemy = fallen[i]; enemy.mixer.update(dt); enemy.deathTime -= dt;
    if (enemy.deathTime <= 0) { disposeCharacter(enemy); fallen.splice(i, 1); }
  }
  const nearby = coop.state.players.find(p => p.down && p.id !== me.id && Math.hypot(p.x - me.x, p.z - me.z) < 2.5);
  $('revive-hint').textContent = me.down ? `FÖLDRE KERÜLTÉL. VÁRJ A TÁRSADRA! ${Math.round(me.reviveProgress / 3 * 100)}%` : nearby ? `E NYOMVA / ÚJRAÉLESZTÉS: ${nearby.name} ${Math.round(nearby.reviveProgress / 3 * 100)}%` : '';
  $('touch-revive').classList.toggle('hidden', !nearby || me.down);
  for (const p of pickups) p.group.rotation.y += dt;
}

function drawMap() {
  const ctx = mapContext;
  const scale = 180 / world.size;
  const unit = scale / CELL;
  ctx.clearRect(0, 0, 180, 180);
  for (let z = 0; z < world.size; z++) {
    for (let x = 0; x < world.size; x++) {
      ctx.fillStyle = world.grid[z][x] ? '#1a302b' : '#49634b';
      ctx.fillRect(x * scale, z * scale, scale - 0.5, scale - 0.5);
    }
  }
  for (const pickup of pickups) {
    ctx.fillStyle = pickup.type === 'health' ? '#7affb5' : '#efbd66';
    ctx.fillRect(pickup.x * unit - 1, pickup.z * unit - 1, 2, 2);
  }
  ctx.strokeStyle = enemies.length ? '#b77b64' : '#c4f76b';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(world.exit.x * unit - 3, world.exit.z * unit - 3, 6, 6);
  ctx.fillStyle = '#ff655b';
  for (const enemy of enemies) {
    ctx.beginPath();
    ctx.arc(enemy.group.position.x * unit, enemy.group.position.z * unit, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  for (const friend of teammates.values()) {
    ctx.fillStyle = friend.network.down ? '#ffcc66' : '#71d5ed';
    ctx.fillRect(friend.group.position.x * unit - 2, friend.group.position.z * unit - 2, 4, 4);
  }
  ctx.translate(camera.position.x * unit, camera.position.z * unit);
  ctx.rotate(-yaw);
  ctx.fillStyle = '#e0ffab';
  ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(-3, 3); ctx.lineTo(3, 3); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.04);
  elapsed += dt;
  if (mode === 'menu') {
    const center = world.size * CELL / 2;
    camera.position.set(center + Math.sin(elapsed * 0.025 + 0.7) * 46, 38, center + Math.cos(elapsed * 0.025 + 0.7) * 46);
    camera.lookAt(center, 0, center);
    for (const enemy of enemies) enemy.mixer.update(dt);
  } else if (mode === 'playing' || (coop?.state && coop.state.status !== 'lobby')) {
    if (coop) updateCoop(dt);
    else updateGame(dt);
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      effect.time -= dt;
      if (effect.velocity) effect.mesh.position.addScaledVector(effect.velocity, dt);
      if (effect.time <= 0) { stage.remove(effect.mesh); effects.splice(i, 1); }
    }
    noticeTime = Math.max(0, noticeTime - dt);
    if (noticeTime === 0) $('notice').textContent = '';
    damageFlash = Math.max(0, damageFlash - dt * 1.8);
    hitTime = Math.max(0, hitTime - dt);
    mapTimer -= dt;
    if (mapTimer <= 0) { drawMap(); mapTimer = 0.1; }
  }
  $('damage').style.opacity = damageFlash;
  $('hitmarker').style.opacity = hitTime > 0 ? 1 : 0;
  const chaseActive = chaseView();
  if (chaseActive) {
    updateChaseCamera(chase, chaseOptions());
    updatePlayerModel(dt);
    weapon.visible = false;
  } else if (playerModel) playerModel.character.group.visible = false;
  renderer.render(scene, chaseActive ? chase : camera);
}

function chaseOptions() {
  return { eye: camera.position, yaw, pitch, aim: aimBlend, fov: camera.fov, walls };
}

// The scoped sniper view always switches back to the first-person camera.
function chaseView() {
  const scoped = getWeapon(weaponId).scope && aimBlend > 0.9;
  return thirdPerson && !scoped && ['playing', 'paused', 'dead', 'cleared'].includes(mode);
}

function refreshEnemyBounds() {
  scene.updateMatrixWorld(true);
  for (const enemy of enemies) {
    for (const skin of enemy.skins) {
      skin.computeBoundingSphere();
      skin.computeBoundingBox();
    }
  }
}

function aimAngles() {
  if (!chaseView()) return { yaw, pitch };
  updateChaseCamera(chase, chaseOptions());
  refreshEnemyBounds();
  return chaseAimAngles(chase, { eye: camera.position, yaw, pitch, targets: [walls, ...enemies.map(enemy => enemy.group)] });
}

function updatePlayerModel(dt) {
  const me = coop?.state?.players.find(p => p.id === coop.id);
  const definition = getCharacter(coop ? me?.character : characterSelect.selected.id);
  if (playerModel?.id !== definition.id) {
    if (playerModel) disposeCharacter(playerModel.character);
    const character = createCharacter(characterAssets.get(definition.model), definition);
    scene.add(character.group);
    playerModel = { id: definition.id, character };
  }
  const { character } = playerModel;
  const down = coop ? me?.down : mode === 'dead';
  const moving = coop ? me?.moving : playerMoving;
  const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
  character.group.visible = true;
  character.group.position.set(camera.position.x, down ? 0 : coop ? Math.max(0, camera.position.y - 1.65) : jumpY, camera.position.z);
  character.group.rotation.y = yaw + Math.PI;
  holdWeapon(character, weaponAssets, getWeapon(weaponId));
  const airborne = coop ? me?.y > 0.05 : jumpY > 0.05;
  setCharacterAnimation(character, down ? 'Death' : airborne ? 'Jumping' : moving ? (sprinting ? 'Running' : 'Walking') : 'Idle');
  character.mixer.update(dt);
}

function toggleView() {
  thirdPerson = !thirdPerson;
  saveThirdPerson(thirdPerson);
  notify(thirdPerson ? 'NÉZET: HARMADIK SZEMÉLY' : 'NÉZET: ELSŐ SZEMÉLY', 1.5);
}

function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b191b);
  scene.fog = new THREE.FogExp2(0x102323, 0.014);
  camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, 0.05, 180);
  chase = createChaseCamera(76, innerWidth / innerHeight);
  thirdPerson = loadThirdPerson();
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0xc4edc8, 0x172c35, 2.5));
  const sun = new THREE.DirectionalLight(0xd0f9b4, 2.8);
  sun.position.set(20, 45, 10);
  scene.add(sun);
  const headlight = new THREE.PointLight(0xd5ffd0, 8, 17, 1.5);
  camera.add(headlight);
  buildWeapon();
  equipWeapon(DEFAULT_WEAPON);
  $('weapon-slots').replaceChildren(...WEAPON_ORDER.map((id, index) => {
    const slot = document.createElement('span');
    slot.dataset.weapon = id;
    slot.textContent = index + 1;
    slot.title = WEAPONS[id].name;
    return slot;
  }));
  characterSelect = setupCharacterSelect($('character-list'));
  seed = randomSeed();
  $('preview-seed').textContent = seed.slice(0, 4);
  buildLevel(`${seed}:1`);
  renderer.setAnimationLoop(animate);
  $('start').addEventListener('click', startRun);
  $('randomize').addEventListener('click', () => {
    level = 1;
    seed = randomSeed();
    $('seed').value = seed;
    $('preview-seed').textContent = seed.slice(0, 4);
    buildLevel(`${seed}:1`);
  });
  $('resume').addEventListener('click', () => {
    unlockAudio();
    if (mode === 'disconnected') { $('restart').click(); return; }
    if (coop) {
      if (['dead', 'cleared'].includes(coop.state?.status)) { coop.send({ type: 'begin' }); return; }
      mode = 'playing';
      $('modal').classList.add('hidden');
      clearInput(); requestControl();
      return;
    }
    if (mode === 'dead') { $('seed').value = seed; startRun(); return; }
    if (mode === 'cleared') {
      level++;
      health = Math.min(maxHealth, health + 30);
      ammo = getWeapon(weaponId).magazine;
      reserve = Math.min(getWeapon(weaponId).maxReserve, reserve + getWeapon(weaponId).pickup * 2);
      buildLevel(`${seed}:${level}`);
      notify('ÚJ SZEKTOR. MARADJ MOZGÁSBAN!', 3);
    }
    mode = 'playing';
    $('modal').classList.add('hidden');
    clearInput();
    requestControl();
  });
  $('restart').addEventListener('click', () => {
    leaveCoop();
    mode = 'menu';
    clearInput();
    weapon.visible = false;
    $('modal').classList.add('hidden');
    $('hud').classList.add('hidden');
    $('menu').classList.remove('hidden');
    damageFlash = 0;
    $('start').focus();
  });
  $('create-room').addEventListener('click', () => connectCoop('create'));
  $('join-room').addEventListener('click', () => connectCoop('join'));
  $('lobby-start').addEventListener('click', () => coop?.send({ type: 'begin' }));
  $('lobby-leave').addEventListener('click', () => { leaveCoop(); mode = 'menu'; });
  $('touch-revive').addEventListener('pointerdown', event => {
    event.preventDefault();
    $('touch-revive').setPointerCapture(event.pointerId);
    reviveHeld = true;
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) $('touch-revive').addEventListener(name, () => { reviveHeld = false; });
  $('touch-jump').addEventListener('pointerdown', event => {
    event.preventDefault();
    $('touch-jump').setPointerCapture(event.pointerId);
    touchJump = true;
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) $('touch-jump').addEventListener(name, () => { touchJump = false; });
  $('pause-button').addEventListener('click', () => pause());
  $('sound').addEventListener('click', () => {
    setSoundEnabled(!isSoundEnabled());
    const sound = isSoundEnabled();
    $('sound').textContent = sound ? 'HANG: BE' : 'HANG: KI';
    $('sound').setAttribute('aria-pressed', String(sound));
    $('sound').setAttribute('aria-label', sound ? 'Hang bekapcsolva' : 'Hang kikapcsolva');
  });
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    chase.aspect = camera.aspect;
    chase.updateProjectionMatrix();
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && !touch) pause();
  });
  document.addEventListener('pointerlockerror', () => {
    if (!touch) pause('Az egér zárolása nem sikerült. Kattints a Folytatás gombra, vagy nyisd meg a játékot külön lapon.');
  });
  document.addEventListener('mousemove', event => {
    if (mode !== 'playing' || document.pointerLockElement !== canvas) return;
    const sensitivity = aiming ? 0.0011 : 0.0022;
    yaw -= event.movementX * sensitivity;
    pitch = THREE.MathUtils.clamp(pitch - event.movementY * sensitivity, -1.35, 1.35);
  });
  document.addEventListener('keydown', event => {
    if (mode !== 'playing') return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    keys.add(event.code);
    if (event.code === 'KeyR') reload();
    if (event.code === 'KeyV' && !event.repeat) toggleView();
    const slot = /^Digit(\d)$/.exec(event.code);
    if (slot) switchWeapon(WEAPON_ORDER[Number(slot[1]) - 1]);
    if (event.code === 'Escape') pause();
  });
  document.addEventListener('wheel', event => {
    if (mode === 'playing' && Math.abs(event.deltaY) > 0) cycleWeapon(Math.sign(event.deltaY));
  }, { passive: true });
  document.addEventListener('keyup', event => keys.delete(event.code));
  canvas.addEventListener('mousedown', event => {
    if (mode !== 'playing' || document.pointerLockElement !== canvas) return;
    if (event.button === 2) setAiming(true);
    if (event.button === 0) {
      firing = true;
      shoot();
    }
  });
  document.addEventListener('mouseup', event => {
    if (event.button === 0) firing = false;
    if (event.button === 2) setAiming(false);
  });
  window.addEventListener('blur', () => pause());
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    mode = 'error';
    showModal('GRAFIKAI KAPCSOLAT MEGSZAKADT', 'ÚJRATÖLTÉS SZÜKSÉGES', 'A böngésző elveszítette a grafikus kapcsolatot. Töltsd újra az oldalt.', 'OLDAL ÚJRATÖLTÉSE');
    $('resume').onclick = () => location.reload();
    $('restart').classList.add('hidden');
  });
  setupTouch();
}

function setupTouch() {
  let stickPointer = null;
  let lookPointer = null;
  let lastX = 0;
  let lastY = 0;
  const pad = $('joystick');
  const look = $('look-zone');
  const updateStick = event => {
    const rect = pad.getBoundingClientRect();
    let x = (event.clientX - rect.left - rect.width / 2) / 40;
    let y = (event.clientY - rect.top - rect.height / 2) / 40;
    const length = Math.max(1, Math.hypot(x, y));
    x /= length; y /= length;
    joystick = { x, y };
    $('stick').style.transform = `translate(${x * 32}px, ${y * 32}px)`;
  };
  pad.addEventListener('pointerdown', event => {
    if (stickPointer !== null || mode !== 'playing') return;
    stickPointer = event.pointerId;
    pad.setPointerCapture(event.pointerId);
    updateStick(event);
  });
  pad.addEventListener('pointermove', event => { if (event.pointerId === stickPointer) updateStick(event); });
  const releaseStick = event => {
    if (event.pointerId !== stickPointer) return;
    stickPointer = null;
    joystick = { x: 0, y: 0 };
    $('stick').style.transform = '';
  };
  pad.addEventListener('pointerup', releaseStick);
  pad.addEventListener('pointercancel', releaseStick);
  look.addEventListener('pointerdown', event => {
    if (lookPointer !== null || mode !== 'playing') return;
    lookPointer = event.pointerId;
    lastX = event.clientX; lastY = event.clientY;
    look.setPointerCapture(event.pointerId);
  });
  look.addEventListener('pointermove', event => {
    if (event.pointerId !== lookPointer || mode !== 'playing') return;
    const sensitivity = aiming ? 0.0025 : 0.005;
    yaw -= (event.clientX - lastX) * sensitivity;
    pitch = THREE.MathUtils.clamp(pitch - (event.clientY - lastY) * sensitivity, -1.35, 1.35);
    lastX = event.clientX; lastY = event.clientY;
  });
  const releaseLook = event => { if (event.pointerId === lookPointer) lookPointer = null; };
  look.addEventListener('pointerup', releaseLook);
  look.addEventListener('pointercancel', releaseLook);
  $('touch-fire').addEventListener('pointerdown', event => {
    if (mode !== 'playing') return;
    event.preventDefault();
    $('touch-fire').setPointerCapture(event.pointerId);
    firing = true;
    shoot();
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    $('touch-fire').addEventListener(name, () => { firing = false; });
  }
  $('touch-reload').addEventListener('click', reload);
  $('touch-weapon').addEventListener('click', () => cycleWeapon(1));
  $('touch-view').addEventListener('click', () => { if (mode === 'playing') toggleView(); });
  $('touch-aim').addEventListener('click', () => {
    if (mode === 'playing') setAiming(!aiming);
  });
}

async function boot() {
  try {
    characterAsset = await loadCharacterAsset();
    characterAssets = await loadCharacterAssets(Object.values(CHARACTERS));
    weaponAssets = await loadWeaponAssets();
    init();
    $('start').disabled = false;
    $('start').innerHTML = 'BELÉPÉS A SZEKTORBA <span>→</span>';
    $('randomize').disabled = false;
    $('create-room').disabled = false;
    $('join-room').disabled = false;
  } catch (error) {
    console.error(error);
    mode = 'error';
    showModal('BETÖLTÉSI HIBA', 'NEM INDULT EL', 'A karaktermodell vagy a 3D megjelenítés betöltése nem sikerült. Töltsd újra az oldalt; használj friss böngészőt, engedélyezett hardveres gyorsítással.', 'OLDAL ÚJRATÖLTÉSE');
    $('resume').onclick = () => location.reload();
    $('restart').classList.add('hidden');
  }
}

boot();
