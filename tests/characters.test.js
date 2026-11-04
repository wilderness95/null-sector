import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCharacter, setCharacterAnimation, disposeCharacter } from '../src/characters.js';

test('local character keeps human-scale bounds, independent skeletons and working animations', async () => {
  const bytes = await readFile(new URL('../public/models/RobotExpressive.glb', import.meta.url));
  const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const first = createCharacter(asset, 0);
  const second = createCharacter(asset, 1);
  assert.notEqual(first.skins[0].skeleton, second.skins[0].skeleton);
  assert.notEqual(first.skins[0].skeleton.bones[0], second.skins[0].skeleton.bones[0]);
  assert.ok(first.model.scale.x > 0.4 && first.model.scale.x < 0.6);
  for (const animation of ['Idle', 'Walking', 'Running', 'Death']) {
    setCharacterAnimation(first, animation);
    first.mixer.update(0.3);
    first.group.updateMatrixWorld(true);
    for (const skin of first.skins) { skin.computeBoundingBox(); skin.computeBoundingSphere(); }
    const bounds = new THREE.Box3().setFromObject(first.group);
    const height = bounds.max.y - bounds.min.y;
    assert.ok(height > 1 && height < 3.5, `${animation}: unexpected height ${height}`);
    assert.equal(first.animation, animation);
  }
  assert.equal(second.animation, 'Idle');
  assert.equal(first.actions.Death.loop, THREE.LoopOnce);
  assert.equal(first.actions.Death.clampWhenFinished, true);
  disposeCharacter(first);
  setCharacterAnimation(second, 'Walking');
  second.mixer.update(0.2);
  disposeCharacter(second);
});
