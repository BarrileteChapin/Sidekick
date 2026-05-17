import type { MidiNoteEvent } from './types';

export class MotifMemory {
  private phrases: MidiNoteEvent[][] = [];

  remember(phrase: MidiNoteEvent[]): void {
    this.phrases.push(phrase.map((note) => ({ ...note, startBeat: note.startBeat % 8 })));
    this.phrases = this.phrases.slice(-6);
  }

  recall(): MidiNoteEvent[] | null {
    const phrase = this.phrases.at(-1);
    return phrase ? phrase.map((note) => ({ ...note })) : null;
  }
}
