import { DEFAULT_AUDIO, type AudioSettings } from '../audio/engine.ts';
import { STORAGE } from '../config.ts';
import { DEFAULT_BINDINGS, type Action, type Bindings } from './input.ts';
import type { KeyValueStorage } from './save.ts';

export interface Settings {
  audio: AudioSettings;
  bindings: Bindings;
}

export const defaultBindings = (): Bindings => structuredClone(DEFAULT_BINDINGS);

const volume = (value: unknown, fallback: number): number => (typeof value === 'number' && value >= 0 && value <= 1 ? value : fallback);

/**
 * Reads preferences; unknown or malformed entries fall back to defaults.
 * Old settings only had a "sound" switch that started off by default, so
 * they are read as audio on.
 */
export function loadSettings(storage: KeyValueStorage | null): Settings {
  const settings: Settings = { audio: { ...DEFAULT_AUDIO }, bindings: defaultBindings() };
  try {
    const raw = JSON.parse(storage?.getItem(STORAGE.settings) ?? 'null') as (Partial<Settings> & { sound?: boolean }) | null;
    if (raw?.audio) {
      settings.audio = {
        enabled: raw.audio.enabled !== false,
        music: volume(raw.audio.music, DEFAULT_AUDIO.music),
        sfx: volume(raw.audio.sfx, DEFAULT_AUDIO.sfx),
      };
    }
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
