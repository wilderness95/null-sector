export const CELL = 4;

export function generateWorld(seed, level = 1) {
  let state = 2166136261;
  for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  const random = () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const size = 25;
  const grid = Array.from({ length: size }, () => Array(size).fill(1));
  const rooms = [];
  for (let i = 0; i < 15; i++) {
    const w = 3 + Math.floor(random() * 5);
    const h = 3 + Math.floor(random() * 5);
    const x = 1 + Math.floor(random() * (size - w - 2));
    const z = 1 + Math.floor(random() * (size - h - 2));
    const center = { x: x + Math.floor(w / 2), z: z + Math.floor(h / 2) };
    for (let row = z; row < z + h; row++) {
      for (let col = x; col < x + w; col++) grid[row][col] = 0;
    }
    if (rooms.length) {
      let { x: cx, z: cz } = rooms.at(-1);
      const horizontalFirst = random() > 0.5;
      while (cx !== center.x || cz !== center.z) {
        grid[cz][cx] = 0;
        if ((horizontalFirst && cx !== center.x) || cz === center.z) cx += Math.sign(center.x - cx);
        else cz += Math.sign(center.z - cz);
      }
    }
    rooms.push(center);
  }
  const position = (x, z) => ({ x: (x + 0.5) * CELL, z: (z + 0.5) * CELL });
  const origin = rooms[0];
  const distances = Array.from({ length: size }, () => Array(size).fill(-1));
  const queue = [origin];
  distances[origin.z][origin.x] = 0;
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = current.x + dx;
      const z = current.z + dz;
      if (grid[z]?.[x] === 0 && distances[z][x] < 0) {
        distances[z][x] = distances[current.z][current.x] + 1;
        queue.push({ x, z });
      }
    }
  }
  const end = queue.at(-1);
  const spawn = position(origin.x, origin.z);
  const candidates = queue.filter(p => p !== origin && p !== end);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const enemies = [];
  const pickups = [];
  for (const p of candidates) {
    const point = position(p.x, p.z);
    if (enemies.length < Math.min(20, 4 + level * 2) && Math.hypot(point.x - spawn.x, point.z - spawn.z) >= 16) {
      enemies.push(point);
    } else if (pickups.length < 12 && distances[p.z][p.x] > 1) {
      pickups.push({ ...point, type: pickups.length % 3 === 0 ? 'health' : 'ammo' });
    }
  }
  return { size, grid, spawn, exit: position(end.x, end.z), enemies, pickups, seed: String(seed) };
}

export function isWalkable(world, x, z, radius = 0.3) {
  for (let row = Math.floor((z - radius) / CELL); row <= Math.floor((z + radius) / CELL); row++) {
    for (let col = Math.floor((x - radius) / CELL); col <= Math.floor((x + radius) / CELL); col++) {
      if (world.grid[row]?.[col] === 0) continue;
      const nearX = Math.max(col * CELL, Math.min(x, (col + 1) * CELL));
      const nearZ = Math.max(row * CELL, Math.min(z, (row + 1) * CELL));
      if ((nearX - x) ** 2 + (nearZ - z) ** 2 <= radius ** 2) return false;
    }
  }
  return true;
}

export function findPath(world, from, to) {
  const sx = Math.floor(from.x / CELL);
  const sz = Math.floor(from.z / CELL);
  const tx = Math.floor(to.x / CELL);
  const tz = Math.floor(to.z / CELL);
  if (world.grid[sz]?.[sx] !== 0 || world.grid[tz]?.[tx] !== 0) return [];
  const start = sz * world.size + sx;
  const target = tz * world.size + tx;
  const parent = new Map([[start, -1]]);
  const queue = [start];
  for (let i = 0; i < queue.length && !parent.has(target); i++) {
    const index = queue[i];
    const x = index % world.size;
    const z = Math.floor(index / world.size);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      const next = nz * world.size + nx;
      if (world.grid[nz]?.[nx] === 0 && !parent.has(next)) {
        parent.set(next, index);
        queue.push(next);
      }
    }
  }
  if (!parent.has(target)) return [];
  const path = [];
  for (let next = target; next !== start; next = parent.get(next)) {
    path.push({ x: (next % world.size + 0.5) * CELL, z: (Math.floor(next / world.size) + 0.5) * CELL });
  }
  return path.reverse();
}
