import type { ItemFeatures, SessionContext, UserProfile } from '../../core/types';
import { areKeysCompatible, getMissingRoles, scoreBpmFit, scoreKeyFit } from '../../core/matching';
import rawItems from './mockLibrary.json';

export interface ScoredItem {
  item: ItemFeatures;
  score: number;
  reasons: string[];
}

export class LibraryIndex {
  constructor(private readonly items: ItemFeatures[] = loadMockLibrary()) {}

  getAll(): ItemFeatures[] {
    return [...this.items];
  }

  getSuggestions(session: SessionContext, profile: UserProfile | null, options?: { limit?: number; styleProfileId?: string }): ScoredItem[] {
    return getSuggestions(this.items, session, profile, options);
  }
}

export function loadMockLibrary(): ItemFeatures[] {
  return rawItems as ItemFeatures[];
}

export function getSuggestions(
  items: ItemFeatures[],
  session: SessionContext,
  profile: UserProfile | null,
  options: { limit?: number; styleProfileId?: string } = {}
): ScoredItem[] {
  const missingRoles = getMissingRoles(session);
  const styleProfileId = options.styleProfileId ?? session.styleProfileId;

  return items
    .filter((item) => isCompatible(item, session, styleProfileId))
    .map((item) => scoreItem(item, session, profile, missingRoles, styleProfileId))
    .sort((left, right) => right.score - left.score)
    .slice(0, options.limit ?? 5);
}

function isCompatible(item: ItemFeatures, session: SessionContext, styleProfileId?: string): boolean {
  const bpmCompatible = item.bpm === undefined || Math.abs(item.bpm - session.bpm) <= 10;
  const keyCompatible = !item.key || !session.key || areKeysCompatible(item.key, session.key);
  const styleCompatible = !styleProfileId || !item.styleProfileIds || item.styleProfileIds.includes(styleProfileId);
  return bpmCompatible && keyCompatible && styleCompatible;
}

function scoreItem(
  item: ItemFeatures,
  session: SessionContext,
  profile: UserProfile | null,
  missingRoles: Set<string>,
  styleProfileId?: string
): ScoredItem {
  const reasons: string[] = [];
  let score = item.popularity;

  const bpmFit = scoreBpmFit(item.bpm, session.bpm);
  score += bpmFit;
  if (bpmFit > 0.8) reasons.push('matches the current BPM');

  const keyFit = scoreKeyFit(item.key, session.key);
  score += keyFit;
  if (keyFit > 0.8) reasons.push('fits the current key');

  if (missingRoles.has(item.role)) {
    score += 2.5;
    reasons.push(`fills the missing ${item.role} role`);
  }

  if (styleProfileId && item.styleProfileIds?.includes(styleProfileId)) {
    score += 1.5;
    reasons.push('matches the selected reference style');
  }

  const roleBias = profile?.roleBias[item.role] ?? 0;
  score += roleBias;
  if (roleBias > 0.2) reasons.push('matches your past choices');

  const tagBias = item.tags.reduce((sum, tag) => sum + (profile?.tagBias[tag] ?? 0), 0);
  score += tagBias;
  if (tagBias > 0.2) reasons.push('uses tags you tend to keep');

  if (reasons.length === 0) {
    reasons.push('adds a compatible creative option');
  }

  return { item, score: Number(score.toFixed(3)), reasons };
}
