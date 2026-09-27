import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/game/Logo";
import { TouchControls } from "@/components/game/TouchControls";
import { Game } from "@/game/game";
import { getHud, subscribeHud } from "@/game/hud";
import { unlockAudio } from "@/game/audio";
import { loadSave, writeSave, type ControlLayout } from "@/game/save";

export function StarSwarm() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const hud = useSyncExternalStore(subscribeHud, getHud, getHud);
  const [controls, setControls] = useState<ControlLayout>({});

  // Saved layout is read after mount: localStorage isn't available during SSR.
  useEffect(() => setControls(loadSave().controls), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas);
    gameRef.current = game;
    void game.start();
    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, []);

  const start = () => {
    unlockAudio();
    gameRef.current?.beginRun();
  };

  const saveControls = (next: ControlLayout) => {
    setControls(next);
    writeSave({ controls: next });
  };

  // Only offered once a tile has been moved, and only where the touch controls show.
  const resetLink = Object.keys(controls).length > 0 && (
    <button
      type="button"
      className="touch-bar text-xs text-subtle underline underline-offset-4 md:hidden"
      onClick={() => saveControls({})}
    >
      Reset controls
    </button>
  );

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="grid grid-cols-3 items-center gap-2 px-4 py-3 shrink-0">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted">1UP</p>
          <p className="hud-num text-sm text-cyan">{String(hud.score).padStart(6, "0")}</p>
        </div>
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-muted">High</p>
          <p className="hud-num text-sm text-fg">{String(hud.high).padStart(6, "0")}</p>
        </div>
        <div className="flex items-center justify-end gap-2">
          <div className="text-right mr-1">
            <p className="text-xs uppercase tracking-widest text-muted">
              {hud.challenge ? "Challenge" : `Stage ${hud.stage}`}
            </p>
            <div className="flex items-center justify-end gap-1">
              <img
                src="/sprites/player-1.png"
                alt=""
                className="h-5 w-5 object-contain"
                crossOrigin="anonymous"
              />
              <p className="hud-num text-sm text-fg">{hud.lives}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-10"
            aria-label={hud.muted ? "Unmute" : "Mute"}
            onClick={() => gameRef.current?.toggleMute()}
          >
            {hud.muted ? <VolumeX /> : <Volume2 />}
          </Button>
          {(hud.screen === "playing" || hud.screen === "paused" || hud.screen === "stage") && (
            <Button
              variant="ghost"
              size="icon"
              className="size-10"
              aria-label={hud.screen === "paused" ? "Resume" : "Pause"}
              onClick={() => gameRef.current?.togglePause()}
            >
              {hud.screen === "paused" ? <Play /> : <Pause />}
            </Button>
          )}
        </div>
      </header>

      <div className="relative mx-auto flex min-h-0 w-full max-w-[520px] flex-1 items-center justify-center px-3">
        <canvas
          ref={canvasRef}
          className="max-h-full touch-none select-none rounded-[var(--radius-lg)] border border-border bg-bg"
          style={{ touchAction: "none" }}
        />

        {hud.screen === "title" && (
          <Overlay>
            <h1 className="-mx-4 -mb-2 w-[calc(100%+2rem)]">
              <Logo className="block h-auto w-full" />
            </h1>
            <p className="max-w-[28ch] text-sm leading-relaxed text-muted">
              Break the formation. Dodge the dives. Steal your fighter back from the flagship beam.
            </p>
            <Button size="lg" onClick={start}>
              Start
            </Button>
            <p className="text-xs text-subtle">A / D or arrows to move · Space to fire</p>
            {resetLink}
          </Overlay>
        )}

        {hud.screen === "stage" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="overlay-enter text-center">
              <p className="font-display text-3xl font-semibold tracking-tight">
                {hud.challenge ? "Challenge" : `Stage ${hud.stage}`}
              </p>
              <p className="mt-2 text-xs uppercase tracking-widest text-muted">Get ready</p>
            </div>
          </div>
        )}

        {hud.screen === "paused" && (
          <Overlay>
            <h2 className="font-display text-3xl font-semibold">Paused</h2>
            <Button size="lg" onClick={() => gameRef.current?.togglePause()}>
              Resume
            </Button>
            {resetLink}
          </Overlay>
        )}

        {hud.screen === "over" && (
          <Overlay>
            <p className="text-xs uppercase tracking-widest text-muted">Destroyed</p>
            <h2 className="font-display text-3xl font-semibold">Game over</h2>
            <p className="hud-num text-lg text-cyan">{String(hud.score).padStart(6, "0")}</p>
            <Button size="lg" onClick={start}>
              Play again
            </Button>
          </Overlay>
        )}
      </div>

      {/* Reserves the strip the touch controls sit in by default; the controls float above it. */}
      <div className="touch-bar h-20 shrink-0 md:hidden" aria-hidden />

      <TouchControls layout={controls} onLayoutChange={saveControls} />
    </div>
  );
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/70 px-6">
      <div className="overlay-enter flex w-full max-w-sm flex-col items-center gap-5 rounded-[var(--radius-xl)] border border-border bg-surface p-8 text-center">
        {children}
      </div>
    </div>
  );
}
