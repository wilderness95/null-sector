import * as THREE from 'three';

const ray = new THREE.Raycaster();
const STORAGE_KEY = 'null-sector:third-person';

export function loadThirdPerson() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

export function saveThirdPerson(value) {
  try { localStorage.setItem(STORAGE_KEY, value ? '1' : '0'); } catch { /* The toggle still works without persistence. */ }
}

export function createChaseCamera(fov, aspect) {
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.05, 180);
  camera.rotation.order = 'YXZ';
  return camera;
}

function lookDirection(yaw, pitch) {
  return new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}

// Over-the-shoulder camera behind the eye, pulled in front of walls; aiming moves it closer.
export function updateChaseCamera(chase, { eye, yaw, pitch, aim, fov, walls }) {
  const back = THREE.MathUtils.lerp(4, 2.4, aim);
  const side = THREE.MathUtils.lerp(0.8, 0.55, aim);
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const offset = lookDirection(yaw, pitch).multiplyScalar(-back).addScaledVector(right, side);
  offset.y += 0.25;
  const length = offset.length();
  offset.divideScalar(length);
  ray.set(eye, offset);
  ray.far = length + 0.3;
  const hit = ray.intersectObject(walls, true)[0];
  const distance = hit ? Math.max(0.3, hit.distance - 0.3) : length;
  chase.position.copy(eye).addScaledVector(offset, distance);
  chase.position.y = Math.max(0.25, chase.position.y);
  chase.rotation.set(pitch, yaw, 0, 'YXZ');
  if (chase.fov !== fov) { chase.fov = fov; chase.updateProjectionMatrix(); }
  chase.updateMatrixWorld(true);
  ray.far = Infinity;
}

// Yaw/pitch of the eye-to-crosshair line, so shots land where the offset camera's crosshair points.
export function chaseAimAngles(chase, { eye, yaw, pitch, targets }) {
  const direction = lookDirection(yaw, pitch);
  ray.set(chase.position, direction);
  const hit = ray.intersectObjects(targets, true)[0];
  const point = hit ? hit.point : chase.position.clone().addScaledVector(direction, 100);
  const toPoint = point.sub(eye);
  const length = toPoint.length();
  if (length < 0.5 || toPoint.dot(direction) <= 0) return { yaw, pitch };
  return { yaw: Math.atan2(-toPoint.x, -toPoint.z), pitch: Math.asin(THREE.MathUtils.clamp(toPoint.y / length, -1, 1)) };
}
