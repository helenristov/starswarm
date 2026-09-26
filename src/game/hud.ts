export type Screen = "title" | "playing" | "paused" | "over" | "stage";

export type HudState = {
  screen: Screen;
  score: number;
  high: number;
  lives: number;
  stage: number;
  dual: boolean;
  muted: boolean;
  challenge: boolean;
  message: string;
};

const initial: HudState = {
  screen: "title",
  score: 0,
  high: 0,
  lives: 3,
  stage: 1,
  dual: false,
  muted: false,
  challenge: false,
  message: "",
};

let state: HudState = { ...initial };
const subs = new Set<() => void>();

export function getHud(): HudState {
  return state;
}

export function subscribeHud(cb: () => void): () => void {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

export function patchHud(partial: Partial<HudState>): void {
  const next = { ...state, ...partial };
  let changed = false;
  for (const key of Object.keys(next) as (keyof HudState)[]) {
    if (next[key] !== state[key]) {
      changed = true;
      break;
    }
  }
  if (!changed) return;
  state = next;
  subs.forEach((cb) => cb());
}

export function resetHud(high: number, muted: boolean): void {
  state = { ...initial, high, muted };
  subs.forEach((cb) => cb());
}
