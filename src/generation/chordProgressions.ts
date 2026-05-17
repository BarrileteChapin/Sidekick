import type { MusicStyleProfile } from '../data/musicStyles';
import type { MidiNoteEvent } from './types';
import { degreeToPitch } from './scales';

const triadDegrees = [1, 3, 5];

export function selectProgression(style: MusicStyleProfile): number[] {
  return style.chordProgressions[0] ?? [1, 5, 6, 4];
}

export function chordPitchesForDegree(key: string, mode: Parameters<typeof degreeToPitch>[1], degree: number, octaveOffset = -1): number[] {
  return triadDegrees.map((offset) => degreeToPitch(key, mode, degree + offset - 1, octaveOffset));
}

export function generateChordTrack(input: {
  key: string;
  mode: Parameters<typeof degreeToPitch>[1];
  progression: number[];
  bars: number;
  velocity?: number;
}): MidiNoteEvent[] {
  const notes: MidiNoteEvent[] = [];
  for (let bar = 0; bar < input.bars; bar += 1) {
    const degree = input.progression[bar % input.progression.length];
    chordPitchesForDegree(input.key, input.mode, degree, -1).forEach((pitch) => {
      notes.push({
        pitch,
        startBeat: bar * 4,
        durationBeats: 3.8,
        velocity: input.velocity ?? 72
      });
    });
  }
  return notes;
}

export function chordToneDegrees(progression: number[], bar: number): number[] {
  const root = progression[bar % progression.length];
  return [root, root + 2, root + 4];
}
