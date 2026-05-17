import { describe, expect, it } from 'vitest';
import { findCompatibleNoteTrack } from '../app/trackRouting';
import type { SessionTrack } from '../core/types';

const tracks: SessionTrack[] = [
  { id: 'lead-1', name: 'Lead', role: 'lead', hasMidi: true, hasAudio: false, instrumentName: 'presets/lead-a', tags: ['noteTrack'] },
  { id: 'bass-1', name: 'Bass', role: 'bass', hasMidi: true, hasAudio: false, instrumentName: 'presets/bass-a', tags: ['noteTrack'] },
  { id: 'audio-1', name: 'Audio', role: 'other', hasMidi: false, hasAudio: true, tags: ['audioTrack'] }
];

describe('track routing', () => {
  it('prefers matching role and instrument slug', () => {
    expect(findCompatibleNoteTrack(tracks, 'bass', 'presets/bass-a')?.id).toBe('bass-1');
  });

  it('falls back to the requested role when the exact preset is unavailable', () => {
    expect(findCompatibleNoteTrack(tracks, 'lead', 'presets/lead-b')?.id).toBe('lead-1');
  });

  it('skips reserved and non-note tracks', () => {
    expect(findCompatibleNoteTrack(tracks, 'lead', undefined, new Set(['lead-1']))).toBeUndefined();
  });

  it('does not route bass MIDI onto another role even when that lane shares the preset id', () => {
    const mixed: SessionTrack[] = [
      {
        id: 'harm-1',
        name: 'Chords',
        role: 'harmony',
        hasMidi: true,
        hasAudio: false,
        instrumentName: 'presets/shared-preset',
        tags: ['noteTrack']
      },
      {
        id: 'lead-1',
        name: 'Lead',
        role: 'lead',
        hasMidi: true,
        hasAudio: false,
        instrumentName: 'presets/other',
        tags: ['noteTrack']
      }
    ];
    expect(findCompatibleNoteTrack(mixed, 'bass', 'presets/shared-preset')).toBeUndefined();
  });
});
