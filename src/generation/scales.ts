import type { ScaleMode } from '../core/types';

const chromatic = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const intervals: Record<ScaleMode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11]
};

export function getScaleIntervals(mode: ScaleMode): number[] {
  return intervals[mode];
}

export function keyToMidiRoot(key: string, octave = 4): number {
  const normalized = key.replace('Db', 'C#').replace('Eb', 'D#').replace('Gb', 'F#').replace('Ab', 'G#').replace('Bb', 'A#');
  const index = chromatic.indexOf(normalized);
  return (octave + 1) * 12 + (index >= 0 ? index : 0);
}

export function degreeToPitch(key: string, mode: ScaleMode, degree: number, octaveOffset = 0): number {
  const scale = intervals[mode];
  const zeroBased = degree - 1;
  const octave = Math.floor(zeroBased / scale.length) + octaveOffset;
  const scaleDegree = ((zeroBased % scale.length) + scale.length) % scale.length;
  return keyToMidiRoot(key) + scale[scaleDegree] + octave * 12;
}

export function nearestScalePitch(key: string, mode: ScaleMode, targetPitch: number): number {
  const candidates = Array.from({ length: 35 }, (_, index) => degreeToPitch(key, mode, index - 10));
  return candidates.sort((left, right) => Math.abs(left - targetPitch) - Math.abs(right - targetPitch))[0];
}
