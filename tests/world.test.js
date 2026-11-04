import test from 'node:test';
import assert from 'node:assert/strict';
import { CELL, generateWorld, isWalkable, findPath } from '../src/world.js';

test('seed reproduces the same map, different seeds create different maps', () => {
  assert.deepEqual(generateWorld('NULL'), generateWorld('NULL'));
  assert.notDeepEqual(generateWorld('NULL').grid, generateWorld('SECTOR').grid);
});

test('100 random maps are enclosed, connected, and have valid unique spawns', () => {
  for (let seed = 0; seed < 100; seed++) {
    const world = generateWorld(seed, 1 + seed % 15);
    const { grid, size, spawn, exit, enemies, pickups } = world;
    assert.ok(grid[0].every(Boolean) && grid.at(-1).every(Boolean));
    assert.ok(grid.every(row => row[0] === 1 && row.at(-1) === 1));
    const occupied = [spawn, exit, ...enemies, ...pickups];
    assert.equal(new Set(occupied.map(p => `${p.x},${p.z}`)).size, occupied.length);
    for (const p of occupied) assert.ok(isWalkable(world, p.x, p.z, 0.65));
    assert.equal(enemies.length, Math.min(20, 4 + (1 + seed % 15) * 2));
    for (const p of enemies) assert.ok(Math.hypot(p.x - spawn.x, p.z - spawn.z) >= 16);
    const visited = new Set();
    const queue = [{ x: Math.floor(spawn.x / CELL), z: Math.floor(spawn.z / CELL) }];
    visited.add(`${queue[0].x},${queue[0].z}`);
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = p.x + dx;
        const z = p.z + dz;
        if (grid[z]?.[x] === 0 && !visited.has(`${x},${z}`)) {
          visited.add(`${x},${z}`);
          queue.push({ x, z });
        }
      }
    }
    assert.equal(visited.size, grid.flat().filter(cell => cell === 0).length);
    const path = findPath(world, spawn, exit);
    assert.ok(path.length > 3);
    assert.deepEqual(path.at(-1), exit);
    let previous = spawn;
    for (const p of path) {
      assert.equal(Math.abs(p.x - previous.x) + Math.abs(p.z - previous.z), CELL);
      assert.ok(isWalkable(world, p.x, p.z));
      previous = p;
    }
    assert.equal(grid.length, size);
  }
});

test('collision respects wall edges, diagonal corners, and out-of-bounds', () => {
  const world = { size: 4, grid: [[1, 1, 1, 1], [1, 0, 0, 1], [1, 0, 1, 1], [1, 1, 1, 1]] };
  assert.equal(isWalkable(world, 6, 6), true);
  assert.equal(isWalkable(world, 4.2, 6, 0.3), false);
  assert.equal(isWalkable(world, 4.4, 6, 0.3), true);
  assert.equal(isWalkable(world, 7.8, 7.8, 0.3), false);
  assert.equal(isWalkable(world, 7.7, 7.7, 0.3), true);
  assert.equal(isWalkable(world, -3, 6), false);
  assert.equal(isWalkable(world, 18, 6), false);
  assert.deepEqual(findPath(world, { x: 6, z: 6 }, { x: 6, z: 6 }), []);
  assert.deepEqual(findPath(world, { x: 6, z: 6 }, { x: 10, z: 10 }), []);
});
