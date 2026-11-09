// Shared by client and server (no browser or three.js imports). Add a weapon = add an entry here
// and a GLB under public/models/weapons/. Damage is in enemy-HP units (enemies have 3 HP).
// view.grip: which hold pose a third-person character uses ('right' one hand, 'both' two hands).
export const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'VX-9 AUTO', kind: 'GÉPKARABÉLY', model: 'repeater',
    magazine: 30, reserve: 120, maxReserve: 240, pickup: 36,
    cooldown: 0.09, reload: 1.45, damage: 1, pellets: 1, spread: 0, range: 65, auto: true,
    zoom: 48, recoil: 1, sound: [160, 0.12, 'sawtooth', 0.065, 35],
    view: { length: 0.42, grip: 'both', position: [0.26, -0.2, -0.6] },
  },
  pistol: {
    id: 'pistol', name: 'P-12 SIDEARM', kind: 'PISZTOLY', model: 'pistol',
    magazine: 12, reserve: 60, maxReserve: 120, pickup: 18,
    cooldown: 0.26, reload: 1, damage: 1.5, pellets: 1, spread: 0, range: 65, auto: false,
    zoom: 54, recoil: 0.7, sound: [260, 0.09, 'square', 0.05, 70],
    view: { length: 0.3, grip: 'right', position: [0.24, -0.2, -0.5] },
  },
  shotgun: {
    id: 'shotgun', name: 'BREACH-8', kind: 'PUMPÁLÓS SROTOS', model: 'shotgun',
    magazine: 6, reserve: 30, maxReserve: 60, pickup: 8,
    cooldown: 0.85, reload: 2, damage: 0.6, pellets: 8, spread: 0.07, range: 28, auto: false,
    zoom: 60, recoil: 1.8, sound: [110, 0.22, 'sawtooth', 0.09, 28],
    view: { length: 0.55, grip: 'both', position: [0.26, -0.21, -0.65] },
  },
  sniper: {
    id: 'sniper', name: 'LONGSHOT-S', kind: 'TÁVCSÖVES PUSKA', model: 'sniper',
    magazine: 5, reserve: 20, maxReserve: 40, pickup: 5,
    cooldown: 1.25, reload: 2.2, damage: 3, pellets: 1, spread: 0, range: 120, auto: false,
    zoom: 16, scope: true, recoil: 2.2, sound: [95, 0.3, 'sawtooth', 0.09, 25],
    view: { length: 0.7, grip: 'both', position: [0.25, -0.2, -0.7] },
  },
  heavy: {
    id: 'heavy', name: 'HX-60 SUPPRESSOR', kind: 'NEHÉZ GÉPPUSKA', model: 'heavy',
    magazine: 60, reserve: 180, maxReserve: 360, pickup: 60,
    cooldown: 0.065, reload: 3, damage: 0.55, pellets: 1, spread: 0.02, range: 55, auto: true,
    zoom: 52, recoil: 0.6, sound: [140, 0.09, 'sawtooth', 0.05, 40],
    view: { length: 0.55, grip: 'both', position: [0.27, -0.21, -0.65] },
  },
};

export const WEAPON_ORDER = Object.keys(WEAPONS);
export const DEFAULT_WEAPON = 'rifle';

export const isWeapon = id => typeof id === 'string' && Object.hasOwn(WEAPONS, id);
export const getWeapon = id => WEAPONS[isWeapon(id) ? id : DEFAULT_WEAPON];
