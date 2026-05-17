import { describe, expect, it } from 'vitest';
import { MusicStyleRegistry } from '../data/musicStyles';
import { generateBass, generateMotif } from '../generation/motifGenerator';
import { chordToneDegrees } from '../generation/chordProgressions';
import { degreeToPitch } from '../generation/scales';
import type { GenerationRequest } from '../generation/types';

const request: GenerationRequest = {
  source: 'button',
  styleProfileId: 'afro-house',
  targetRole: 'lead',
  bpm: 121,
  key: 'C',
  scaleMode: 'dorian',
  bars: 8,
  outputMode: 'motif',
  density: 'medium',
  energy: 'medium'
};

describe('motif generation', () => {
  it('creates monophonic notes clamped to the requested length', () => {
    const style = new MusicStyleRegistry().getById(request.styleProfileId);
    const notes = generateMotif(request, style, [1, 6, 3, 7]);
    expect(notes.length).toBeGreaterThan(0);
    expect(Math.max(...notes.map((note) => note.startBeat + note.durationBeats))).toBeLessThanOrEqual(request.bars * 4);
    notes.slice(0, -1).forEach((note, index) => {
      expect(note.startBeat + note.durationBeats).toBeLessThanOrEqual(notes[index + 1].startBeat);
    });
  });

  it('keeps one bass note per bar for non-UK Garage profiles', () => {
    const notes = generateBass(
      {
        ...request,
        styleProfileId: 'afro-house',
        targetRole: 'bass',
        outputMode: 'motif_chords_bass'
      },
      [1, 4, 5, 4]
    );

    expect(notes).toHaveLength(request.bars);
    notes.forEach((note, bar) => {
      expect(note.startBeat).toBe(bar * 4);
    });
  });

  it('generates syncopated multi-note bass for UK Garage only', () => {
    const bars = 8;
    const notes = generateBass(
      {
        ...request,
        styleProfileId: 'uk-garage',
        targetRole: 'bass',
        outputMode: 'motif_chords_bass',
        bars
      },
      [1, 4, 5, 4]
    );

    for (let bar = 0; bar < bars; bar += 1) {
      const notesInBar = notes.filter((note) => note.startBeat >= bar * 4 && note.startBeat < bar * 4 + 4);
      expect(notesInBar.length).toBeGreaterThan(1);
    }
    expect(notes.some((note) => note.startBeat % 1 !== 0)).toBe(true);
  });

  it('adds quarter-note passing tones to Trap motifs', () => {
    const trapRequest: GenerationRequest = {
      ...request,
      styleProfileId: 'trap-hip-hop',
      bpm: 140,
      scaleMode: 'harmonic_minor',
      energy: 'medium'
    };
    const progression = [1, 7, 6, 7];
    const style = new MusicStyleRegistry().getById(trapRequest.styleProfileId);
    const notes = generateMotif(trapRequest, style, progression);
    const firstBarNotes = notes.filter((note) => note.startBeat >= 0 && note.startBeat < 4);
    const firstBarChordPitches = chordToneDegrees(progression, 0).map((degree) =>
      degreeToPitch(trapRequest.key, trapRequest.scaleMode, degree)
    );

    expect(firstBarNotes).toHaveLength(4);
    expect(firstBarNotes.map((note) => note.startBeat)).toEqual([0, 1, 2, 3]);
    expect(firstBarNotes.some((note) => !firstBarChordPitches.includes(note.pitch))).toBe(true);
  });
});
