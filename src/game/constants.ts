export const W = 384;
export const H = 640;
export const FIXED = 1 / 60;
export const PLAYER_Y = 572;
export const PLAYER_SPEED = 290;
export const SHOT_SPEED = 540;
export const ENEMY_SHOT_SPEED = 155;
export const MAX_PLAYER_SHOTS = 2;
export const MAX_DUAL_SHOTS = 4;

export const COLS = 10;
export const ROW_Y = [86, 128, 170, 212, 254] as const;

export function colX(i: number): number {
  return 42 + i * 33.2;
}

export const KIND_SCORE = {
  wasp: { form: 50, dive: 100 },
  moth: { form: 80, dive: 160 },
  commander: { form: 150, dive: 400 },
} as const;

export const SAVE_KEY = "star-swarm-v1";
export const SAVE_VERSION = 1;
