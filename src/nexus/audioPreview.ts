import type { GeneratedMidi, MidiNoteEvent } from '../generation/types';

type BrowserAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

let activeContext: AudioContext | null = null;
let activeNodes: AudioScheduledSourceNode[] = [];

export async function playGeneratedMidiPreview(midi: GeneratedMidi): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  stopGeneratedMidiPreview();

  const AudioContextCtor = window.AudioContext ?? (window as BrowserAudioWindow).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error('This browser does not support Web Audio preview.');
  }

  const context = new AudioContextCtor();
  activeContext = context;
  await context.resume();

  const masterGain = context.createGain();
  masterGain.gain.setValueAtTime(0.18, context.currentTime);
  masterGain.connect(context.destination);

  const secondsPerBeat = 60 / midi.request.bpm;
  const previewStart = context.currentTime + 0.08;
  const maxPreviewSeconds = Math.min(midi.request.bars * 4 * secondsPerBeat, 24);

  midi.tracks.forEach((track) => {
    track.notes.forEach((note) => {
      const startSeconds = note.startBeat * secondsPerBeat;
      const durationSeconds = note.durationBeats * secondsPerBeat;
      if (startSeconds > maxPreviewSeconds) return;
      scheduleNote(context, masterGain, note, previewStart + startSeconds, Math.min(durationSeconds, maxPreviewSeconds - startSeconds));
    });
  });

  window.setTimeout(() => {
    stopGeneratedMidiPreview();
  }, (maxPreviewSeconds + 0.5) * 1000);
}

export function stopGeneratedMidiPreview(): void {
  activeNodes.forEach((node) => {
    try {
      node.stop();
    } catch {
      // The node may already have ended naturally.
    }
  });
  activeNodes = [];

  if (activeContext) {
    void activeContext.close();
    activeContext = null;
  }
}

function scheduleNote(context: AudioContext, output: AudioNode, note: MidiNoteEvent, startTime: number, durationSeconds: number): void {
  if (durationSeconds <= 0) return;

  const oscillator = context.createOscillator();
  const noteGain = context.createGain();
  const frequency = midiToFrequency(note.pitch);
  const velocityGain = Math.max(0.1, Math.min(0.85, note.velocity / 127));
  const stopTime = startTime + durationSeconds;

  oscillator.type = note.pitch < 48 ? 'triangle' : 'sine';
  oscillator.frequency.setValueAtTime(frequency, startTime);

  noteGain.gain.setValueAtTime(0, startTime);
  noteGain.gain.linearRampToValueAtTime(velocityGain, startTime + 0.015);
  noteGain.gain.exponentialRampToValueAtTime(0.001, Math.max(startTime + 0.03, stopTime - 0.02));

  oscillator.connect(noteGain);
  noteGain.connect(output);
  oscillator.start(startTime);
  oscillator.stop(stopTime + 0.03);
  activeNodes.push(oscillator);
}

export function midiToFrequency(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}
