import {
  COLS,
  ENEMY_SHOT_SPEED,
  FIXED,
  H,
  KIND_SCORE,
  MAX_DUAL_SHOTS,
  MAX_PLAYER_SHOTS,
  PLAYER_SPEED,
  PLAYER_Y,
  ROW_Y,
  SHOT_SPEED,
  W,
  colX,
} from "./constants";
import { actions, attach, bindCanvasPointer, edges, sample, setInjectedKeys, setWorldWidth } from "./input";
import { attachAudioUnlock, sfx, setMuted, unlockAudio } from "./audio";
import { loadSave, writeSave } from "./save";
import { patchHud, type Screen } from "./hud";
import { drawSprite, loadAtlas, type Atlas } from "./sprites";

type Kind = "wasp" | "moth" | "commander";
type Mode = "enter" | "form" | "dive" | "return" | "tractor" | "flyby";

type Enemy = {
  alive: boolean;
  kind: Kind;
  x: number;
  y: number;
  angle: number;
  slotX: number;
  slotY: number;
  mode: Mode;
  t: number;
  dur: number;
  hp: number;
  flash: number;
  anim: number;
  side: number;
  shot: boolean;
  captured: boolean;
  delay: number;
  sx: number;
  sy: number;
  path: Bez | null;
};

type Shot = { alive: boolean; x: number; y: number; vy: number; friendly: boolean };
type Particle = { alive: boolean; x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };
type Burst = { alive: boolean; x: number; y: number; t: number };
type Pop = { alive: boolean; x: number; y: number; t: number; text: string };
type Star = { x: number; y: number; s: number; sp: number };
type Bez = { x0: number; y0: number; x1: number; y1: number; x2: number; y2: number; x3: number; y3: number };
type Drop = { alive: boolean; x: number; y: number };

function bez(b: Bez, t: number): { x: number; y: number } {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return {
    x: uu * u * b.x0 + 3 * uu * t * b.x1 + 3 * u * tt * b.x2 + tt * t * b.x3,
    y: uu * u * b.y0 + 3 * uu * t * b.y1 + 3 * u * tt * b.y2 + tt * t * b.y3,
  };
}

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

function aabb(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
  return Math.abs(ax - bx) < (aw + bw) * 0.5 && Math.abs(ay - by) < (ah + bh) * 0.5;
}

const reduced =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private atlas: Atlas | null = null;
  private raf = 0;
  private acc = 0;
  private last = 0;
  private running = false;
  private unbind: Array<() => void> = [];

  private screen: Screen = "title";
  private score = 0;
  private high = 0;
  private lives = 3;
  private stage = 1;
  private dual = false;
  private muted = false;
  private nextLife = 20000;
  private challenge = false;
  private challengeSpawned = 0;
  private challengeKills = 0;

  private player = { x: W / 2, alive: true, invuln: 0, fireCd: 0, anim: 0, visible: true };
  private respawnT = 0;
  private stageT = 0;
  private overT = 0;
  private formT = 0;
  private diveCd = 1.2;
  private hitstop = 0;
  private trauma = 0;
  private captureProg = 0;
  private drop: Drop = { alive: false, x: 0, y: 0 };
  private waveClearT = 0;
  private entering = true;

  private enemies: Enemy[] = [];
  private shots: Shot[] = [];
  private particles: Particle[] = [];
  private bursts: Burst[] = [];
  private pops: Pop[] = [];
  private stars: Star[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unsupported");
    this.ctx = ctx;
    const save = loadSave();
    this.high = save.high;
    this.muted = save.muted;
    setMuted(this.muted);
    patchHud({ high: this.high, muted: this.muted, screen: "title" });
    this.seedStars();
    this.pool();
  }

  async start(): Promise<void> {
    this.unbind.push(attach());
    this.unbind.push(bindCanvasPointer(this.canvas));
    attachAudioUnlock();
    setWorldWidth(W);
    this.resize();
    const onResize = () => this.resize();
    window.addEventListener("resize", onResize);
    this.unbind.push(() => window.removeEventListener("resize", onResize));
    this.wireControlsTest();
    const parent = this.canvas.parentElement;
    if (parent && typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(parent);
      this.unbind.push(() => ro.disconnect());
    }
    this.running = true;
    this.last = performance.now();
    void loadAtlas()
      .then((atlas) => {
        this.atlas = atlas;
      })
      .catch(() => {
        this.atlas = null;
      });
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min((now - this.last) / 1000, 0.1);
      this.last = now;
      this.acc += dt;
      while (this.acc >= FIXED) {
        this.step(FIXED);
        this.acc -= FIXED;
      }
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.unbind.forEach((fn) => fn());
    this.unbind = [];
    if (window.__controlsTest) delete window.__controlsTest;
  }

  beginRun(): void {
    unlockAudio();
    sfx.start();
    this.score = 0;
    this.lives = 3;
    this.stage = 1;
    this.dual = false;
    this.nextLife = 20000;
    this.player.x = W / 2;
    this.player.alive = true;
    this.player.visible = true;
    this.player.invuln = 1.4;
    this.beginStage();
  }

  togglePause(): void {
    if (this.screen === "playing") {
      this.screen = "paused";
      this.syncHud();
    } else if (this.screen === "paused") {
      this.screen = "playing";
      this.syncHud();
    }
  }

  toggleMute(): void {
    this.muted = !this.muted;
    setMuted(this.muted);
    writeSave({ muted: this.muted, high: this.high });
    patchHud({ muted: this.muted });
  }

  private beginStage(): void {
    this.challenge = this.stage % 4 === 0;
    this.challengeSpawned = 0;
    this.challengeKills = 0;
    this.screen = "stage";
    this.stageT = 1.7;
    this.formT = 0;
    this.diveCd = 1.4;
    this.waveClearT = 0;
    this.entering = true;
    this.captureProg = 0;
    this.drop.alive = false;
    this.clearLive();
    this.spawnWave();
    sfx.stage();
    this.syncHud();
  }

  private pool(): void {
    for (let i = 0; i < 80; i++) this.shots.push({ alive: false, x: 0, y: 0, vy: 0, friendly: true });
    for (let i = 0; i < 220; i++)
      this.particles.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: "#fff", size: 1 });
    for (let i = 0; i < 16; i++) this.bursts.push({ alive: false, x: 0, y: 0, t: 0 });
    for (let i = 0; i < 16; i++) this.pops.push({ alive: false, x: 0, y: 0, t: 0, text: "" });
    for (let i = 0; i < 48; i++) this.enemies.push(this.blankEnemy());
  }

  private blankEnemy(): Enemy {
    return {
      alive: false,
      kind: "wasp",
      x: 0,
      y: 0,
      angle: 0,
      slotX: 0,
      slotY: 0,
      mode: "enter",
      t: 0,
      dur: 1.4,
      hp: 1,
      flash: 0,
      anim: 0,
      side: 1,
      shot: false,
      captured: false,
      delay: 0,
      sx: 0,
      sy: 0,
      path: null,
    };
  }

  private seedStars(): void {
    this.stars = [];
    for (let i = 0; i < 90; i++) {
      this.stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        s: Math.random() < 0.7 ? 1 : 1.6,
        sp: 12 + Math.random() * 70,
      });
    }
  }

  private take<T extends { alive: boolean }>(arr: T[]): T | null {
    for (const it of arr) if (!it.alive) return it;
    return null;
  }

  private spawnWave(): void {
    if (this.challenge) {
      this.spawnChallenge();
      return;
    }
    let delay = 0.35;
    const addRow = (kind: Kind, cols: number[], row: number, fromLeft: boolean) => {
      for (let i = 0; i < cols.length; i++) {
        this.spawnEnemy(kind, colX(cols[i]!), ROW_Y[row]!, delay + i * 0.1, fromLeft);
      }
      delay += cols.length * 0.1 + 0.38;
    };
    addRow("wasp", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4, true);
    addRow("wasp", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 3, false);
    addRow("moth", [1, 2, 3, 4, 5, 6, 7, 8], 2, true);
    addRow("moth", [1, 2, 3, 4, 5, 6, 7, 8], 1, false);
    addRow("commander", [3, 4, 5, 6], 0, true);
  }

  private spawnChallenge(): void {
    const groups = 5;
    for (let g = 0; g < groups; g++) {
      const fromLeft = g % 2 === 0;
      for (let i = 0; i < 8; i++) {
        const kind: Kind = g === 0 ? "commander" : g < 3 ? "moth" : "wasp";
        const e = this.spawnEnemy(kind, W / 2, 80, 0.4 + g * 1.15 + i * 0.12, fromLeft);
        if (!e) continue;
        e.mode = "flyby";
        e.dur = 3.4;
        e.path = null;
        e.sx = fromLeft ? -30 : W + 30;
        e.sy = 70 + (g % 3) * 70 + (i % 4) * 10;
        e.side = fromLeft ? 1 : -1;
        this.challengeSpawned++;
      }
    }
  }

  private spawnEnemy(kind: Kind, slotX: number, slotY: number, delay: number, fromLeft: boolean): Enemy | null {
    const e = this.take(this.enemies) ?? (() => {
      const n = this.blankEnemy();
      this.enemies.push(n);
      return n;
    })();
    const x0 = fromLeft ? -36 : W + 36;
    const y0 = 36 + (delay * 40) % 90;
    e.alive = true;
    e.kind = kind;
    e.x = x0;
    e.y = y0;
    e.slotX = slotX;
    e.slotY = slotY;
    e.mode = "enter";
    e.t = 0;
    e.dur = 1.35;
    e.hp = kind === "commander" ? 2 : 1;
    e.flash = 0;
    e.anim = Math.random();
    e.side = fromLeft ? 1 : -1;
    e.shot = false;
    e.captured = false;
    e.delay = delay;
    e.sx = x0;
    e.sy = y0;
    e.angle = 0;
    e.path = {
      x0,
      y0,
      x1: fromLeft ? 90 : W - 90,
      y1: 18,
      x2: W * 0.5 + (fromLeft ? 70 : -70),
      y2: 310,
      x3: W * 0.5,
      y3: 200,
    };
    return e;
  }

  private step(dt: number): void {
    sample();
    if (edges.mute) this.toggleMute();
    if (edges.pause && (this.screen === "playing" || this.screen === "paused" || this.screen === "stage")) {
      this.togglePause();
    }
    if (this.screen === "title" && edges.start) this.beginRun();
    if (this.screen === "over" && edges.start && this.overT <= 0) this.beginRun();

    for (const st of this.stars) {
      st.y += st.sp * dt * (this.screen === "title" ? 0.45 : 1);
      if (st.y > H) {
        st.y = 0;
        st.x = Math.random() * W;
      }
    }

    if (this.screen === "paused" || this.screen === "title") return;

    if (this.hitstop > 0) {
      this.hitstop -= dt;
      this.updateFx(dt);
      return;
    }

    if (this.screen === "stage") {
      this.stageT -= dt;
      if (this.stageT <= 0) {
        this.screen = "playing";
        this.syncHud();
      }
    }

    if (this.screen === "over") {
      this.overT -= dt;
      this.updateFx(dt);
      return;
    }

    this.formT += dt;
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateShots(dt);
    this.updateDrop(dt);
    this.collisions();
    this.updateDives();
    this.checkClear(dt);
    this.updateFx(dt);
    this.trauma = Math.max(0, this.trauma - dt * 2.4);
  }

  private updatePlayer(dt: number): void {
    this.player.anim += dt * 10;
    this.player.fireCd = Math.max(0, this.player.fireCd - dt);
    this.player.invuln = Math.max(0, this.player.invuln - dt);

    if (!this.player.alive) {
      this.respawnT -= dt;
      if (this.respawnT <= 0 && this.lives > 0) {
        this.player.alive = true;
        this.player.visible = true;
        this.player.x = W / 2;
        this.player.invuln = 2;
        this.dual = false;
        this.syncHud();
      } else if (this.respawnT <= 0 && this.lives <= 0) {
        this.gameOver();
      }
      return;
    }

    if (actions.targetX != null) {
      this.player.x += (actions.targetX - this.player.x) * (1 - Math.exp(-14 * dt));
    } else {
      this.player.x += actions.moveX * PLAYER_SPEED * dt;
    }
    this.player.x = clamp(this.player.x, 22, W - 22);

    const auto = actions.fire || actions.targetX != null;
    if (auto && this.player.fireCd <= 0) this.tryFire();
  }

  private tryFire(): void {
    let live = 0;
    for (const s of this.shots) if (s.alive && s.friendly) live++;
    const cap = this.dual ? MAX_DUAL_SHOTS : MAX_PLAYER_SHOTS;
    if (live >= cap) return;
    const xs = this.dual ? [this.player.x - 12, this.player.x + 12] : [this.player.x];
    for (const x of xs) {
      const s = this.take(this.shots);
      if (!s) continue;
      s.alive = true;
      s.x = x;
      s.y = PLAYER_Y - 18;
      s.vy = -SHOT_SPEED;
      s.friendly = true;
    }
    this.player.fireCd = 0.13;
    sfx.shoot();
  }

  private updateEnemies(dt: number): void {
    const formOff = Math.sin(this.formT * 0.7) * 26;
    let inForm = 0;
    let alive = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      alive++;
      e.anim += dt * (e.kind === "wasp" ? 12 : 8);
      e.flash = Math.max(0, e.flash - dt);
      if (e.delay > 0) {
        e.delay -= dt;
        continue;
      }

      if (e.mode === "enter" && e.path) {
        e.t += dt / e.dur;
        if (e.t < 1) {
          const p = bez(e.path, e.t);
          const dx = p.x - e.x;
          const dy = p.y - e.y;
          e.x = p.x;
          e.y = p.y;
          if (dx || dy) e.angle = Math.atan2(dx, dy);
        } else {
          const tx = e.slotX + formOff;
          const ty = e.slotY;
          const dx = tx - e.x;
          const dy = ty - e.y;
          const d = Math.hypot(dx, dy);
          if (d < 5) {
            e.mode = "form";
            e.angle = 0;
          } else {
            const sp = 200 * dt;
            e.x += (dx / d) * sp;
            e.y += (dy / d) * sp;
            e.angle = Math.atan2(dx, dy);
          }
        }
      } else if (e.mode === "form") {
        e.x = e.slotX + formOff;
        e.y = e.slotY;
        e.angle = 0;
        inForm++;
      } else if (e.mode === "dive") {
        e.t += dt;
        const t = e.t / e.dur;
        const sway = Math.sin(t * Math.PI * 2.4) * 88 * e.side;
        const px = this.player.alive ? this.player.x : W / 2;
        e.x = e.sx + sway + (px - e.sx) * t * 0.55;
        e.y = e.sy + t * (H + 70 - e.sy);
        e.angle = Math.atan2(Math.cos(t * Math.PI * 2.4) * 88 * e.side + (px - e.sx) * 0.55, H + 70 - e.sy);
        if (!e.shot && e.y > 210 && e.y < 430) this.enemyShoot(e);
        if (t >= 1) {
          e.mode = "return";
          e.t = 0;
          e.x = e.slotX + (Math.random() - 0.5) * 40;
          e.y = -28;
        }
      } else if (e.mode === "return") {
        const tx = e.slotX + formOff;
        const ty = e.slotY;
        const dx = tx - e.x;
        const dy = ty - e.y;
        const d = Math.hypot(dx, dy);
        if (d < 6) {
          e.mode = "form";
          e.angle = 0;
        } else {
          const sp = 220 * dt;
          e.x += (dx / d) * sp;
          e.y += (dy / d) * sp;
          e.angle = Math.atan2(dx, dy);
        }
      } else if (e.mode === "tractor") {
        const px = this.player.alive ? this.player.x : e.x;
        e.y += (292 - e.y) * (1 - Math.exp(-2.6 * dt));
        e.x += (px - e.x) * (1 - Math.exp(-1.4 * dt));
        e.angle = 0;
        e.t += dt;
        const inBeam =
          this.player.alive &&
          this.player.invuln <= 0 &&
          Math.abs(this.player.x - e.x) < 16 &&
          PLAYER_Y > e.y;
        this.captureProg = clamp(this.captureProg + (inBeam ? dt : -dt * 2), 0, 1.05);
        if (this.captureProg >= 1 && this.player.alive) this.capture(e);
        if (e.t > 3.4) {
          e.mode = "return";
          e.t = 0;
          this.captureProg = 0;
        }
      } else if (e.mode === "flyby") {
        e.t += dt;
        const t = e.t / e.dur;
        e.x = e.sx + e.side * (W + 80) * t;
        e.y = e.sy + Math.sin(t * Math.PI * 3 + e.anim) * 46;
        e.angle = Math.atan2(e.side * (W + 80), Math.cos(t * Math.PI * 3) * 46);
        if (t >= 1) e.alive = false;
      }
    }
    this.entering = alive > 0 && inForm < Math.max(1, alive * 0.55);
  }

  private enemyShoot(e: Enemy): void {
    e.shot = true;
    const n = e.kind === "commander" ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const s = this.take(this.shots);
      if (!s) continue;
      s.alive = true;
      s.x = e.x + (n === 2 ? (i === 0 ? -8 : 8) : 0);
      s.y = e.y + 12;
      s.vy = ENEMY_SHOT_SPEED + this.stage * 7;
      s.friendly = false;
    }
  }

  private updateDives(): void {
    if (this.screen !== "playing" && this.screen !== "stage") return;
    if (this.challenge) return;
    this.diveCd -= FIXED;
    if (this.diveCd > 0 || this.entering) return;
    let diving = 0;
    const formed: Enemy[] = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.mode === "dive" || e.mode === "tractor") diving++;
      if (e.mode === "form") formed.push(e);
    }
    if (formed.length === 0 || diving >= 6) return;
    const pick = formed[(Math.random() * formed.length) | 0]!;
    this.startDive(pick);
    if (pick.kind === "commander") {
      let escorts = 0;
      for (const m of formed) {
        if (m === pick || m.kind !== "moth") continue;
        if (Math.abs(m.slotX - pick.slotX) < 80 && escorts < 2) {
          this.startDive(m);
          escorts++;
        }
      }
      if (this.stage >= 1 && !this.dual && Math.random() < 0.28 && !this.anyTractor()) {
        pick.mode = "tractor";
        pick.t = 0;
        pick.dur = 3.4;
      }
    }
    const pace = Math.max(0.48, 1.55 - this.stage * 0.09);
    this.diveCd = pace * (formed.length < 10 ? 0.72 : 1);
  }

  private anyTractor(): boolean {
    return this.enemies.some((e) => e.alive && e.mode === "tractor");
  }

  private startDive(e: Enemy): void {
    e.mode = "dive";
    e.t = 0;
    e.dur = 2.35 + Math.random() * 0.55;
    e.side = Math.sign(e.x - W / 2) || (Math.random() < 0.5 ? -1 : 1);
    e.shot = false;
    e.sx = e.x;
    e.sy = e.y;
    sfx.dive();
  }

  private updateShots(dt: number): void {
    for (const s of this.shots) {
      if (!s.alive) continue;
      s.y += s.vy * dt;
      if (s.y < -20 || s.y > H + 20) s.alive = false;
    }
  }

  private updateDrop(dt: number): void {
    if (!this.drop.alive) return;
    this.drop.y += 95 * dt;
    if (this.player.alive && aabb(this.drop.x, this.drop.y, 22, 22, this.player.x, PLAYER_Y, 28, 24)) {
      this.drop.alive = false;
      this.dual = true;
      sfx.dual();
      this.pop(this.player.x, PLAYER_Y - 30, "DUAL");
      this.syncHud();
    } else if (this.drop.y > H + 20) {
      this.drop.alive = false;
    }
  }

  private collisions(): void {
    for (const s of this.shots) {
      if (!s.alive || !s.friendly) continue;
      for (const e of this.enemies) {
        if (!e.alive || e.delay > 0) continue;
        const r = e.kind === "commander" ? 18 : e.kind === "moth" ? 15 : 13;
        if (!aabb(s.x, s.y, 5, 12, e.x, e.y, r * 2, r * 2)) continue;
        s.alive = false;
        this.hurtEnemy(e);
        break;
      }
    }

    if (!this.player.alive || this.player.invuln > 0) return;

    const hitbox = this.dual ? 16 : 11;
    for (const s of this.shots) {
      if (!s.alive || s.friendly) continue;
      if (aabb(s.x, s.y, 6, 6, this.player.x, PLAYER_Y, hitbox, 12)) {
        s.alive = false;
        this.hitPlayer();
        return;
      }
    }
    for (const e of this.enemies) {
      if (!e.alive || e.delay > 0) continue;
      if (aabb(e.x, e.y, 16, 16, this.player.x, PLAYER_Y, hitbox, 14)) {
        this.hurtEnemy(e);
        this.hitPlayer();
        return;
      }
    }
  }

  private hurtEnemy(e: Enemy): void {
    e.hp -= 1;
    e.flash = 0.08;
    sfx.hit();
    this.burst(e.x, e.y, e.kind === "commander" ? "#7ee0c8" : e.kind === "moth" ? "#e07070" : "#e0b050", 7);
    if (e.hp > 0) return;
    const diving = e.mode === "dive" || e.mode === "tractor" || e.mode === "flyby";
    const pts = KIND_SCORE[e.kind][diving ? "dive" : "form"];
    this.addScore(pts);
    this.pop(e.x, e.y, String(pts));
    this.explode(e.x, e.y);
    if (e.captured) {
      this.drop.alive = true;
      this.drop.x = e.x;
      this.drop.y = e.y;
    }
    if (this.challenge) this.challengeKills++;
    e.alive = false;
    e.captured = false;
    this.hitstop = Math.min(0.05, this.hitstop + 0.02);
    this.trauma = Math.min(1, this.trauma + 0.22);
  }

  private hitPlayer(): void {
    if (this.dual) {
      this.dual = false;
      this.player.invuln = 1.6;
      this.explode(this.player.x, PLAYER_Y);
      this.trauma = Math.min(1, this.trauma + 0.45);
      sfx.explode();
      this.syncHud();
      return;
    }
    this.explode(this.player.x, PLAYER_Y);
    this.player.alive = false;
    this.player.visible = false;
    this.lives -= 1;
    this.respawnT = 1.5;
    this.trauma = 1;
    this.hitstop = 0.12;
    sfx.explode();
    this.syncHud();
  }

  private capture(e: Enemy): void {
    e.captured = true;
    e.mode = "return";
    e.t = 0;
    this.captureProg = 0;
    this.player.alive = false;
    this.player.visible = false;
    this.lives -= 1;
    this.respawnT = 1.6;
    this.trauma = 0.7;
    sfx.capture();
    this.syncHud();
  }

  private addScore(n: number): void {
    this.score += n;
    if (this.score > this.high) {
      this.high = this.score;
      writeSave({ high: this.high, muted: this.muted });
    }
    if (this.score >= this.nextLife) {
      this.lives += 1;
      this.nextLife += this.nextLife === 20000 ? 50000 : 50000;
      sfx.extra();
      this.pop(this.player.x, PLAYER_Y - 40, "1UP");
    }
    this.syncHud();
  }

  private checkClear(dt: number): void {
    if (this.screen !== "playing") return;
    let alive = 0;
    for (const e of this.enemies) if (e.alive) alive++;
    if (alive > 0) return;
    this.waveClearT += dt;
    const wait = this.challenge ? 1.1 : 0.85;
    if (this.waveClearT < wait) return;
    if (this.challenge && this.challengeKills >= this.challengeSpawned && this.challengeSpawned > 0) {
      this.addScore(10000);
      this.pop(W / 2, H * 0.4, "PERFECT 10000");
    }
    this.stage += 1;
    this.beginStage();
  }

  private gameOver(): void {
    this.screen = "over";
    this.overT = 0.6;
    writeSave({ high: this.high, muted: this.muted });
    sfx.over();
    this.syncHud();
  }

  private explode(x: number, y: number): void {
    const b = this.take(this.bursts);
    if (b) {
      b.alive = true;
      b.x = x;
      b.y = y;
      b.t = 0;
    }
    this.burst(x, y, "#ffe8a0", 16);
    this.burst(x, y, "#5ee0ff", 8);
  }

  private burst(x: number, y: number, color: string, n: number): void {
    for (let i = 0; i < n; i++) {
      const p = this.take(this.particles);
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 140;
      p.alive = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.life = 0.25 + Math.random() * 0.35;
      p.max = p.life;
      p.color = color;
      p.size = 1.4 + Math.random() * 2.2;
    }
  }

  private pop(x: number, y: number, text: string): void {
    const p = this.take(this.pops);
    if (!p) return;
    p.alive = true;
    p.x = x;
    p.y = y;
    p.t = 0;
    p.text = text;
  }

  private updateFx(dt: number): void {
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 40 * dt;
      if (p.life <= 0) p.alive = false;
    }
    for (const b of this.bursts) {
      if (!b.alive) continue;
      b.t += dt;
      if (b.t > 0.32) b.alive = false;
    }
    for (const p of this.pops) {
      if (!p.alive) continue;
      p.t += dt;
      p.y -= 28 * dt;
      if (p.t > 0.7) p.alive = false;
    }
  }

  private clearLive(): void {
    for (const e of this.enemies) e.alive = false;
    for (const s of this.shots) s.alive = false;
  }

  private syncHud(): void {
    patchHud({
      screen: this.screen,
      score: this.score,
      high: this.high,
      lives: Math.max(0, this.lives),
      stage: this.stage,
      dual: this.dual,
      muted: this.muted,
      challenge: this.challenge,
      message: this.challenge ? "CHALLENGE" : "",
    });
  }

  private resize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const aw = parent.clientWidth;
    const ah = parent.clientHeight;
    const scale = Math.min(aw / W, ah / H);
    const cssW = Math.max(1, W * scale);
    const cssH = Math.max(1, H * scale);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.ctx.setTransform(dpr * (cssW / W), 0, 0, dpr * (cssH / H), 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
  }

  private draw(): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#07080c";
    ctx.fillRect(0, 0, W, H);

    const shake = reduced ? 0 : this.trauma * this.trauma;
    const ox = shake ? (Math.random() * 2 - 1) * 7 * shake : 0;
    const oy = shake ? (Math.random() * 2 - 1) * 7 * shake : 0;
    ctx.save();
    ctx.translate(ox, oy);

    for (const st of this.stars) {
      const a = 0.25 + (st.sp / 90) * 0.55;
      ctx.fillStyle = `rgba(238,240,244,${a})`;
      ctx.fillRect(st.x, st.y, st.s, st.s);
    }

    ctx.strokeStyle = "rgba(238,240,244,0.06)";
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

    for (const e of this.enemies) {
      if (!e.alive || e.delay > 0) continue;
      if (e.mode === "tractor") this.drawBeam(e);
    }

    for (const s of this.shots) {
      if (!s.alive) continue;
      if (s.friendly) {
        if (this.atlas) drawSprite(ctx, this.atlas.pshot, (this.player.anim | 0) % 4, s.x, s.y, 12, 26);
        else {
          ctx.fillStyle = "#5ee0ff";
          ctx.fillRect(s.x - 1.5, s.y - 8, 3, 14);
        }
      } else if (this.atlas) {
        drawSprite(ctx, this.atlas.eshot, (this.formT * 8) % 4 | 0, s.x, s.y, 12, 12);
      } else {
        ctx.fillStyle = "#e07070";
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const e of this.enemies) {
      if (!e.alive || e.delay > 0) continue;
      this.drawEnemy(e);
      if (e.captured) this.drawCaptured(e);
    }

    if (this.drop.alive) this.drawPlayerShip(this.drop.x, this.drop.y, false, 0.9);

    if (this.player.visible && this.player.alive) {
      const blink = this.player.invuln > 0 ? Math.sin(this.player.invuln * 24) > 0 : true;
      if (blink) {
        if (this.dual) {
          this.drawPlayerShip(this.player.x - 12, PLAYER_Y, true, 1);
          this.drawPlayerShip(this.player.x + 12, PLAYER_Y, true, 1);
        } else {
          this.drawPlayerShip(this.player.x, PLAYER_Y, true, 1);
        }
      }
    }

    for (const b of this.bursts) {
      if (!b.alive) continue;
      const fi = Math.min(3, (b.t / 0.08) | 0);
      if (this.atlas) drawSprite(ctx, this.atlas.explode, fi, b.x, b.y, 42, 42);
    }

    for (const p of this.particles) {
      if (!p.alive) continue;
      ctx.globalAlpha = p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
      ctx.globalAlpha = 1;
    }

    ctx.font = "500 10px 'IBM Plex Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#eef0f4";
    for (const p of this.pops) {
      if (!p.alive) continue;
      ctx.globalAlpha = 1 - p.t / 0.7;
      ctx.fillText(p.text, p.x, p.y);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  private drawBeam(e: Enemy): void {
    const ctx = this.ctx;
    const pulse = 0.55 + Math.sin(this.formT * 10) * 0.2;
    const w = 10 + pulse * 8;
    const g = ctx.createLinearGradient(e.x, e.y + 10, e.x, H);
    g.addColorStop(0, "rgba(94,224,255,0.35)");
    g.addColorStop(1, "rgba(94,224,255,0.02)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(e.x - 6, e.y + 12);
    ctx.lineTo(e.x + 6, e.y + 12);
    ctx.lineTo(e.x + w, H);
    ctx.lineTo(e.x - w, H);
    ctx.closePath();
    ctx.fill();
    if (this.captureProg > 0) {
      ctx.fillStyle = `rgba(238,240,244,${0.12 + this.captureProg * 0.25})`;
      ctx.fillRect(e.x - 2, e.y + 12, 4, (PLAYER_Y - e.y) * this.captureProg);
    }
  }

  private drawEnemy(e: Enemy): void {
    const ctx = this.ctx;
    const size = e.kind === "commander" ? 36 : e.kind === "moth" ? 28 : 24;
    const sheet = this.atlas?.[e.kind];
    const frame = (e.anim | 0) % 4;
    if (sheet) {
      ctx.save();
      if (e.flash > 0) ctx.filter = "brightness(2.4)";
      drawSprite(ctx, sheet, frame, e.x, e.y, size, size, e.angle);
      ctx.restore();
    } else {
      ctx.fillStyle = e.kind === "commander" ? "#3cb8a8" : e.kind === "moth" ? "#d45454" : "#d4a017";
      ctx.fillRect(e.x - size / 2, e.y - size / 2, size, size);
    }
  }

  private drawCaptured(e: Enemy): void {
    this.drawPlayerShip(e.x, e.y + 22, false, 0.85);
  }

  private drawPlayerShip(x: number, y: number, engines: boolean, alpha: number): void {
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    if (this.atlas) {
      const fi = engines ? (this.player.anim | 0) % 4 : 0;
      drawSprite(ctx, this.atlas.player, fi, x, y, 26, 30);
    } else {
      ctx.fillStyle = "#eef0f4";
      ctx.beginPath();
      ctx.moveTo(x, y - 14);
      ctx.lineTo(x + 12, y + 12);
      ctx.lineTo(x - 12, y + 12);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private wireControlsTest(): void {
    window.__controlsTest = {
      getYaw: () => -this.player.x,
      getX: () => this.player.x,
      getSpeed: () => (this.screen === "playing" || this.screen === "stage" ? 1 : 0),
      setKeys: (codes: string[]) => {
        setInjectedKeys(codes);
        if (this.screen === "title") this.beginRun();
      },
    };
  }
}

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getX: () => number;
      getSpeed: () => number;
      setKeys: (codes: string[]) => void;
    };
  }
}
