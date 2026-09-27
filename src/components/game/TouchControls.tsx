import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setTouch } from "@/game/input";
import type { ControlId, ControlLayout } from "@/game/save";
import { cn } from "@/lib/utils";

const IDS: ControlId[] = ["left", "fire", "right"];
const EDGE = 16;
const GAP = 12;
const HEIGHT = 56;
/** Keep controls out of the header strip, so they never cover the score, pause or mute buttons. */
const TOP_RESERVED = 76;
/** The corner grip pokes this far above a tile. */
const GRIP_TOP = 12;

/** Snap grid: 5 columns across (the defaults sit in 0, 2 and 4), rows stacked up from the bottom. */
const COLS = 5;
const ROW_STEP = HEIGHT + GAP;

const LABELS: Record<ControlId, string> = { left: "Move left", fire: "Fire", right: "Move right" };
const GRIP_LABELS: Record<ControlId, string> = {
  left: "Drag to reposition the left button",
  fire: "Drag to reposition the fire button",
  right: "Drag to reposition the right button",
};

type Slot = { col: number; row: number };

const DEFAULT_SLOTS: Record<ControlId, Slot> = {
  left: { col: 0, row: 0 },
  fire: { col: 2, row: 0 },
  right: { col: 4, row: 0 },
};

type Grid = { cw: number; rows: number; x: (col: number) => number; y: (row: number) => number };

/** Same footprint as the old three-column bar: equal widths across the screen, capped on wide phones. */
function makeGrid(w: number, h: number): Grid {
  const cw = Math.min(160, (w - EDGE * 2 - GAP * 2) / 3);
  const left = EDGE + cw / 2;
  const right = w - EDGE - cw / 2;
  const bottom = h - EDGE - HEIGHT / 2;
  const rows = Math.max(1, Math.floor((bottom - HEIGHT / 2 - TOP_RESERVED - GRIP_TOP) / ROW_STEP) + 1);
  return {
    cw,
    rows,
    x: (col) => left + (col * (right - left)) / (COLS - 1),
    y: (row) => bottom - row * ROW_STEP,
  };
}

const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

/** Rows never overlap; within a row, tiles one column apart would. */
function overlaps(a: Slot, b: Slot, g: Grid): boolean {
  return a.row === b.row && Math.abs(g.x(a.col) - g.x(b.col)) < g.cw + 4;
}

function nearestFree(px: number, py: number, taken: Slot[], g: Grid): Slot | null {
  let best: Slot | null = null;
  let bestD = Infinity;
  for (let row = 0; row < g.rows; row++) {
    for (let col = 0; col < COLS; col++) {
      const s = { col, row };
      if (taken.some((t) => overlaps(s, t, g))) continue;
      const d = Math.hypot(g.x(col) - px, g.y(row) - py);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
  }
  return best;
}

/**
 * Final slot for every control: saved slots clamped to the current grid (a
 * rotation can remove rows), with any collisions moved to the nearest free slot.
 */
function resolveSlots(layout: ControlLayout, g: Grid): Record<ControlId, Slot> {
  const out = {} as Record<ControlId, Slot>;
  const taken: Slot[] = [];
  for (const id of IDS) {
    const want = layout[id] ?? DEFAULT_SLOTS[id];
    let s = { col: clamp(want.col, 0, COLS - 1), row: clamp(want.row, 0, g.rows - 1) };
    if (taken.some((t) => overlaps(s, t, g))) s = nearestFree(g.x(s.col), g.y(s.row), taken, g) ?? s;
    out[id] = s;
    taken.push(s);
  }
  return out;
}

type Drag = { id: ControlId; pointerId: number; dx: number; dy: number; x: number; y: number; target: Slot | null };

/**
 * Floating ‹ / Fire / › touch buttons. Pressing a tile moves or fires; its
 * corner grip drags the tile, which snaps into the nearest free grid slot.
 */
export function TouchControls({
  layout,
  onLayoutChange,
}: {
  layout: ControlLayout;
  /** Called when a drag lands a tile in a new slot. */
  onLayoutChange: (next: ControlLayout) => void;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);

  useEffect(() => {
    const el = layerRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const grid = makeGrid(size.w, size.h);
  const slots = resolveSlots(layout, grid);

  const hold = (id: ControlId, down: boolean) => (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (down) e.currentTarget.setPointerCapture(e.pointerId);
    setTouch(id, down);
  };

  /** Where the dragged tile's centre is, and which free slot it would land in. */
  const track = (d: Drag, clientX: number, clientY: number): Drag => {
    const rect = layerRef.current!.getBoundingClientRect();
    const x = clamp(clientX - rect.left - d.dx, grid.cw / 2, size.w - grid.cw / 2);
    const y = clamp(clientY - rect.top - d.dy, TOP_RESERVED + GRIP_TOP + HEIGHT / 2, size.h - HEIGHT / 2);
    const others = IDS.filter((o) => o !== d.id).map((o) => slots[o]);
    return { ...d, x, y, target: nearestFree(x, y, others, grid) };
  };

  const grip = (id: ControlId) => ({
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = layerRef.current!.getBoundingClientRect();
      const s = slots[id];
      const cx = grid.x(s.col);
      const cy = grid.y(s.row);
      setDrag({ id, pointerId: e.pointerId, dx: e.clientX - rect.left - cx, dy: e.clientY - rect.top - cy, x: cx, y: cy, target: s });
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      if (!drag || drag.id !== id || drag.pointerId !== e.pointerId) return;
      setDrag(track(drag, e.clientX, e.clientY));
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
      if (!drag || drag.id !== id || drag.pointerId !== e.pointerId) return;
      const landed = track(drag, e.clientX, e.clientY).target;
      setDrag(null);
      // Save every tile's slot, so the layout stays exactly as seen now.
      if (landed) onLayoutChange({ ...slots, [id]: landed });
    },
    onPointerCancel: () => setDrag(null),
  });

  const content: Record<ControlId, ReactNode> = {
    left: <ChevronLeft className="size-6" />,
    fire: "Fire",
    right: <ChevronRight className="size-6" />,
  };

  return (
    <div
      ref={layerRef}
      className={cn(
        "touch-bar pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top)] bottom-[env(safe-area-inset-bottom)] md:hidden",
        // Title/pause cards sit above the tiles so a tile never covers Start or Resume;
        // while dragging, lift the tiles and guides above the cards so the drop is visible.
        drag ? "z-30" : "z-10",
      )}
    >
      {size.w > 0 && drag && (
        <>
          {/* Slot guides while dragging: a dot per slot, and an outline where the tile will land. */}
          {Array.from({ length: grid.rows * COLS }, (_, i) => (
            <span
              key={i}
              className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg/25"
              style={{ left: grid.x(i % COLS), top: grid.y(Math.floor(i / COLS)) }}
            />
          ))}
          {drag.target && (
            <span
              className="absolute rounded-[var(--radius-lg)] border-2 border-dashed border-cyan/70 bg-cyan/5"
              style={{
                left: grid.x(drag.target.col) - grid.cw / 2,
                top: grid.y(drag.target.row) - HEIGHT / 2,
                width: grid.cw,
                height: HEIGHT,
              }}
            />
          )}
        </>
      )}
      {size.w > 0 &&
        IDS.map((id) => {
          const active = drag?.id === id;
          const cx = active ? drag.x : grid.x(slots[id].col);
          const cy = active ? drag.y : grid.y(slots[id].row);
          return (
            <div
              key={id}
              className={cn(
                "absolute",
                // Dragged tile follows the finger exactly; the rest glide into their slots.
                active ? "z-10" : "transition-[left,top] duration-[var(--motion-quick)] ease-[var(--ease-out)]",
              )}
              style={{ left: cx - grid.cw / 2, top: cy - HEIGHT / 2, width: grid.cw, height: HEIGHT }}
            >
              <Button
                variant={id === "fire" ? "outline" : "subtle"}
                size="touch"
                aria-label={LABELS[id]}
                className={cn(
                  "pointer-events-auto size-full touch-none select-none",
                  id === "fire" && "bg-bg/60",
                  active && "ring-2 ring-cyan/80",
                )}
                onPointerDown={hold(id, true)}
                onPointerUp={hold(id, false)}
                onPointerCancel={hold(id, false)}
              >
                {content[id]}
              </Button>
              {/* Grip: a 36px touch target around a small visible handle on the tile's corner. */}
              <div
                role="button"
                aria-label={GRIP_LABELS[id]}
                className="pointer-events-auto absolute -top-3 -right-3 flex size-9 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
                {...grip(id)}
              >
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full border bg-surface text-muted",
                    active ? "border-cyan text-cyan" : "border-border",
                  )}
                >
                  <GripVertical className="size-3.5" />
                </span>
              </div>
            </div>
          );
        })}
    </div>
  );
}
