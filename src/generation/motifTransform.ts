import type { MusicStyleProfile } from '../data/musicStyles';
import type { MidiNoteEvent } from './types';
import { nearestScalePitch } from './scales';

export function transformMotif(
  motif: MidiNoteEvent[],
  style: MusicStyleProfile,
  key: string,
  mode: Parameters<typeof nearestScalePitch>[1],
  random: () => number
): MidiNoteEvent[] {
  const weights = style.motif.transformationWeights;
  const roll = random();
  if (roll < weights.transpose) {
    return motif.map((note) => ({ ...note, pitch: nearestScalePitch(key, mode, note.pitch + (random() > 0.5 ? 2 : -2)) }));
  }
  if (roll < weights.transpose + weights.rhythmNudge) {
    return motif.map((note, index) => ({
      ...note,
      startBeat: Math.max(0, note.startBeat + (index % 2 === 0 ? 0.25 : -0.25))
    }));
  }
  return motif.flatMap((note, index) => {
    if (index % 3 !== 0) return [{ ...note }];
    return [
      { ...note, durationBeats: Math.max(0.25, note.durationBeats * 0.65) },
      {
        ...note,
        pitch: nearestScalePitch(key, mode, note.pitch + 2),
        startBeat: note.startBeat + note.durationBeats * 0.65,
        durationBeats: Math.max(0.25, note.durationBeats * 0.35),
        velocity: Math.max(45, note.velocity - 8)
      }
    ];
  });
}

export function cleanupMonophonic(notes: MidiNoteEvent[], maxBeat: number): MidiNoteEvent[] {
  return [...notes]
    .sort((left, right) => left.startBeat - right.startBeat)
    .map((note, index, sorted) => {
      const startBeat = Math.max(0, Math.min(note.startBeat, maxBeat));
      const nextStart = Math.min(sorted[index + 1]?.startBeat ?? maxBeat, maxBeat);
      const durationBeats = Math.max(
        0,
        Math.min(note.durationBeats, nextStart - startBeat, maxBeat - startBeat)
      );
      return {
        ...note,
        startBeat,
        durationBeats
      };
    })
    .filter((note) => note.startBeat < maxBeat && note.durationBeats > 0);
}
