import { describe, expect, it } from 'vitest';
import { applyFeedback } from '../core/profileStore';
import { createDefaultProfile, type ItemFeatures } from '../core/types';

const item: ItemFeatures = {
  id: 'bass-1',
  name: 'Bass',
  type: 'preset',
  role: 'bass',
  tags: ['sub', 'warm'],
  popularity: 0.8,
  styleProfileIds: ['deep-house-groove']
};

describe('profile feedback', () => {
  it('increases role and tag weights for accepted items', () => {
    const profile = applyFeedback(createDefaultProfile(), { itemId: item.id, type: 'accepted', timestamp: 1 }, item);
    expect(profile.roleBias.bass).toBeGreaterThan(0);
    expect(profile.tagBias.sub).toBeGreaterThan(0);
  });

  it('keeps rejected weights bounded', () => {
    let profile = createDefaultProfile();
    for (let index = 0; index < 20; index += 1) {
      profile = applyFeedback(profile, { itemId: item.id, type: 'rejected', timestamp: index }, item);
    }
    expect(profile.roleBias.bass).toBe(-1);
  });
});
