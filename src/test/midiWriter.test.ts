import { describe, expect, it } from 'vitest';
import { Midi } from '@tonejs/midi';
import { writeMidi } from '../generation/midiWriter';
import type { GeneratedMidiTrack, GenerationRequest } from '../generation/types';

describe('midi writer', () => {
  it('exports a standard MIDI byte array', () => {
    const request: GenerationRequest = {
      source: 'button',
      styleProfileId: 'deep-house-groove',
      targetRole: 'lead',
      bpm: 122,
      key: 'C',
      scaleMode: 'minor',
      bars: 4,
      outputMode: 'motif'
    };
    const tracks: GeneratedMidiTrack[] = [
      { name: 'Lead', role: 'lead', channel: 1, notes: [{ pitch: 60, startBeat: 0, durationBeats: 1, velocity: 90 }] }
    ];
    const bytes = writeMidi(request, tracks);
    expect(bytes.length).toBeGreaterThan(16);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('MThd');
  });

  it('maps 1-based track channels to MIDI channel indices', () => {
    const request: GenerationRequest = {
      source: 'button',
      styleProfileId: 'afro-house',
      targetRole: 'full',
      bpm: 121,
      key: 'C',
      scaleMode: 'dorian',
      bars: 4,
      outputMode: 'motif_chords_bass_drums'
    };
    const tracks: GeneratedMidiTrack[] = [
      { name: 'Lead', role: 'lead', channel: 1, notes: [{ pitch: 60, startBeat: 0, durationBeats: 1, velocity: 90 }] },
      { name: 'Drums', role: 'drums', channel: 10, notes: [{ pitch: 36, startBeat: 0, durationBeats: 0.5, velocity: 100 }] }
    ];

    const bytes = writeMidi(request, tracks);
    const parsed = new Midi(bytes);

    expect(parsed.tracks[0]?.channel).toBe(0);
    expect(parsed.tracks[1]?.channel).toBe(9);
  });
});
