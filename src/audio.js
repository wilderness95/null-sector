let context;
let enabled = true;

export function unlockAudio() {
  try {
    context ??= new (window.AudioContext || window.webkitAudioContext)();
    context.resume().catch(() => {});
  } catch { /* Audio is optional when unavailable in the browser. */ }
}

export function setSoundEnabled(value) {
  enabled = value;
  if (enabled) unlockAudio();
}

export function isSoundEnabled() { return enabled; }

export function tone(frequency, duration = 0.1, type = 'sine', volume = 0.04, end = frequency / 3) {
  if (!enabled || !context || context.state !== 'running') return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), context.currentTime + duration);
  gain.gain.setValueAtTime(volume, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}
