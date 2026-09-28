export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const overlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const centerX = (r: Rect): number => r.x + r.w / 2;
export const centerY = (r: Rect): number => r.y + r.h / 2;
