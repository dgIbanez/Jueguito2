import type { Game } from '../game/game.ts';
import { entitiesOf } from '../world/ldtk.ts';
import { esc } from './dom.ts';

/** The explored map, drawn straight from the rooms' world positions. */
export function mapHtml(game: Game): string {
  const visited = game.content.world.rooms.filter((r) => game.progress.visited.has(r.id) || r.id === game.room.id);
  // Frame only what was explored, so the chart grows with the journey.
  const pad = 120;
  let minX = Math.min(...visited.map((r) => r.x)) - pad;
  let minY = Math.min(...visited.map((r) => r.y)) - pad;
  let maxX = Math.max(...visited.map((r) => r.x + r.w)) + pad;
  let maxY = Math.max(...visited.map((r) => r.y + r.h)) + pad;
  const minW = 2600;
  const minH = 1300;
  if (maxX - minX < minW) [minX, maxX] = [(minX + maxX - minW) / 2, (minX + maxX + minW) / 2];
  if (maxY - minY < minH) [minY, maxY] = [(minY + maxY - minH) / 2, (minY + maxY + minH) / 2];
  const p = game.player;
  const body = visited
    .map((r) => {
      const current = r.id === game.room.id;
      const shrines = entitiesOf(r, 'Shrine')
        .map((s) => `<circle class="map-shrine" cx="${r.x + s.ax}" cy="${r.y + s.ay - 30}" r="22"/>`)
        .join('');
      const font = Math.min(64, (r.w / Math.max(6, r.name.length)) * 1.4);
      return `<g class="map-room${current ? ' current' : ''}" data-room="${esc(r.id)}"><rect x="${r.x + 8}" y="${r.y + 8}" width="${r.w - 16}" height="${r.h - 16}" rx="18"/>${shrines}<text x="${r.x + r.w / 2}" y="${r.y + r.h / 2}" font-size="${font.toFixed(0)}">${esc(r.name)}</text>${current ? `<text class="here" x="${r.x + r.w / 2}" y="${r.y + r.h / 2 + 80}" font-size="44">ESTÁS AQUÍ</text>` : ''}</g>`;
    })
    .join('');
  const dot = `<circle class="map-player" cx="${game.room.x + p.x + p.w / 2}" cy="${game.room.y + p.y + p.h / 2}" r="26"/>`;
  return `<div class="world-map"><small>CARTA DEL CAMINANTE</small><h2>El bosque olvidado</h2>
<div class="map-chart"><svg viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" role="img" aria-label="Mapa de las salas exploradas">${body}${dot}</svg></div>
<p>El camino se dibuja con tus pasos.</p><button id="back" class="primary">GUARDAR MAPA</button></div>`;
}
