type Bus = "master" | "sfx" | "music";

let ctx: AudioContext | null = null;
const gains: Partial<Record<Bus, GainNode>> = {};
let muted = false;
let unlocked = false;

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: "interactive" });
    const master = ctx.createGain();
    const sfx = ctx.createGain();
    const music = ctx.createGain();
    sfx.connect(master);
    music.connect(master);
    master.connect(ctx.destination);
    master.gain.value = 0.85;
    sfx.gain.value = 0.9;
    music.gain.value = 0.22;
    gains.master = master;
    gains.sfx = sfx;
    gains.music = music;
  }
  return ctx;
}

export function unlockAudio(): void {
  const c = ensure();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  unlocked = true;
}

export function setMuted(value: boolean): void {
  muted = value;
  const c = ensure();
  if (!c || !gains.master) return;
  const g = muted ? 0 : 0.85;
  gains.master.gain.setTargetAtTime(g, c.currentTime, 0.03);
}

export function isMuted(): boolean {
  return muted;
}

function tone(opts: {
  freq: number;
  dur: number;
  type?: OscillatorType;
  vol?: number;
  slide?: number;
  delay?: number;
}): void {
  if (muted || !unlocked) return;
  const c = ensure();
  const bus = gains.sfx;
  if (!c || !bus) return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? "square";
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, opts.slide), t0 + opts.dur);
  const vol = opts.vol ?? 0.08;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  osc.connect(g);
  g.connect(bus);
  osc.start(t0);
  osc.stop(t0 + opts.dur + 0.02);
}

function noise(dur: number, vol = 0.12): void {
  if (muted || !unlocked) return;
  const c = ensure();
  const bus = gains.sfx;
  if (!c || !bus) return;
  const n = Math.floor(c.sampleRate * dur);
  const buffer = c.createBuffer(1, n, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const g = c.createGain();
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1800;
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(bus);
  src.start();
}

export const sfx = {
  shoot() {
    const r = 1 + (Math.random() * 0.12 - 0.06);
    tone({ freq: 880 * r, dur: 0.055, type: "square", vol: 0.05 });
  },
  hit() {
    tone({ freq: 240, dur: 0.08, type: "square", vol: 0.06, slide: 90 });
  },
  explode() {
    noise(0.22, 0.16);
    tone({ freq: 180, dur: 0.2, type: "sawtooth", vol: 0.07, slide: 50 });
  },
  dive() {
    tone({ freq: 420, dur: 0.35, type: "square", vol: 0.04, slide: 160 });
  },
  capture() {
    tone({ freq: 220, dur: 0.5, type: "sine", vol: 0.08, slide: 90 });
    tone({ freq: 330, dur: 0.5, type: "sine", vol: 0.05, slide: 140, delay: 0.05 });
  },
  extra() {
    [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.12, type: "square", vol: 0.07, delay: i * 0.1 }));
  },
  stage() {
    [392, 523, 659].forEach((f, i) => tone({ freq: f, dur: 0.14, type: "square", vol: 0.06, delay: i * 0.09 }));
  },
  over() {
    [330, 247, 196, 130].forEach((f, i) => tone({ freq: f, dur: 0.22, type: "square", vol: 0.07, delay: i * 0.16 }));
  },
  dual() {
    tone({ freq: 660, dur: 0.18, type: "square", vol: 0.07 });
    tone({ freq: 990, dur: 0.22, type: "square", vol: 0.05, delay: 0.08 });
  },
  start() {
    tone({ freq: 440, dur: 0.1, type: "square", vol: 0.06 });
    tone({ freq: 660, dur: 0.12, type: "square", vol: 0.05, delay: 0.08 });
  },
};

export function attachAudioUnlock(): void {
  const go = () => unlockAudio();
  window.addEventListener("pointerdown", go, { once: true });
  window.addEventListener("keydown", go, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) unlockAudio();
  });
}
