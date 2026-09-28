/**
 * Reads the subset of the LDtk project format the game uses.
 * Only the "__"-prefixed runtime fields are required, so hand edits and
 * editor saves remain compatible. https://ldtk.io/json
 */

export const Tile = { Empty: 0, Solid: 1, OneWay: 2, Spikes: 3 } as const;

export interface LdtkField {
  __identifier: string;
  __value: unknown;
}

export interface LdtkEntity {
  __identifier: string;
  __pivot: [number, number];
  iid: string;
  px: [number, number];
  width: number;
  height: number;
  fieldInstances: LdtkField[];
}

export interface LdtkLayer {
  __identifier: string;
  __type: string;
  __cWid: number;
  __cHei: number;
  __gridSize: number;
  intGridCsv: number[];
  entityInstances: LdtkEntity[];
}

export interface LdtkLevel {
  identifier: string;
  iid: string;
  worldX: number;
  worldY: number;
  pxWid: number;
  pxHei: number;
  fieldInstances: LdtkField[];
  layerInstances: LdtkLayer[] | null;
}

export interface LdtkProject {
  defaultGridSize: number;
  levels: LdtkLevel[];
}

export interface EntitySpawn {
  type: string;
  iid: string;
  /** Top-left corner, room-local pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Bottom-center anchor, where props stand. */
  ax: number;
  ay: number;
  fields: Record<string, unknown>;
}

export interface RoomData {
  id: string;
  name: string;
  biome: string;
  requires: string[];
  /** World position and size in pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  cols: number;
  rows: number;
  tile: number;
  grid: Uint8Array;
  entities: EntitySpawn[];
}

export interface WorldData {
  tile: number;
  rooms: RoomData[];
  byId: Map<string, RoomData>;
}

const fieldsOf = (fields: LdtkField[] | undefined): Record<string, unknown> =>
  Object.fromEntries((fields ?? []).map((f) => [f.__identifier, f.__value]));

const stringField = (fields: Record<string, unknown>, key: string, fallback = ''): string =>
  typeof fields[key] === 'string' ? (fields[key] as string) : fallback;

export const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.length > 0) : [];

export function parseWorld(project: LdtkProject): WorldData {
  const rooms = project.levels.map((level): RoomData => {
    const layers = level.layerInstances ?? [];
    const collision = layers.find((l) => l.__identifier === 'Collision');
    if (!collision) throw new Error(`La sala ${level.identifier} no tiene capa Collision`);
    const entities = layers.find((l) => l.__identifier === 'Entities')?.entityInstances ?? [];
    const fields = fieldsOf(level.fieldInstances);
    return {
      id: level.identifier,
      name: stringField(fields, 'name', level.identifier),
      biome: stringField(fields, 'biome', 'forest'),
      requires: stringList(fields.requires),
      x: level.worldX,
      y: level.worldY,
      w: level.pxWid,
      h: level.pxHei,
      cols: collision.__cWid,
      rows: collision.__cHei,
      tile: collision.__gridSize,
      grid: Uint8Array.from(collision.intGridCsv),
      entities: entities.map((e) => {
        const x = e.px[0] - e.__pivot[0] * e.width;
        const y = e.px[1] - e.__pivot[1] * e.height;
        return { type: e.__identifier, iid: e.iid, x, y, w: e.width, h: e.height, ax: x + e.width / 2, ay: y + e.height, fields: fieldsOf(e.fieldInstances) };
      }),
    };
  });
  return { tile: project.defaultGridSize, rooms, byId: new Map(rooms.map((r) => [r.id, r])) };
}

export function tileAt(room: RoomData, cx: number, cy: number): number {
  if (cx < 0 || cy < 0 || cx >= room.cols || cy >= room.rows) return Tile.Empty;
  return room.grid[cy * room.cols + cx];
}

/** Finds the room containing a world-space point. */
export function roomAt(world: WorldData, wx: number, wy: number): RoomData | undefined {
  return world.rooms.find((r) => wx >= r.x && wx < r.x + r.w && wy >= r.y && wy < r.y + r.h);
}

export const entitiesOf = (room: RoomData, type: string): EntitySpawn[] => room.entities.filter((e) => e.type === type);
