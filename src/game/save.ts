import { SAVE_KEY, SAVE_VERSION } from "./constants";

type Save = {
  version: number;
  high: number;
  muted: boolean;
};

const defaults: Save = { version: SAVE_VERSION, high: 0, muted: false };

function migrate(raw: Save): Save {
  const s = { ...defaults, ...raw };
  s.version = SAVE_VERSION;
  return s;
}

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as Save;
    return migrate(parsed);
  } catch {
    return { ...defaults };
  }
}

export function writeSave(partial: Partial<Save>): Save {
  const next = { ...loadSave(), ...partial, version: SAVE_VERSION };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(next));
  } catch {
    /* private mode / quota */
  }
  return next;
}
