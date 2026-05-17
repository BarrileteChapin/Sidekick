import type { SessionContext, TrackRole } from './types';

const keyOrder = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const enharmonicKeys: Record<string, string> = {
  Db: 'C#',
  Eb: 'D#',
  Gb: 'F#',
  Ab: 'G#',
  Bb: 'A#'
};

export function normalizeKey(key: string | null | undefined): string | null {
  if (!key) return null;
  const trimmed = key.trim();
  return enharmonicKeys[trimmed] ?? trimmed.toUpperCase().replace('B#', 'C').replace('E#', 'F');
}

export function areKeysCompatible(itemKey: string, sessionKey: string): boolean {
  const item = normalizeKey(itemKey);
  const session = normalizeKey(sessionKey);
  if (!item || !session) return true;
  if (item === session) return true;

  const itemIndex = keyOrder.indexOf(item);
  const sessionIndex = keyOrder.indexOf(session);
  if (itemIndex < 0 || sessionIndex < 0) return false;

  const distance = Math.abs(itemIndex - sessionIndex);
  return [5, 7].includes(Math.min(distance, 12 - distance));
}

export function scoreBpmFit(itemBpm: number | undefined, sessionBpm: number): number {
  if (!itemBpm) return 0.5;
  const delta = Math.abs(itemBpm - sessionBpm);
  if (delta === 0) return 1.4;
  if (delta <= 3) return 1.1;
  if (delta <= 6) return 0.75;
  if (delta <= 10) return 0.35;
  return 0;
}

export function scoreKeyFit(itemKey: string | undefined, sessionKey: string | null): number {
  if (!itemKey || !sessionKey) return 0.4;
  if (normalizeKey(itemKey) === normalizeKey(sessionKey)) return 1.25;
  return areKeysCompatible(itemKey, sessionKey) ? 0.8 : 0;
}

export function getMissingRoles(session: SessionContext): Set<TrackRole> {
  return new Set(
    Object.entries(session.completionState)
      .filter(([, present]) => !present)
      .map(([role]) => role as TrackRole)
  );
}
