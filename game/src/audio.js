// Procedural sound with the Web Audio API: every effect is synthesised from oscillators and a
// noise buffer, so the game ships no audio files. The context is created lazily on the first
// user gesture, as browsers require, and every effect is a short envelope so sounds can overlap.

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;
  let lastBoom = 0;

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.32;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }

  /** One oscillator blip with an exponential decay. */
  function blip(type, from, to, seconds, volume, when = 0) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + seconds);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.02);
  }

  /** One burst of filtered noise, for explosions and impacts. */
  function noise(seconds, volume, filterFrom, filterTo, when = 0) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFrom, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, filterTo), t0 + seconds);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
    src.stop(t0 + seconds + 0.02);
  }

  return {
    unlock,
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.32;
      return muted;
    },
    shoot() {
      blip('square', 920, 240, 0.09, 0.10);
    },
    enemyHit() {
      blip('triangle', 340, 180, 0.05, 0.06);
    },
    explosion(big) {
      const now = performance.now();
      if (now - lastBoom < 50) return; // a volley of kills is one boom, not a roar
      lastBoom = now;
      noise(big ? 0.5 : 0.28, big ? 0.5 : 0.3, big ? 3200 : 2400, 120);
      blip('sine', big ? 160 : 220, 40, big ? 0.45 : 0.25, 0.35);
    },
    hurt() {
      blip('sawtooth', 200, 55, 0.25, 0.3);
      noise(0.15, 0.2, 1800, 300);
    },
    pickup() {
      blip('sine', 660, 660, 0.07, 0.18);
      blip('sine', 990, 990, 0.1, 0.18, 0.07);
    },
    waveStart() {
      blip('sawtooth', 110, 110, 0.3, 0.16);
      blip('sawtooth', 165, 165, 0.3, 0.16, 0.02);
      blip('square', 440, 440, 0.12, 0.08, 0.3);
    },
    waveClear() {
      blip('sine', 523, 523, 0.1, 0.16);
      blip('sine', 659, 659, 0.1, 0.16, 0.09);
      blip('sine', 784, 784, 0.16, 0.16, 0.18);
    },
    gameOver() {
      blip('sawtooth', 320, 40, 1.1, 0.3);
      noise(0.9, 0.3, 2600, 80);
    },
    victory() {
      const notes = [523, 659, 784, 1046, 784, 1046];
      notes.forEach((note, i) => blip('triangle', note, note, 0.22, 0.2, i * 0.13));
    },
    uiClick() {
      blip('sine', 740, 740, 0.06, 0.12);
    },
  };
}
