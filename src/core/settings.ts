import { STORAGE } from '../config.ts';
import { DEFAULT_BINDINGS, type Action, type Bindings } from './input.ts';
import type { KeyValueStorage } from './save.ts';

export interface Settings {
  sound: boolean;
  bindings: Bindings;
}

export const defaultBindings = (): Bindings => structuredClone(DEFAULT_BINDINGS);

/** Reads preferences; unknown or malformed entries fall back to defaults. */
export function loadSettings(storage: KeyValueStorage | null): Settings {
  const settings: Settings = { sound: false, bindings: defaultBindings() };
  try {
    const raw = JSON.parse(storage?.getItem(STORAGE.settings) ?? 'null') as Partial<Settings> | null;
    if (raw?.sound === true) settings.sound = true;
    for (const action of Object.keys(settings.bindings) as Action[]) {
      const keys = raw?.bindings?.[action];
      if (Array.isArray(keys) && keys.length && keys.every((k) => typeof k === 'string')) settings.bindings[action] = keys;
    }
  } catch {
    /* defaults */
  }
  return settings;
}

export function saveSettings(storage: KeyValueStorage | null, settings: Settings): void {
  try {
    storage?.setItem(STORAGE.settings, JSON.stringify(settings));
  } catch {
    /* preferences are optional */
  }
}
