import type { GenerationRequest, GeneratedMidiTrack, MidiNoteEvent } from './types';

export interface MagentaAdapter {
  generateContinuation(request: GenerationRequest, seedTracks: GeneratedMidiTrack[]): Promise<GeneratedMidiTrack[]>;
}

// ---------------------------------------------------------------------------
// Checkpoint URLs for pretrained Magenta models hosted by Google.
// The melody model handles pitched instruments; the drum model handles percussion.
// ---------------------------------------------------------------------------
const MELODY_RNN_URL = 'https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/melody_rnn';
const DRUM_KIT_RNN_URL = 'https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/drum_kit_rnn';

// Magenta NoteSequence note shape (subset we care about)
interface MagentaNote {
  pitch: number;
  startTime: number;
  endTime: number;
  velocity: number;
  isDrum?: boolean;
}

interface MagentaNoteSequence {
  notes: MagentaNote[];
  totalTime: number;
  tempos?: Array<{ time: number; qpm: number }>;
  timeSignatures?: Array<{ time: number; numerator: number; denominator: number }>;
  quantizationInfo?: { stepsPerQuarter: number };
  totalQuantizedSteps?: number;
}

/**
 * MagentaRnnAdapter uses MusicRNN to continue the seed tracks.
 *
 * The generation service already wraps this in a 2 500 ms race, so if the
 * model hasn't initialised yet (first call, cold download) the rule-based
 * output is returned as fallback — zero latency impact after warm-up.
 */
export class MagentaRnnAdapter implements MagentaAdapter {
  // Singleton model instances, loaded lazily.
  private melodyModel: unknown = null;
  private drumModel: unknown = null;
  private melodyReady = false;
  private drumReady = false;

  async generateContinuation(request: GenerationRequest, seedTracks: GeneratedMidiTrack[]): Promise<GeneratedMidiTrack[]> {
    try {
      const mm = await import('@magenta/music');
      const results = await Promise.all(
        seedTracks.map((track) => this.continueTrack(mm, request, track))
      );
      return results;
    } catch {
      // Any failure (model not loaded, network error, unsupported env) → passthrough
      return seedTracks;
    }
  }

  private async continueTrack(
    mm: typeof import('@magenta/music'),
    request: GenerationRequest,
    track: GeneratedMidiTrack
  ): Promise<GeneratedMidiTrack> {
    if (track.notes.length === 0) return track;

    try {
      const isDrums = track.role === 'drums';
      const model = isDrums
        ? await this.getDrumModel(mm)
        : await this.getMelodyModel(mm);

      const beatsPerSecond = request.bpm / 60;
      const seed = notesToNoteSequence(track.notes, beatsPerSecond, isDrums, request.bpm);

      // Steps = 4 quarter notes per bar × target bars × 4 steps per quarter
      const stepsPerBar = 16;
      const targetSteps = request.bars * stepsPerBar;
      const temperature = request.energy === 'high' ? 1.1 : request.energy === 'low' ? 0.7 : 0.9;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const continuation = await (model as any).continueSequence(seed, targetSteps, temperature) as MagentaNoteSequence;
      const continuedNotes = noteSequenceToNotes(continuation.notes, beatsPerSecond);

      return { ...track, notes: continuedNotes.length > 0 ? continuedNotes : track.notes };
    } catch {
      return track;
    }
  }

  private async getMelodyModel(mm: typeof import('@magenta/music')): Promise<unknown> {
    if (!this.melodyModel) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.melodyModel = new (mm as any).MusicRNN(MELODY_RNN_URL);
    }
    if (!this.melodyReady) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.melodyModel as any).initialize();
      this.melodyReady = true;
    }
    return this.melodyModel;
  }

  private async getDrumModel(mm: typeof import('@magenta/music')): Promise<unknown> {
    if (!this.drumModel) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.drumModel = new (mm as any).MusicRNN(DRUM_KIT_RNN_URL);
    }
    if (!this.drumReady) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.drumModel as any).initialize();
      this.drumReady = true;
    }
    return this.drumModel;
  }
}

// ---------------------------------------------------------------------------
// Conversion helpers between our MidiNoteEvent format and Magenta NoteSequence
// ---------------------------------------------------------------------------

function notesToNoteSequence(
  notes: MidiNoteEvent[],
  beatsPerSecond: number,
  isDrums: boolean,
  bpm: number
): MagentaNoteSequence {
  const magentaNotes: MagentaNote[] = notes.map((n) => ({
    pitch: Math.max(0, Math.min(127, Math.round(n.pitch))),
    startTime: n.startBeat / beatsPerSecond,
    endTime: (n.startBeat + Math.max(0.01, n.durationBeats)) / beatsPerSecond,
    velocity: Math.max(1, Math.min(127, Math.round(n.velocity))),
    isDrum: isDrums
  }));

  const totalTime = Math.max(...magentaNotes.map((n) => n.endTime), 0.01);

  return {
    notes: magentaNotes,
    totalTime,
    tempos: [{ time: 0, qpm: bpm }],
    timeSignatures: [{ time: 0, numerator: 4, denominator: 4 }],
    quantizationInfo: { stepsPerQuarter: 4 }
  };
}

function noteSequenceToNotes(magentaNotes: MagentaNote[], beatsPerSecond: number): MidiNoteEvent[] {
  return magentaNotes
    .filter((n) => n.endTime > n.startTime)
    .map((n) => ({
      startBeat: n.startTime * beatsPerSecond,
      durationBeats: Math.max(0.1, (n.endTime - n.startTime) * beatsPerSecond),
      pitch: Math.max(0, Math.min(127, Math.round(n.pitch))),
      velocity: Math.max(1, Math.min(127, Math.round(n.velocity ?? 80)))
    }));
}

/**
 * Stub adapter — imported by GenerationService when Magenta is not desired.
 * Passes seed tracks through unchanged with no network activity.
 */
export class LazyMagentaAdapter implements MagentaAdapter {
  async generateContinuation(_request: GenerationRequest, seedTracks: GeneratedMidiTrack[]): Promise<GeneratedMidiTrack[]> {
    return seedTracks;
  }
}
