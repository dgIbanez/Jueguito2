import type { Content, PageDef } from '../content/types.ts';
import { BOSS_MOVES } from '../entities/boss.ts';
import { ALPHABET, decode, distinctGlyphs } from '../magic/ciphers.ts';
import { solutionHash } from '../magic/hash.ts';
import { entitiesOf, roomAt, stringList, Tile, tileAt, type EntitySpawn, type RoomData } from './ldtk.ts';

export interface ValidationReport {
  errors: string[];
  warnings: string[];
}

const text = (e: EntitySpawn, key: string): string => (typeof e.fields[key] === 'string' ? (e.fields[key] as string) : '');
const TOKEN_KINDS = new Set(['ability', 'spell', 'item', 'page', 'clue', 'gate', 'boss', 'flag']);

type Side = 'izquierda' | 'derecha' | 'arriba' | 'abajo';

/** Border cells of a room with the world point just beyond each one. */
function borderCells(r: RoomData): { side: Side; cx: number; cy: number; wx: number; wy: number }[] {
  const T = r.tile;
  const cells: { side: Side; cx: number; cy: number; wx: number; wy: number }[] = [];
  for (let cy = 0; cy < r.rows; cy++) {
    cells.push({ side: 'izquierda', cx: 0, cy, wx: r.x - 1, wy: r.y + cy * T + T / 2 });
    cells.push({ side: 'derecha', cx: r.cols - 1, cy, wx: r.x + r.w + 1, wy: r.y + cy * T + T / 2 });
  }
  for (let cx = 0; cx < r.cols; cx++) {
    cells.push({ side: 'arriba', cx, cy: 0, wx: r.x + cx * T + T / 2, wy: r.y - 1 });
    cells.push({ side: 'abajo', cx, cy: r.rows - 1, wx: r.x + cx * T + T / 2, wy: r.y + r.h + 1 });
  }
  return cells;
}

/** Whether the true solution of a page matches its stored hash. */
function pageSolutionCheck(page: PageDef, c: Content): boolean | null {
  const read = (key: Parameters<typeof decode>[2]) => solutionHash(page.id, decode(page.cipher, page.ciphertext, key, c.scripts)) === page.solutionHash;
  switch (page.cipher.type) {
    case 'caesar':
      return Array.from({ length: 26 }, (_, shift) => shift).some((shift) => read({ shift }));
    case 'atbash':
      return read({ mirror: true });
    case 'runes': {
      const script = [...(c.scripts[page.cipher.script] ?? '')];
      return read({ map: Object.fromEntries(script.map((g, i) => [g, ALPHABET[i]])) });
    }
    case 'vigenere': {
      const word = c.clues.find((cl) => cl.id === page.keyClue)?.word;
      return word ? read({ word }) : null;
    }
  }
}

export function validateWorld(c: Content): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { world } = c;
  const rooms = world.rooms;

  // Geometry --------------------------------------------------------------
  for (const r of rooms) {
    if (r.cols * r.tile !== r.w || r.rows * r.tile !== r.h) errors.push(`${r.id}: el tamaño no coincide con la grilla de ${r.tile}px.`);
    if (r.grid.length !== r.cols * r.rows) errors.push(`${r.id}: la capa Collision tiene ${r.grid.length} celdas, se esperaban ${r.cols * r.rows}.`);
  }
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) errors.push(`${a.id} y ${b.id} se superponen en el mundo.`);
    }
  const starts = rooms.flatMap((r) => entitiesOf(r, 'PlayerStart'));
  if (starts.length !== 1) errors.push(`Debe haber exactamente un PlayerStart; hay ${starts.length}.`);

  // References ------------------------------------------------------------
  const pageIds = new Set(c.pages.map((p) => p.id));
  const clueIds = new Set(c.clues.map((cl) => cl.id));
  const gateIds = new Set(rooms.flatMap((r) => entitiesOf(r, 'Gate').map((g) => text(g, 'gateId'))));
  const checkToken = (where: string, token: string) => {
    const [kind, id] = token.split(':');
    if (!TOKEN_KINDS.has(kind) || !id) errors.push(`${where}: requisito inválido "${token}" (formato tipo:id).`);
    else if (kind === 'ability' && !c.abilities[id]) errors.push(`${where}: habilidad desconocida "${id}".`);
    else if (kind === 'spell' && !c.spells[id]) errors.push(`${where}: hechizo desconocido "${id}".`);
    else if (kind === 'item' && !c.items[id]) errors.push(`${where}: objeto desconocido "${id}".`);
    else if (kind === 'page' && !pageIds.has(id)) errors.push(`${where}: página desconocida "${id}".`);
    else if (kind === 'clue' && !clueIds.has(id)) errors.push(`${where}: pista desconocida "${id}".`);
    else if (kind === 'gate' && !gateIds.has(id)) errors.push(`${where}: compuerta desconocida "${id}".`);
    else if (kind === 'boss' && !c.bosses[id]) errors.push(`${where}: jefe desconocido "${id}".`);
  };
  const refs: Record<string, [string, (id: string) => boolean]> = {
    Enemy: ['kind', (id) => !!c.enemies[id]],
    Item: ['item', (id) => !!c.items[id]],
    Ability: ['ability', (id) => !!c.abilities[id]],
    Page: ['page', (id) => pageIds.has(id)],
    Clue: ['clue', (id) => clueIds.has(id)],
    Boss: ['boss', (id) => !!c.bosses[id]],
  };
  for (const r of rooms) {
    for (const t of r.requires) checkToken(r.id, t);
    for (const e of r.entities) {
      const where = `${r.id}/${e.type}`;
      const ref = refs[e.type];
      if (ref && !ref[1](text(e, ref[0]))) errors.push(`${where}: "${text(e, ref[0])}" no existe en data/.`);
      for (const t of stringList(e.fields.requires)) checkToken(where, t);
      if (e.type === 'Gate') {
        if (!text(e, 'gateId')) errors.push(`${where}: la compuerta necesita gateId.`);
        checkToken(where, text(e, 'opensWith'));
      }
      if (e.type === 'Boss' && text(e, 'trigger')) checkToken(where, text(e, 'trigger'));
    }
  }
  for (const [id, boss] of Object.entries(c.bosses)) {
    if (!boss.phases?.length || boss.phases[0].at !== 1) errors.push(`Jefe ${id}: la primera fase debe tener "at": 1.`);
    boss.phases.forEach((phase, i) => {
      if (i > 0 && phase.at >= boss.phases[i - 1].at) errors.push(`Jefe ${id}: las fases deben ir de mayor a menor vida.`);
      for (const move of phase.pattern) {
        if (!boss.moves[move]) errors.push(`Jefe ${id}: el patrón usa "${move}" sin definirlo en moves.`);
        if (!BOSS_MOVES.has(move)) errors.push(`Jefe ${id}: el motor no conoce el movimiento "${move}".`);
      }
      for (const s of phase.transition?.summon ?? []) if (!c.enemies[s.kind]) errors.push(`Jefe ${id}: refuerzo desconocido "${s.kind}".`);
    });
    if (boss.reward && !c.items[boss.reward]) errors.push(`Jefe ${id}: recompensa desconocida "${boss.reward}".`);
    if (boss.arena) {
      const arena = world.byId.get(boss.arena.room);
      if (!arena) errors.push(`Jefe ${id}: la sala de su arena "${boss.arena.room}" no existe.`);
      else if (!entitiesOf(arena, 'Boss').some((b) => text(b, 'boss') === id)) errors.push(`Jefe ${id}: su arena "${arena.id}" no lo contiene.`);
    } else warnings.push(`Jefe ${id}: sin "arena", no aparece en el Panteón.`);
    const rig = c.rigs?.[boss.look];
    if (!rig) errors.push(`Jefe ${id}: no hay esqueleto "${boss.look}" en rigs.json.`);
    else if (!rig.clips.idle) errors.push(`Esqueleto ${boss.look}: falta la animación "idle".`);
    else
      for (const move of Object.keys(boss.moves))
        if (!rig.clips[`${move}_wind`] || !rig.clips[`${move}_strike`]) warnings.push(`Esqueleto ${boss.look}: "${move}" no tiene animaciones ${move}_wind/${move}_strike.`);
  }
  // Audio ------------------------------------------------------------------
  const tracks = c.music?.tracks ?? {};
  const needTrack = (where: string, name: string) => {
    if (!tracks[name]) errors.push(`${where}: la pista "${name}" no existe en music.json.`);
  };
  if (c.music) {
    needTrack('music.json (title)', c.music.title);
    for (const [biome, name] of Object.entries(c.music.biomes)) needTrack(`music.json (bioma ${biome})`, name);
    for (const r of rooms) if (!c.music.biomes[r.biome]) warnings.push(`${r.id}: el bioma "${r.biome}" no tiene música asignada.`);
    for (const [name, t] of Object.entries(tracks)) {
      if (!t.chords.length || t.chords.some((ch) => !ch.length)) errors.push(`Pista ${name}: cada compás necesita un acorde.`);
      for (const [layer, v] of Object.entries(t.layers))
        for (const key of ['pattern', 'kick', 'snare', 'hat'] as const) {
          const pattern = (v as Record<string, unknown>)[key];
          if (Array.isArray(pattern) && pattern.length !== 16) errors.push(`Pista ${name}: ${layer}.${key} debe tener 16 pasos.`);
        }
    }
  }
  for (const [id, boss] of Object.entries(c.bosses)) for (const name of boss.music ?? []) needTrack(`Jefe ${id}`, name);
  for (const [name, def] of Object.entries(c.sfx ?? {}))
    if (!def.layers?.length || def.layers.some((l) => !(l.dur > 0) || !(l.gain > 0))) errors.push(`Sonido ${name}: cada capa necesita "dur" y "gain" positivos.`);

  for (const id of Object.keys(c.gates ?? {})) if (!gateIds.has(id)) errors.push(`gates.json: "${id}" no corresponde a ninguna compuerta del mundo.`);
  for (const r of rooms)
    for (const g of entitiesOf(r, 'Gate')) {
      const id = text(g, 'gateId');
      if (!c.gates?.[id]) warnings.push(`${r.id}: la compuerta "${id}" no tiene textos en gates.json (el jugador no recibe pistas).`);
      else if (text(g, 'opensWith').startsWith('spell:') && !c.gates[id].recall) warnings.push(`gates.json: "${id}" se abre con una magia pero no tiene "recall".`);
    }
  for (const [look, rig] of Object.entries(c.rigs ?? {})) {
    const bones = new Set(rig.bones.map((b) => b.id));
    for (const bone of rig.bones) if (bone.parent && !bones.has(bone.parent)) errors.push(`Esqueleto ${look}: el hueso "${bone.id}" cuelga de "${bone.parent}", que no existe.`);
    for (const [name, clip] of Object.entries(rig.clips)) {
      if (!clip.keys?.length) errors.push(`Esqueleto ${look}: la animación "${name}" no tiene claves.`);
      for (const key of clip.keys ?? [])
        for (const channel of Object.keys(key.pose)) {
          const bone = channel.startsWith('hide_') ? channel.slice(5) : channel;
          if (!bones.has(bone) && !['rootX', 'rootY', 'rootRot', 'scaleX', 'scaleY', 'glow'].includes(channel)) errors.push(`Esqueleto ${look}: "${name}" anima "${channel}", que no es un hueso.`);
        }
    }
  }
  for (const [id, spell] of Object.entries(c.spells)) {
    if (!spell.levels?.length) errors.push(`Hechizo ${id}: necesita al menos un nivel.`);
    if ((spell.upgrade?.length ?? 0) > spell.levels.length - 1) errors.push(`Hechizo ${id}: hay más costos de mejora que niveles.`);
    for (const src of spell.fusion ?? []) if (!c.spells[src] || c.spells[src].fusion) errors.push(`Hechizo ${id}: la fusión usa "${src}", que no es un hechizo base.`);
    if (spell.fusion && !spell.fusion.some((src) => c.pages.some((p) => p.spell === src))) errors.push(`Hechizo ${id}: ninguna página enseña sus hechizos base.`);
  }
  for (const page of c.pages) {
    if (!c.spells[page.spell]) errors.push(`Página ${page.id}: hechizo desconocido "${page.spell}".`);
    if (c.spells[page.spell]?.fusion) errors.push(`Página ${page.id}: una página no puede enseñar una fusión ("${page.spell}").`);
    if (page.keyClue && !clueIds.has(page.keyClue)) errors.push(`Página ${page.id}: la pista clave "${page.keyClue}" no existe.`);
    if (page.cipher.type === 'vigenere' && !page.keyClue) warnings.push(`Página ${page.id}: Vigenère sin keyClue; la clave no aparece en el mundo.`);
    if (page.cipher.type === 'runes' && !c.scripts[page.cipher.script]) errors.push(`Página ${page.id}: escritura desconocida "${page.cipher.script}".`);
    const ok = pageSolutionCheck(page, c);
    if (ok === false) errors.push(`Página ${page.id}: ninguna clave produce la traducción registrada (solutionHash).`);
    if (ok === null) warnings.push(`Página ${page.id}: los cifrados ${page.cipher.type} no se verifican automáticamente.`);
  }
  for (const clue of c.clues) if (clue.script && !c.scripts[clue.script]) errors.push(`Pista ${clue.id}: escritura desconocida "${clue.script}".`);

  // Openings --------------------------------------------------------------
  const links = new Map<string, Set<string>>(rooms.map((r) => [r.id, new Set<string>()]));
  for (const r of rooms) {
    const loose = new Map<Side, number>();
    for (const cell of borderCells(r)) {
      if (tileAt(r, cell.cx, cell.cy) === Tile.Solid) continue;
      const other = roomAt(world, cell.wx, cell.wy);
      if (!other) {
        if (cell.side !== 'abajo') loose.set(cell.side, (loose.get(cell.side) ?? 0) + 1);
        continue;
      }
      const ocx = Math.floor((cell.wx - other.x) / other.tile);
      const ocy = Math.floor((cell.wy - other.y) / other.tile);
      if (tileAt(other, ocx, ocy) === Tile.Solid) errors.push(`${r.id}: la abertura ${cell.side} (celda ${cell.cx},${cell.cy}) choca contra una pared de ${other.id}.`);
      else links.get(r.id)!.add(other.id);
    }
    for (const [side, n] of loose) errors.push(`${r.id}: ${n} celda(s) abiertas en el borde ${side} no llevan a ninguna sala.`);
  }

  // Progression -----------------------------------------------------------
  const startRoom = rooms.find((r) => entitiesOf(r, 'PlayerStart').length);
  if (!startRoom) return { errors, warnings };
  const have = new Set<string>();
  const reached = new Set([startRoom.id]);
  const meets = (tokens: string[]) => tokens.every((t) => have.has(t));
  const collectable = ['Item', 'Ability', 'Page', 'Clue'];
  const tokenOf = (e: EntitySpawn): string | null => {
    if (e.type === 'Item') return `item:${text(e, 'item')}`;
    if (e.type === 'Ability') return `ability:${text(e, 'ability')}`;
    if (e.type === 'Page') return `page:${text(e, 'page')}`;
    if (e.type === 'Clue') return `clue:${text(e, 'clue')}`;
    return null;
  };
  const glyphsKnown = (script: string): Set<string> => {
    const glyphs = [...(c.scripts[script] ?? '')];
    const known = new Set<string>();
    for (const clue of c.clues) if (clue.script === script && have.has(`clue:${clue.id}`)) for (const ch of clue.word) known.add(glyphs[ch.charCodeAt(0) - 65]);
    return known;
  };
  const readable = (page: PageDef): boolean => {
    if (page.keyClue && !have.has(`clue:${page.keyClue}`)) return false;
    if (page.cipher.type !== 'runes') return true;
    const known = glyphsKnown(page.cipher.script);
    const unknown = distinctGlyphs(page.ciphertext, c.scripts[page.cipher.script] ?? '').filter((g) => !known.has(g));
    return unknown.length <= (page.maxUnknown ?? 2);
  };

  for (let changed = true; changed; ) {
    changed = false;
    const gain = (token: string) => {
      if (have.has(token)) return;
      have.add(token);
      changed = true;
    };
    for (const id of [...reached])
      for (const next of links.get(id) ?? [])
        if (!reached.has(next) && meets(world.byId.get(next)!.requires)) {
          reached.add(next);
          changed = true;
        }
    for (const id of reached) {
      const r = world.byId.get(id)!;
      for (const e of r.entities) {
        if (collectable.includes(e.type) && meets(stringList(e.fields.requires))) gain(tokenOf(e)!);
        if (e.type === 'Gate' && have.has(text(e, 'opensWith'))) gain(`gate:${text(e, 'gateId')}`);
        if (e.type === 'Boss' && meets(stringList(e.fields.requires)) && (!text(e, 'trigger') || have.has(text(e, 'trigger')))) {
          const boss = text(e, 'boss');
          gain(`boss:${boss}`);
          const reward = c.bosses[boss]?.reward;
          if (reward) gain(`item:${reward}`);
        }
      }
    }
    for (const page of c.pages) if (have.has(`page:${page.id}`) && have.has('item:grimoire') && readable(page)) gain(`spell:${page.spell}`);
  }

  for (const r of rooms) if (!reached.has(r.id)) errors.push(`${r.id}: la sala no se puede alcanzar desde el inicio con las mejoras disponibles.`);
  for (const r of rooms)
    for (const e of r.entities) {
      const token = tokenOf(e);
      if (token && reached.has(r.id) && !have.has(token)) errors.push(`${r.id}/${e.type}: "${token}" no se puede obtener (requisitos nunca cumplidos).`);
      if (e.type === 'Boss' && !have.has(`boss:${text(e, 'boss')}`)) errors.push(`${r.id}: el jefe ${text(e, 'boss')} nunca se activa.`);
    }
  for (const page of c.pages) if (!have.has(`spell:${page.spell}`)) errors.push(`Página ${page.id}: no se puede descifrar con las pistas alcanzables (máx. ${page.maxUnknown ?? 2} signos desconocidos).`);
  return { errors, warnings };
}
