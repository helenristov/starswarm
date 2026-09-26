export type Sheet = HTMLImageElement[];

const cache = new Map<string, Sheet>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

export async function loadSheet(name: string): Promise<Sheet> {
  const hit = cache.get(name);
  if (hit) return hit;
  const frames = await Promise.all(
    [1, 2, 3, 4].map((i) => loadImage(`/sprites/${name}-${i}.png`)),
  );
  cache.set(name, frames);
  return frames;
}

export type Atlas = {
  player: Sheet;
  wasp: Sheet;
  moth: Sheet;
  commander: Sheet;
  pshot: Sheet;
  eshot: Sheet;
  explode: Sheet;
};

export async function loadAtlas(): Promise<Atlas> {
  const [player, wasp, moth, commander, pshot, eshot, explode] = await Promise.all([
    loadSheet("player"),
    loadSheet("wasp"),
    loadSheet("moth"),
    loadSheet("commander"),
    loadSheet("pshot"),
    loadSheet("eshot"),
    loadSheet("explode"),
  ]);
  return { player, wasp, moth, commander, pshot, eshot, explode };
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  frames: Sheet,
  index: number,
  x: number,
  y: number,
  w: number,
  h: number,
  angle = 0,
  flash = 0,
): void {
  const img = frames[index % frames.length];
  if (!img) return;
  ctx.save();
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  if (flash > 0) ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}
