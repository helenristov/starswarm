const GAME_CODES = new Set([
  "KeyA",
  "KeyD",
  "KeyW",
  "KeyS",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Space",
  "KeyK",
  "KeyZ",
  "KeyP",
  "Escape",
  "Enter",
  "KeyM",
]);

const keys = new Set<string>();
const injected = new Set<string>();
let usingInject = false;

export type Actions = {
  moveX: number;
  fire: boolean;
  pause: boolean;
  start: boolean;
  mute: boolean;
  targetX: number | null;
};

const prev = { fire: false, pause: false, start: false, mute: false };

export const actions: Actions = {
  moveX: 0,
  fire: false,
  pause: false,
  start: false,
  mute: false,
  targetX: null,
};

export const edges = { fire: false, pause: false, start: false, mute: false };

const touch = { left: false, right: false, fire: false };

let worldW = 384;
let pointerTarget: number | null = null;

export function setWorldWidth(w: number): void {
  worldW = w;
}

export function setTouch(part: "left" | "right" | "fire", down: boolean): void {
  touch[part] = down;
}

export function setInjectedKeys(codes: string[]): void {
  injected.clear();
  if (codes.length === 0) {
    usingInject = false;
    return;
  }
  usingInject = true;
  for (const c of codes) injected.add(c);
}

function down(code: string): boolean {
  return usingInject ? injected.has(code) : keys.has(code);
}

function radialDeadzone(x: number, y: number, dz = 0.18): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0 };
  const scale = (m - dz) / (1 - dz) / m;
  return { x: x * scale, y: y * scale };
}

export function sample(): void {
  let mx = 0;
  if (down("KeyA") || down("ArrowLeft") || touch.left) mx -= 1;
  if (down("KeyD") || down("ArrowRight") || touch.right) mx += 1;

  actions.fire = down("Space") || down("KeyK") || down("KeyZ") || touch.fire;
  actions.pause = down("Escape") || down("KeyP");
  actions.start = down("Enter") || down("Space");
  actions.mute = down("KeyM");
  actions.targetX = usingInject ? null : pointerTarget;

  const pads = navigator.getGamepads?.() ?? [];
  for (const pad of pads) {
    if (!pad) continue;
    const stick = radialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    if (Math.abs(stick.x) > 0.05) mx = stick.x;
    if (pad.buttons[14]?.pressed) mx = -1;
    if (pad.buttons[15]?.pressed) mx = 1;
    if (pad.buttons[0]?.pressed || pad.buttons[2]?.pressed) actions.fire = true;
    if (pad.buttons[9]?.pressed) actions.pause = true;
    if (pad.buttons[9]?.pressed) actions.start = true;
  }

  if (mx < -1) mx = -1;
  if (mx > 1) mx = 1;
  actions.moveX = mx;

  edges.fire = actions.fire && !prev.fire;
  edges.pause = actions.pause && !prev.pause;
  edges.start = actions.start && !prev.start;
  edges.mute = actions.mute && !prev.mute;
  prev.fire = actions.fire;
  prev.pause = actions.pause;
  prev.start = actions.start;
  prev.mute = actions.mute;
}

function onKeyDown(e: KeyboardEvent): void {
  if (GAME_CODES.has(e.code)) e.preventDefault();
  keys.add(e.code);
}

function onKeyUp(e: KeyboardEvent): void {
  keys.delete(e.code);
}

function clearKeys(): void {
  keys.clear();
}

export function bindCanvasPointer(canvas: HTMLCanvasElement): () => void {
  const toWorld = (clientX: number) => {
    const r = canvas.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * worldW;
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointerTarget = toWorld(e.clientX);
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (pointerTarget == null) return;
    pointerTarget = toWorld(e.clientX);
  };
  const onUp = () => {
    pointerTarget = null;
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  return () => {
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
  };
}

export function attach(): () => void {
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", clearKeys);
  const vis = () => {
    if (document.hidden) clearKeys();
  };
  document.addEventListener("visibilitychange", vis);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", clearKeys);
    document.removeEventListener("visibilitychange", vis);
  };
}
