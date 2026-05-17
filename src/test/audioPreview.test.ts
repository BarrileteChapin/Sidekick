import { describe, expect, it } from 'vitest';
import { midiToFrequency } from '../nexus/audioPreview';

describe('audio preview helpers', () => {
  it('maps MIDI note 69 to concert A', () => {
    expect(midiToFrequency(69)).toBe(440);
  });
});
