/** Fixed canvas resolution; the stage scales to the window keeping 16:9. */
export const VIEW_W = 960;
export const VIEW_H = 540;
export const STEP = 1 / 60;

/** Movement tuning. Heights: a jump rises ~119px, a double jump adds ~92px. */
export const PHYS = {
  gravity: 1050,
  maxFall: 760,
  run: 190,
  jump: 500,
  jumpCut: 0.45,
  doubleJump: 440,
  coyote: 0.1,
  buffer: 0.12,
  dashTime: 0.18,
  dashSpeed: 560,
  dashCool: 0.6,
  wallSlide: 110,
  wallJumpY: 470,
  wallJumpX: 260,
  wallLock: 0.14,
  wallCoyote: 0.1,
  pogo: 430,
  upBoost: 600,
  dropThrough: 0.25,
} as const;

export const PLAYER = {
  w: 18,
  h: 32,
  maxHp: 5,
  maxMana: 3,
  invuln: 1.25,
  attackTime: 0.2,
  attackCool: 0.36,
  magicCool: 0.45,
  interactRange: 65,
} as const;

export const STORAGE = {
  save: 'runas-rotas-save',
  legacySave: 'runas-rotas-v1',
  settings: 'runas-rotas-settings',
  records: 'runas-rotas-panteon',
} as const;
