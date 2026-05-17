import { describe, expect, it } from 'vitest';
import { findCompatibleNoteTrack, planDistributedMidiInsertion, selectDistributedTargetTrackIds } from '../app/trackRouting';
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

  it('reuses an unused existing lane before promising a new instrument track', () => {
    const preview = planDistributedMidiInsertion({
      generatedTracks: [
        { role: 'lead', name: 'Lead' },
        { role: 'bass', name: 'Bass' }
      ],
      noteTracks: [
        { id: 'lead-1', name: 'Lead', role: 'lead', hasMidi: true, hasAudio: false, tags: ['noteTrack'] },
        { id: 'other-1', name: 'Spare Lane', role: 'other', hasMidi: true, hasAudio: false, tags: ['noteTrack'] }
      ],
      instruments: { lead: 'presets/lead-a', bass: 'presets/bass-a' },
      canAutoCreateInstruments: true
    });

    expect(preview[0]?.summary).toContain('Use existing: Lead');
    expect(preview[1]?.summary).toContain('Use existing: Spare Lane');
  });

  it('prefers newly created tracks when auto-inserting multi-track chat output', () => {
    const targetTrackIds = selectDistributedTargetTrackIds({
      generatedTracks: [
        { role: 'bass', name: 'Bass' },
        { role: 'lead', name: 'Lead' }
      ],
      preferredTracks: [
        { id: 'created-lead', name: 'Created Lead', role: 'lead', hasMidi: true, hasAudio: false, tags: ['noteTrack'] },
        { id: 'created-bass', name: 'Created Bass', role: 'bass', hasMidi: true, hasAudio: false, tags: ['noteTrack'] }
      ],
      noteTracks: tracks,
      instruments: { lead: 'presets/lead-a', bass: 'presets/bass-a' }
    });

    expect(targetTrackIds).toEqual(['created-bass', 'created-lead']);
  });

  it('falls back to existing lanes when chat auto-insert creates only some targets', () => {
    const targetTrackIds = selectDistributedTargetTrackIds({
      generatedTracks: [
        { role: 'lead', name: 'Lead' },
        { role: 'bass', name: 'Bass' }
      ],
      preferredTracks: [
        { id: 'created-lead', name: 'Created Lead', role: 'lead', hasMidi: true, hasAudio: false, tags: ['noteTrack'] }
      ],
      noteTracks: tracks,
      instruments: { lead: 'presets/lead-a', bass: 'presets/bass-a' }
    });

    expect(targetTrackIds).toEqual(['created-lead', 'bass-1']);
  });
});
