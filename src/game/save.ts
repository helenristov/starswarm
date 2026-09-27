import { SAVE_KEY, SAVE_VERSION } from "./constants";

export type ControlId = "left" | "fire" | "right";

/** Grid slot per touch control: column across (0–4), row up from the bottom (0 = bottom). Missing = default slot. */
export type ControlLayout = Partial<Record<ControlId, { col: number; row: number }>>;

type Save = {
  version: number;
  high: number;
  muted: boolean;
  controls: ControlLayout;
};

const defaults: Save = { version: SAVE_VERSION, high: 0, muted: false, controls: {} };

/** Keep only well-formed slots, so an older or hand-edited save can't break the layout. */
function cleanControls(raw: unknown): ControlLayout {
  const out: ControlLayout = {};
  if (!raw || typeof raw !== "object") return out;
  for (const id of ["left", "fire", "right"] as const) {
    const v = (raw as Record<string, unknown>)[id] as { col?: unknown; row?: unknown } | undefined;
    if (v && Number.isInteger(v.col) && Number.isInteger(v.row)) out[id] = { col: v.col as number, row: v.row as number };
  }
  return out;
}

function migrate(raw: Save): Save {
  const s = { ...defaults, ...raw };
  s.controls = cleanControls(raw.controls);
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
