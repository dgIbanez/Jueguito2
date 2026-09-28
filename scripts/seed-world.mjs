/**
 * One-shot seed for data/world.ldtk: migrates the six v1 rooms to the tile
 * grid and adds the new ability rooms. After seeding, edit the world in LDtk
 * (https://ldtk.io); this script refuses to overwrite unless run with --force.
 *
 *   npm run seed-world -- --force
 */
import { randomUUID } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';

const OUT = new URL('../data/world.ldtk', import.meta.url);
if (existsSync(OUT) && !process.argv.includes('--force')) {
  console.error('data/world.ldtk ya existe. Editalo con LDtk o usá --force para regenerarlo (se pierden los cambios).');
  process.exit(1);
}

const T = 24;
const APP_VERSION = '1.5.3';
let nextUid = 1;
const uid = () => nextUid++;

// ---------------------------------------------------------------- definitions

function fieldDef(identifier, { array = false, def = null } = {}) {
  return {
    identifier,
    doc: null,
    __type: array ? 'Array<String>' : 'String',
    uid: uid(),
    type: 'F_String',
    isArray: array,
    canBeNull: !array && def === null,
    arrayMinLength: null,
    arrayMaxLength: null,
    editorDisplayMode: 'ValueOnly',
    editorDisplayScale: 1,
    editorDisplayPos: 'Above',
    editorLinkStyle: 'StraightArrow',
    editorDisplayColor: null,
    editorAlwaysShow: false,
    editorShowInWorld: true,
    editorCutLongValues: true,
    editorTextSuffix: null,
    editorTextPrefix: null,
    useForSmartColor: false,
    exportToToc: false,
    searchable: false,
    min: null,
    max: null,
    regex: null,
    acceptFileTypes: null,
    defaultOverride: def === null ? null : { id: 'V_String', params: [def] },
    textLanguageMode: null,
    symmetricalRef: false,
    autoChainRef: true,
    allowOutOfLevelRef: true,
    allowedRefs: 'OnlySame',
    allowedRefsEntityUid: null,
    allowedRefTags: [],
    tilesetUid: null,
  };
}

function entityDef(identifier, color, width, height, fields = [], { resizable = false, maxCount = 0 } = {}) {
  return {
    identifier,
    uid: uid(),
    tags: [],
    exportToToc: false,
    allowOutOfBounds: false,
    doc: null,
    width,
    height,
    resizableX: resizable,
    resizableY: resizable,
    minWidth: null,
    maxWidth: null,
    minHeight: null,
    maxHeight: null,
    keepAspectRatio: false,
    tileOpacity: 1,
    fillOpacity: 0.25,
    lineOpacity: 1,
    hollow: false,
    color,
    renderMode: 'Rectangle',
    showName: true,
    tilesetId: null,
    tileRenderMode: 'FitInside',
    tileRect: null,
    uiTileRect: null,
    nineSliceBorders: [],
    maxCount,
    limitScope: maxCount ? 'PerWorld' : 'PerLevel',
    limitBehavior: 'MoveLastOne',
    pivotX: 0.5,
    pivotY: 1,
    fieldDefs: fields,
  };
}

function layerDef(identifier, type, extra = {}) {
  return {
    __type: type,
    identifier,
    type,
    uid: uid(),
    doc: null,
    uiColor: null,
    gridSize: T,
    guideGridWid: 0,
    guideGridHei: 0,
    displayOpacity: 1,
    inactiveOpacity: 0.6,
    hideInList: false,
    hideFieldsWhenInactive: true,
    canSelectWhenInactive: true,
    renderInWorldView: true,
    pxOffsetX: 0,
    pxOffsetY: 0,
    parallaxFactorX: 0,
    parallaxFactorY: 0,
    parallaxScaling: true,
    requiredTags: [],
    excludedTags: [],
    autoTilesKilledByOtherLayerUid: null,
    uiFilterTags: [],
    useAsyncRender: false,
    intGridValues: [],
    intGridValuesGroups: [],
    autoRuleGroups: [],
    autoSourceLayerDefUid: null,
    tilesetDefUid: null,
    tilePivotX: 0,
    tilePivotY: 0,
    biomeFieldUid: null,
    ...extra,
  };
}

const entitiesLayer = layerDef('Entities', 'Entities');
const collisionLayer = layerDef('Collision', 'IntGrid', {
  intGridValues: [
    { value: 1, identifier: 'solid', color: '#46553B', tile: null, groupUid: 0 },
    { value: 2, identifier: 'oneway', color: '#A7B86A', tile: null, groupUid: 0 },
    { value: 3, identifier: 'spikes', color: '#C4553F', tile: null, groupUid: 0 },
  ],
});

const entityDefs = Object.fromEntries(
  [
    entityDef('PlayerStart', '#E8D68A', 18, 32, [], { maxCount: 1 }),
    entityDef('Shrine', '#7FD1A1', 38, 48),
    entityDef('Item', '#E3D2A4', 30, 24, [fieldDef('item', { def: 'map' })]),
    entityDef('Ability', '#82B6A2', 28, 24, [fieldDef('ability', { def: 'dash' }), fieldDef('requires', { array: true })]),
    entityDef('Page', '#D4D2A0', 20, 28, [fieldDef('page', { def: 'page_' }), fieldDef('requires', { array: true })]),
    entityDef('Clue', '#B6C28A', 48, 56, [fieldDef('clue', { def: 'mural_' })]),
    entityDef('Enemy', '#BE4A2F', 24, 32, [fieldDef('kind', { def: 'goblin' })]),
    entityDef('Boss', '#C47459', 52, 72, [fieldDef('boss', { def: 'groth' }), fieldDef('trigger')]),
    entityDef('Gate', '#53623A', T, T * 10, [fieldDef('gateId', { def: 'gate' }), fieldDef('opensWith', { def: 'spell:ascua' })], { resizable: true }),
  ].map((d) => [d.identifier, d]),
);

const levelFieldDefs = {
  name: fieldDef('name', { def: 'Sala' }),
  biome: fieldDef('biome', { def: 'forest' }),
  requires: fieldDef('requires', { array: true }),
};

const fieldInstance = (def, value) => ({
  __identifier: def.identifier,
  __type: def.__type,
  __value: value,
  __tile: null,
  defUid: def.uid,
  realEditorValues: Array.isArray(value) ? value.map((v) => ({ id: 'V_String', params: [v] })) : value === null ? [] : [{ id: 'V_String', params: [value] }],
});

// ---------------------------------------------------------------- room DSL

const rooms = [];

function room(identifier, name, biome, tx, ty, cols, rows, requires = []) {
  const grid = new Array(cols * rows).fill(0);
  const set = (x, y, v) => {
    if (x >= 0 && y >= 0 && x < cols && y < rows) grid[y * cols + x] = v;
  };
  const r = {
    identifier, name, biome, tx, ty, cols, rows, requires, grid, entities: [],
    fill(x0, y0, x1, y1, v = 1) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, v);
      return r;
    },
    clear(x0, y0, x1, y1) { return r.fill(x0, y0, x1, y1, 0); },
    plat(x, y, len) { return r.fill(x, y, x + len - 1, y, 2); },
    spikes(x0, y0, x1, y1) { return r.fill(x0, y0, x1, y1, 3); },
    /** Ceiling, side walls and a three-row floor. */
    frame() {
      r.fill(0, 0, cols - 1, 0);
      r.fill(0, 0, 0, rows - 1);
      r.fill(cols - 1, 0, cols - 1, rows - 1);
      return r.fill(0, rows - 3, cols - 1, rows - 1);
    },
    /** Places an entity whose feet rest on the bottom of cell (cx, cy). */
    add(type, cx, cy, fields = {}) {
      const def = entityDefs[type];
      r.entities.push({ def, px: [cx * T + T / 2, (cy + 1) * T], width: def.width, height: def.height, fields });
      return r;
    },
    /** A one-tile-wide gate spanning rows y0..y1 in column cx. */
    gate(cx, y0, y1, fields) {
      const def = entityDefs.Gate;
      r.entities.push({ def, px: [cx * T + T / 2, (y1 + 1) * T], width: T, height: (y1 - y0 + 1) * T, fields });
      return r;
    },
  };
  rooms.push(r);
  return r;
}

// World layout in tiles. Rows 30..53 hold the canopy, 53..76 the forest floor.

room('Umbral', 'El umbral verde', 'forest', 0, 53, 40, 23)
  .frame()
  .clear(39, 15, 39, 19)
  .clear(33, 0, 36, 0)
  .plat(9, 17, 6).plat(17, 14, 6).plat(25, 11, 6).plat(33, 8, 4).plat(33, 5, 4).plat(33, 2, 4)
  .add('PlayerStart', 4, 19)
  .add('Shrine', 4, 19)
  .add('Item', 7, 19, { item: 'map' })
  .add('Enemy', 22, 19, { kind: 'goblin' });

room('Sendero', 'Sendero de los exiliados', 'forest', 40, 53, 60, 23)
  .frame()
  .clear(0, 15, 0, 19)
  .clear(59, 15, 59, 19)
  .clear(12, 0, 17, 0)
  .clear(40, 0, 45, 0)
  .plat(6, 16, 6).plat(14, 13, 6).plat(24, 10, 6).plat(33, 7, 5).plat(40, 4, 6)
  .add('Ability', 17, 12, { ability: 'dash', requires: [] })
  .add('Enemy', 20, 19, { kind: 'goblin' })
  .add('Enemy', 30, 19, { kind: 'hob' })
  .add('Enemy', 27, 9, { kind: 'archer' })
  .add('Enemy', 48, 19, { kind: 'goblin' });

room('Trono', 'El trono de espinas', 'boss', 100, 53, 40, 23)
  .frame()
  .clear(0, 15, 0, 19)
  .plat(8, 16, 6).plat(26, 16, 6)
  .gate(5, 1, 19, { gateId: 'thorns_throne', opensWith: 'spell:ascua' })
  .add('Boss', 30, 19, { boss: 'groth', trigger: 'gate:thorns_throne' });

room('Archivo', 'Archivo de las raíces', 'ruins', 0, 30, 40, 23)
  .frame()
  .clear(39, 17, 39, 19)
  .clear(33, 20, 36, 22)
  .plat(5, 17, 6).plat(13, 14, 7).plat(23, 17, 6)
  .add('Shrine', 3, 19)
  .add('Clue', 9, 19, { clue: 'mural_runa' })
  .add('Item', 16, 13, { item: 'grimoire' })
  .add('Enemy', 26, 16, { kind: 'goblin' });

room('Copa', 'La copa de los susurros', 'canopy', 40, 30, 60, 23)
  .frame()
  .clear(0, 17, 0, 19)
  .clear(59, 15, 59, 19)
  .clear(12, 20, 17, 22)
  .clear(40, 20, 45, 22)
  .fill(1, 1, 2, 16)
  .fill(8, 1, 8, 16)
  .clear(4, 0, 7, 0)
  .plat(20, 16, 5).plat(27, 12, 5).plat(41, 12, 5)
  .add('Page', 43, 11, { page: 'page_ascua', requires: ['ability:dash'] })
  .add('Enemy', 30, 19, { kind: 'goblin' })
  .add('Enemy', 29, 11, { kind: 'archer' })
  .add('Enemy', 52, 19, { kind: 'goblin' });

room('Vigilia', 'Vigilia del campamento', 'ruins', 100, 30, 40, 23)
  .frame()
  .clear(0, 15, 0, 19)
  .clear(39, 15, 39, 19)
  .plat(8, 16, 6).plat(18, 13, 6).plat(29, 16, 6)
  .add('Enemy', 13, 19, { kind: 'hob' })
  .add('Enemy', 26, 19, { kind: 'goblin' })
  .add('Enemy', 32, 19, { kind: 'hob' })
  .add('Enemy', 20, 12, { kind: 'archer' })
  .add('Shrine', 36, 19);

room('Pozo', 'Pozo de las garras', 'ruins', 140, 30, 16, 46)
  .frame()
  .clear(0, 15, 0, 19)
  .fill(1, 20, 9, 40)
  .add('Ability', 3, 42, { ability: 'wall_jump', requires: [] })
  .add('Clue', 12, 42, { clue: 'mural_guarda' });

room('Nido', 'Nido del cuervo', 'canopy', 40, 0, 40, 30, ['ability:wall_jump'])
  .frame()
  .clear(0, 12, 0, 15)
  .clear(4, 27, 7, 29)
  .fill(1, 1, 17, 11)
  .fill(1, 16, 1, 16)
  .spikes(1, 17, 1, 26)
  .plat(5, 23, 5)
  .spikes(22, 26, 26, 26)
  .fill(33, 6, 33, 22)
  .fill(19, 6, 32, 6)
  .add('Ability', 22, 5, { ability: 'double_jump', requires: [] })
  .add('Enemy', 12, 26, { kind: 'goblin' });

room('Galeria', 'Galería de los murales', 'ruins', 0, 7, 40, 23, ['ability:double_jump'])
  .frame()
  .clear(39, 5, 39, 8)
  .fill(28, 9, 38, 9)
  .plat(22, 14, 5).plat(12, 15, 6)
  .add('Shrine', 4, 19)
  .add('Clue', 9, 19, { clue: 'mural_espera' })
  .add('Page', 19, 19, { page: 'page_egida', requires: [] })
  .add('Enemy', 14, 14, { kind: 'archer' })
  .add('Enemy', 26, 19, { kind: 'hob' });

// ---------------------------------------------------------------- project

const levels = rooms.map((r) => {
  const levelUid = uid();
  const worldX = r.tx * T;
  const worldY = r.ty * T;
  const entityInstances = r.entities.map((e) => ({
    __identifier: e.def.identifier,
    __grid: [Math.floor(e.px[0] / T), Math.floor((e.px[1] - 1) / T)],
    __pivot: [0.5, 1],
    __tags: [],
    __tile: null,
    __smartColor: e.def.color,
    iid: randomUUID(),
    width: e.width,
    height: e.height,
    defUid: e.def.uid,
    px: e.px,
    fieldInstances: e.def.fieldDefs.map((f) => fieldInstance(f, e.fields[f.identifier] ?? (f.isArray ? [] : (f.defaultOverride?.params[0] ?? null)))),
    __worldX: worldX + e.px[0],
    __worldY: worldY + e.px[1],
  }));
  const layer = (def, extra) => ({
    __identifier: def.identifier,
    __type: def.type,
    __cWid: r.cols,
    __cHei: r.rows,
    __gridSize: T,
    __opacity: 1,
    __pxTotalOffsetX: 0,
    __pxTotalOffsetY: 0,
    __tilesetDefUid: null,
    __tilesetRelPath: null,
    iid: randomUUID(),
    levelId: levelUid,
    layerDefUid: def.uid,
    pxOffsetX: 0,
    pxOffsetY: 0,
    visible: true,
    optionalRules: [],
    intGridCsv: [],
    autoLayerTiles: [],
    seed: Math.floor(Math.random() * 9999999),
    overrideTilesetUid: null,
    gridTiles: [],
    entityInstances: [],
    ...extra,
  });
  return {
    identifier: r.identifier,
    iid: randomUUID(),
    uid: levelUid,
    worldX,
    worldY,
    worldDepth: 0,
    pxWid: r.cols * T,
    pxHei: r.rows * T,
    __bgColor: '#1B2F27',
    bgColor: null,
    useAutoIdentifier: false,
    bgRelPath: null,
    bgPos: null,
    bgPivotX: 0.5,
    bgPivotY: 0.5,
    __smartColor: '#8D9B90',
    __bgPos: null,
    externalRelPath: null,
    fieldInstances: [
      fieldInstance(levelFieldDefs.name, r.name),
      fieldInstance(levelFieldDefs.biome, r.biome),
      fieldInstance(levelFieldDefs.requires, r.requires),
    ],
    layerInstances: [layer(entitiesLayer, { entityInstances }), layer(collisionLayer, { intGridCsv: r.grid })],
    __neighbours: [],
  };
});

const project = {
  __header__: {
    fileType: 'LDtk Project JSON',
    app: 'LDtk',
    doc: 'https://ldtk.io/json',
    schema: 'https://ldtk.io/files/JSON_SCHEMA.json',
    appAuthor: 'Sebastien Benard',
    appVersion: APP_VERSION,
    url: 'https://ldtk.io',
  },
  iid: randomUUID(),
  jsonVersion: APP_VERSION,
  appBuildId: 473703,
  nextUid: nextUid + 1,
  identifierStyle: 'Capitalize',
  toc: [],
  worldLayout: 'Free',
  worldGridWidth: T * 40,
  worldGridHeight: T * 23,
  defaultLevelWidth: T * 40,
  defaultLevelHeight: T * 23,
  defaultPivotX: 0.5,
  defaultPivotY: 1,
  defaultGridSize: T,
  defaultEntityWidth: T,
  defaultEntityHeight: T,
  bgColor: '#0B1712',
  defaultLevelBgColor: '#1B2F27',
  minifyJson: false,
  externalLevels: false,
  exportTiled: false,
  simplifiedExport: false,
  imageExportMode: 'None',
  exportLevelBg: false,
  pngFilePattern: null,
  backupOnSave: false,
  backupLimit: 10,
  backupRelPath: null,
  levelNamePattern: 'Sala_%idx',
  tutorialDesc: null,
  customCommands: [],
  flags: [],
  defs: {
    layers: [entitiesLayer, collisionLayer],
    entities: Object.values(entityDefs),
    tilesets: [],
    enums: [],
    externalEnums: [],
    levelFields: Object.values(levelFieldDefs),
  },
  levels,
  worlds: [],
  dummyWorldIid: randomUUID(),
};

writeFileSync(OUT, JSON.stringify(project, null, '\t'));
console.log(`data/world.ldtk: ${levels.length} salas generadas.`);
