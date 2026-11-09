// Shared by client and server. Add a playable character = add an entry here and a GLB under
// public/models/. `animations` maps Idle/Walking/Running/Jumping/Death to clip names of that model.
// `hand` (node name) + `hold` ({ right, both } clip names) let the character carry the equipped weapon;
// hold clips only move the arms, so locomotion clips lose their arm tracks.
const kenney = {
  hand: 'arm-right',
  arms: ['arm-left', 'arm-right'],
  animations: { Idle: 'idle', Walking: 'walk', Running: 'sprint', Jumping: 'jump', Death: 'die' },
  hold: { right: 'holding-right', both: 'holding-both' },
};

export const CHARACTERS = {
  vanguard: {
    id: 'vanguard', name: 'VANGUARD', role: 'KIEGYENSÚLYOZOTT',
    description: 'Kiképzett katona, megbízható minden helyzetben.',
    model: 'characters/arena/character-soldier', height: 1.9, tint: 0xe5a34b, ...kenney,
    maxHealth: 100, speed: 1, jump: 1,
  },
  scout: {
    id: 'scout', name: 'SCOUT', role: 'GYORS / SEBEZHETŐ',
    description: 'Könnyed, gyors futár: magasra ugrik, de kevésbé bírja a találatokat.',
    model: 'characters/dungeon/character-human', height: 1.75, tint: 0x86bbca, ...kenney,
    maxHealth: 80, speed: 1.15, jump: 1.15,
  },
  bulwark: {
    id: 'bulwark', name: 'BULWARK', role: 'ÁTHATOLHATATLAN / LASSÚ',
    description: 'Erős, masszív harcos: sokat kibír, de lassabb és kevésbé mozgékony.',
    model: 'characters/dungeon/character-orc', height: 2.1, tint: 0xce5e51, ...kenney,
    maxHealth: 130, speed: 0.9, jump: 0.85,
  },
};

export const CHARACTER_ORDER = Object.keys(CHARACTERS);
export const DEFAULT_CHARACTER = 'vanguard';

export const isCharacter = id => typeof id === 'string' && Object.hasOwn(CHARACTERS, id);
export const getCharacter = id => CHARACTERS[isCharacter(id) ? id : DEFAULT_CHARACTER];
