export type Ctx = CanvasRenderingContext2D;

export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

export function label(ctx: Ctx, text: string, x: number, y: number, color = '#d5d9af', size = 10, font = 'monospace'): void {
  ctx.fillStyle = color;
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = 'center';
  ctx.fillText(text, Math.round(x), Math.round(y));
}

/** Deterministic per-cell noise so tile decoration does not flicker. */
export const cellHash = (x: number, y: number): number => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

export const RUNE_FONT = '"Noto Sans Runic", "Segoe UI Historic", serif';
