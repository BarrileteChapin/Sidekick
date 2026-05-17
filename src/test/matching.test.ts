import { describe, expect, it } from 'vitest';
import { getSuggestions, loadMockLibrary } from '../data/library/libraryIndex';
import { mockSessions } from '../nexus/MockNexusClient';
import { areKeysCompatible, scoreBpmFit } from '../core/matching';

describe('matching and suggestions', () => {
  it('scores close BPM matches higher than distant matches', () => {
    expect(scoreBpmFit(122, 122)).toBeGreaterThan(scoreBpmFit(132, 122));
  });

  it('treats fifth-related keys as compatible', () => {
    expect(areKeysCompatible('A', 'D')).toBe(true);
    expect(areKeysCompatible('A', 'C#')).toBe(false);
  });

  it('boosts items that fill missing roles', () => {
    const suggestions = getSuggestions(loadMockLibrary(), mockSessions.DeepHouseSketch, null, { styleProfileId: 'deep-house-groove' });
    expect(suggestions[0].item.role).toBe('bass');
    expect(suggestions[0].reasons.join(' ')).toContain('missing bass');
  });
});
