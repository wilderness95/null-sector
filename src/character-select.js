import { CHARACTERS, CHARACTER_ORDER, DEFAULT_CHARACTER, isCharacter } from './data/characters.js';

const STORAGE_KEY = 'null-sector:character';

function stored() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

// Renders one card per registered character; new entries in the registry appear automatically.
export function setupCharacterSelect(container, onChange) {
  let selected = isCharacter(stored()) ? stored() : DEFAULT_CHARACTER;
  const buttons = new Map();
  const select = id => {
    selected = id;
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* Selection still works without persistence. */ }
    for (const [key, button] of buttons) button.setAttribute('aria-checked', String(key === id));
    onChange?.(CHARACTERS[id]);
  };
  for (const id of CHARACTER_ORDER) {
    const character = CHARACTERS[id];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'character-card';
    button.dataset.character = id;
    button.setAttribute('role', 'radio');
    button.style.setProperty('--tint', `#${character.tint.toString(16).padStart(6, '0')}`);
    const name = document.createElement('strong');
    name.textContent = character.name;
    const role = document.createElement('span');
    role.textContent = character.role;
    const stats = document.createElement('small');
    stats.textContent = `HP ${character.maxHealth} / SEBESSÉG ${Math.round(character.speed * 100)}%`;
    button.append(name, role, stats);
    button.title = character.description;
    button.addEventListener('click', () => select(id));
    buttons.set(id, button);
    container.append(button);
  }
  select(selected);
  return { get selected() { return CHARACTERS[selected]; } };
}
