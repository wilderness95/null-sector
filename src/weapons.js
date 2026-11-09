import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WEAPONS } from './data/weapons.js';
import { setCharacterGrip } from './characters.js';

// Kenney models face -Z; flip a weapon's `view.flip` in the registry if a model ever points the other way.
export async function loadWeaponAssets() {
  const loader = new GLTFLoader();
  const models = [...new Set(Object.values(WEAPONS).map(weapon => weapon.model))];
  return new Map(await Promise.all(models.map(async model => [model, await loader.loadAsync(`${import.meta.env.BASE_URL}models/weapons/${model}.glb`)])));
}

// Returns a group centred on its own origin, scaled to `view.length`, plus the muzzle position in that group.
export function createWeaponModel(asset, definition) {
  const model = asset.scene.clone(true);
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const length = Math.max(size.x, size.z);
  const scale = definition.view.length / length;
  const alongX = size.x > size.z;
  const group = new THREE.Group();
  const holder = new THREE.Group();
  model.position.sub(center);
  holder.add(model);
  holder.scale.setScalar(scale);
  // Barrels along X are rotated onto -Z.
  if (alongX) holder.rotation.y = Math.PI / 2;
  if (definition.view.flip) holder.rotation.y += Math.PI;
  group.add(holder);
  const muzzle = new THREE.Vector3(0, 0.02, -definition.view.length / 2);
  return { group, muzzle };
}

// Held weapons are drawn larger than their first-person size to suit the chunky characters.
const HELD_SCALE = 1.6;

// Puts the weapon model in the character's hand and switches the arm pose to its grip.
// The mount is derived from the posed arm, so any rig works: barrel to the character's front, fist at the arm tip.
export function holdWeapon(character, weaponAssets, definition) {
  if (!character.hand || character.weapon?.id === definition.id) return;
  const hand = character.hand;
  character.weapon?.mount.removeFromParent();
  setCharacterGrip(character, definition.view.grip);
  character.mixer.update(0);
  character.group.updateMatrixWorld(true);
  const handScale = hand.getWorldScale(new THREE.Vector3()).x;
  const pivot = hand.getWorldPosition(new THREE.Vector3());
  const armBounds = new THREE.Box3().setFromObject(hand);
  const worldForward = new THREE.Vector3(0, 0, 1).applyQuaternion(character.group.getWorldQuaternion(new THREE.Quaternion()));
  // Bone-only arms (skinned models) have no geometry to measure; arm length is ~0.39 of the character height.
  const fist = armBounds.isEmpty()
    ? pivot.clone().addScaledVector(worldForward, 0.39 * character.height)
    : pivot.clone().add(armBounds.getCenter(new THREE.Vector3()).sub(pivot).multiplyScalar(2));
  const toHand = hand.getWorldQuaternion(new THREE.Quaternion()).invert();
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(character.group.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(toHand);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(toHand);
  const y = up.addScaledVector(forward, -up.dot(forward)).normalize();
  const z = forward.clone().negate();
  const x = new THREE.Vector3().crossVectors(y, z);
  const { group } = createWeaponModel(weaponAssets.get(definition.model), definition);
  group.position.z = -definition.view.length * 0.2;
  const mount = new THREE.Group();
  mount.add(group);
  mount.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  mount.scale.setScalar(HELD_SCALE / handScale);
  mount.position.copy(hand.worldToLocal(fist));
  hand.add(mount);
  character.weapon = { id: definition.id, mount };
}
