import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

export function loadCharacterAsset() {
  return new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/RobotExpressive.glb`);
}

export function createCharacter(asset, variant = 0) {
  const model = clone(asset.scene);
  const group = new THREE.Group();
  // SkeletonUtils clones need fresh bone world matrices before measuring skinned bounds.
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const scale = 2.4 / (bounds.max.y - bounds.min.y);
  model.scale.multiplyScalar(scale);
  model.position.y -= bounds.min.y * scale;
  group.add(model);
  const materials = new Map();
  const skins = [];
  model.traverse(object => {
    if (!object.isMesh) return;
    const tint = original => {
      if (!materials.has(original)) {
        const surface = original.clone();
        if (surface.name === 'Main') {
          surface.color.setHex([0xe5a34b, 0x86bbca, 0xce5e51][variant % 3]);
          surface.metalness = 0.35;
          surface.roughness = 0.48;
        }
        surface.emissive.copy(surface.color).multiplyScalar(0.12);
        materials.set(original, surface);
      }
      return materials.get(original);
    };
    object.material = Array.isArray(object.material) ? object.material.map(tint) : tint(object.material);
    if (object.isSkinnedMesh) {
      // Animated limbs can leave the bind-pose bounds; update hit bounds before raycasts.
      object.frustumCulled = false;
      skins.push(object);
    }
  });
  const mixer = new THREE.AnimationMixer(model);
  const actions = Object.fromEntries(asset.animations.map(clip => [clip.name, mixer.clipAction(clip)]));
  const character = { group, model, mixer, actions, skins, materials, animation: null };
  setCharacterAnimation(character, 'Idle');
  mixer.update(0);
  return character;
}

export function setCharacterAnimation(character, name) {
  if (character.animation === name) return;
  const next = character.actions[name];
  if (!next) return;
  const previous = character.actions[character.animation];
  next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
  if (name === 'Death') {
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
  }
  next.play();
  if (previous) next.crossFadeFrom(previous, 0.18, false);
  character.animation = name;
}

export function disposeCharacter(character) {
  character.group.removeFromParent();
  character.mixer.stopAllAction();
  character.mixer.uncacheRoot(character.model);
  for (const surface of character.materials.values()) surface.dispose();
  for (const skeleton of new Set(character.skins.map(skin => skin.skeleton))) skeleton.dispose();
}
