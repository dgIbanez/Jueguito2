import { STORAGE } from '../config.ts';
import type { KeyValueStorage } from './save.ts';

/** Best Pantheon times in seconds, kept apart from the journey's save. */
export interface Records {
  duel: Record<string, number>;
  rush: number | null;
}

export function loadRecords(storage: KeyValueStorage | null): Records {
  const records: Records = { duel: {}, rush: null };
  try {
    const raw = JSON.parse(storage?.getItem(STORAGE.records) ?? 'null') as Partial<Records> | null;
    for (const [id, t] of Object.entries(raw?.duel ?? {})) if (typeof t === 'number' && t > 0) records.duel[id] = t;
    if (typeof raw?.rush === 'number' && raw.rush > 0) records.rush = raw.rush;
  } catch {
    /* no records yet */
  }
  return records;
}

/** Stores the time if it beats the previous best; returns whether it did. */
export function recordTime(storage: KeyValueStorage | null, kind: 'duel' | 'rush', id: string, time: number): boolean {
  const records = loadRecords(storage);
  const best = kind === 'rush' ? records.rush : records.duel[id];
  if (best !== null && best !== undefined && best <= time) return false;
  if (kind === 'rush') records.rush = time;
  else records.duel[id] = time;
  try {
    storage?.setItem(STORAGE.records, JSON.stringify(records));
  } catch {
    /* records are optional */
  }
  return true;
}

/** 83.4 → "1:23.4" */
export function formatTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
