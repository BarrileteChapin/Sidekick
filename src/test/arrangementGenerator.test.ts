import { describe, expect, it } from 'vitest';
import { MusicStyleRegistry } from '../data/musicStyles';
import { generateArrangementTracks } from '../generation/arrangementGenerator';
import type { GenerationRequest } from '../generation/types';

const baseRequest: GenerationRequest = {
  source: 'button',
  styleProfileId: 'afro-house',
  targetRole: 'lead',
  bpm: 121,
  key: 'C',
  scaleMode: 'dorian',
  bars: 8,
  outputMode: 'motif'
};

describe('arrangement generation', () => {
  it('generates all advertised core parts for motif + chords + bass mode', () => {
    const style = new MusicStyleRegistry().getById(baseRequest.styleProfileId);
    const tracks = generateArrangementTracks(
      { ...baseRequest, outputMode: 'motif_chords_bass' },
      style
    );

    expect(tracks.map((track) => track.role)).toEqual(['lead', 'bass', 'harmony']);
    tracks.forEach((track) => expect(track.notes.length).toBeGreaterThan(0));
  });

  it('includes drums for the drums arrangement mode', () => {
    const style = new MusicStyleRegistry().getById(baseRequest.styleProfileId);
    const tracks = generateArrangementTracks(
      { ...baseRequest, outputMode: 'motif_chords_bass_drums' },
      style
    );

    expect(tracks.map((track) => track.role)).toEqual(['lead', 'bass', 'harmony', 'drums']);
    expect(tracks.find((track) => track.role === 'drums')?.channel).toBe(10);
  });
});
