import { Midi } from '@tonejs/midi';
import type { GeneratedMidiTrack, GenerationRequest } from './types';

export function writeMidi(request: GenerationRequest, tracks: GeneratedMidiTrack[]): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(request.bpm);
  const secondsPerBeat = 60 / request.bpm;

  tracks.forEach((generatedTrack) => {
    const midiTrack = midi.addTrack();
    midiTrack.name = generatedTrack.name;
    midiTrack.channel = toMidiChannel(generatedTrack.channel);
    generatedTrack.notes.forEach((note) => {
      midiTrack.addNote({
        midi: note.pitch,
        time: note.startBeat * secondsPerBeat,
        duration: note.durationBeats * secondsPerBeat,
        velocity: Math.max(0, Math.min(1, note.velocity / 127))
      });
    });
  });

  return midi.toArray();
}

function toMidiChannel(channel: number): number {
  const normalized = Math.round(channel);
  const zeroIndexed = normalized >= 1 && normalized <= 16 ? normalized - 1 : normalized;
  return Math.max(0, Math.min(15, zeroIndexed));
}

export function downloadMidi(bytes: Uint8Array, fileName: string): void {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([buffer], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
