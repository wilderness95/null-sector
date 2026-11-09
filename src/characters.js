import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const ENEMY_TINTS = [0xe5a34b, 0x86bbca, 0xce5e51];

export function loadCharacterAsset(model = 'RobotExpressive') {
  return new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/${model}.glb`);
}

// Loads every distinct model referenced by the given character definitions: Map(model -> glTF).
export async function loadCharacterAssets(definitions) {
  const models = [...new Set(definitions.map(definition => definition.model))];
  return new Map(await Promise.all(models.map(async model => [model, await loadCharacterAsset(model)])));
}

// `appearance` is a character definition or a numeric variant index for hostile robots.
// Definition fields: tintMaterial (recolor that material with `tint`), height, animations, hand, hold, arms (see data/characters.js).
export function createCharacter(asset, appearance = 0) {
  const robot = typeof appearance === 'number';
  const color = robot ? ENEMY_TINTS[appearance % ENEMY_TINTS.length] : appearance.tint;
  const tintMaterial = robot ? 'Main' : appearance.tintMaterial;
  const height = robot ? 2.4 : appearance.height ?? 2.4;
  const model = clone(asset.scene);
  const group = new THREE.Group();
  // SkeletonUtils clones need fresh bone world matrices before measuring skinned bounds.
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const scale = height / (bounds.max.y - bounds.min.y);
  model.scale.multiplyScalar(scale);
  model.position.y -= bounds.min.y * scale;
  group.add(model);
  const materials = new Map();
  const skins = [];
  model.traverse(object => {
    if (!object.isMesh) return;
    const recolor = original => {
      if (!materials.has(original)) {
        const surface = original.clone();
        if (tintMaterial && surface.name === tintMaterial) {
          surface.color.setHex(color);
          surface.metalness = 0.35;
          surface.roughness = 0.48;
        }
        if (robot) surface.emissive.copy(surface.color).multiplyScalar(0.12);
        materials.set(original, surface);
      }
      return materials.get(original);
    };
    object.material = Array.isArray(object.material) ? object.material.map(recolor) : recolor(object.material);
    if (object.isSkinnedMesh) {
      // Animated limbs can leave the bind-pose bounds; update hit bounds before raycasts.
      object.frustumCulled = false;
      skins.push(object);
    }
  });
  const mixer = new THREE.AnimationMixer(model);
  const definition = robot ? {} : appearance;
  const locomotion = new Set(['Idle', 'Walking', 'Running', 'Jumping'].map(name => definition.animations?.[name]));
  const withoutArms = clip => definition.hold && locomotion.has(clip.name)
    ? new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.filter(track => !definition.arms.some(arm => track.name.startsWith(`${arm}.`))))
    : clip;
  const actions = Object.fromEntries(asset.animations.map(clip => [clip.name, mixer.clipAction(withoutArms(clip))]));
  for (const [alias, clipName] of Object.entries(definition.animations ?? {})) actions[alias] = actions[clipName];
  const holds = Object.fromEntries(Object.entries(definition.hold ?? {}).map(([grip, clipName]) => [grip, actions[clipName]]));
  const hand = definition.hand ? model.getObjectByName(definition.hand) : null;
  const character = { group, model, mixer, actions, holds, hand, height, grip: null, weapon: null, skins, materials, animation: null };
  setCharacterAnimation(character, 'Idle');
  mixer.update(0);
  return character;
}

// Arm-only clips layered over locomotion: grip is 'right', 'both' or null.
export function setCharacterGrip(character, grip) {
  character.grip = grip;
  applyGrip(character);
}

function applyGrip(character) {
  for (const [grip, action] of Object.entries(character.holds)) {
    action.enabled = true;
    action.setEffectiveWeight(character.animation !== 'Death' && character.grip === grip ? 1 : 0);
    if (!action.isRunning()) action.play();
  }
}

export function setCharacterAnimation(character, name) {
  if (character.animation === name) return;
  const next = character.actions[name];
  if (!next) return;
  const previous = character.actions[character.animation];
  next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
  if (name === 'Death' || name === 'Jumping') {
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
  }
  next.play();
  if (previous) next.crossFadeFrom(previous, 0.18, false);
  character.animation = name;
  applyGrip(character);
}

export function disposeCharacter(character) {
  character.group.removeFromParent();
  character.mixer.stopAllAction();
  character.mixer.uncacheRoot(character.model);
  for (const surface of character.materials.values()) surface.dispose();
  for (const skeleton of new Set(character.skins.map(skin => skin.skeleton))) skeleton.dispose();
}
