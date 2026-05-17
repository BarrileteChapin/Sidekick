import type { MusicStyleProfile } from '../data/musicStyles';
import type { GenerationRequest, GeneratedMidiTrack, MidiNoteEvent } from './types';
import { generateChordTrack, selectProgression } from './chordProgressions';
import { generateBass, generateMotif } from './motifGenerator';
import { DrumEngine } from './drumEngine';

// GM drum channel (MIDI channel 10, matching the 1-indexed convention used for
// lead/chord/bass channels 1, 2, 3)
const CH_DRUMS = 10;

export function generateArrangementTracks(request: GenerationRequest, style: MusicStyleProfile): GeneratedMidiTrack[] {
  const progression = selectProgression(style);
  const tracks: GeneratedMidiTrack[] = [];

  const wantsCoreArrangement =
    request.targetRole === 'full' ||
    request.outputMode === 'motif_chords_bass' ||
    request.outputMode === 'motif_chords_bass_drums';
  const wantsDrums = request.outputMode === 'motif_chords_bass_drums' || request.targetRole === 'drums';

  if (wantsCoreArrangement || request.targetRole === 'lead') {
    tracks.push({ name: 'Sidekick Lead Motif', role: 'lead', channel: 1, notes: generateMotif(request, style, progression) });
  }

  if (wantsCoreArrangement || request.targetRole === 'bass') {
    tracks.push({ name: 'Sidekick Bass', role: 'bass', channel: 2, notes: generateBass(request, progression) });
  }

  if (wantsCoreArrangement || request.targetRole === 'harmony') {
    tracks.push({
      name: 'Sidekick Chords',
      role: 'harmony',
      channel: 3,
      notes: generateChordTrack({ key: request.key, mode: request.scaleMode, progression, bars: request.bars })
    });
  }

  if (wantsDrums) {
    const drumNotes = generateDrums(request, style);
    if (drumNotes.length > 0) {
      tracks.push({ name: 'Sidekick Drums', role: 'drums', channel: CH_DRUMS, notes: drumNotes });
    }
  }

  if (tracks.length === 0) {
    tracks.push({ name: 'Sidekick Motif', role: 'lead', channel: 1, notes: generateMotif(request, style, progression) });
  }

  return tracks;
}

// ─── Drum generation ────────────────────────────────────────────────────────

/**
 * Generates drum events for the full requested bar length by looping a
 * 2-bar template phrase. Each phrase iteration uses a different seed so
 * the pattern varies slightly while keeping the same rhythmic template.
 */
function generateDrums(request: GenerationRequest, style: MusicStyleProfile): MidiNoteEvent[] {
  if (!style.drums) return [];

  const engine = new DrumEngine();
  const PHRASE_BEATS = 8; // 2 bars × 4 beats
  const phrases = Math.ceil(request.bars / 2);
  const notes: MidiNoteEvent[] = [];

  for (let phraseIndex = 0; phraseIndex < phrases; phraseIndex++) {
    const random = seededRandom(`drums-${request.styleProfileId}-${request.bpm}-${phraseIndex}`);
    const phraseEvents = engine.generatePhrase(style.drums, random);
    const offset = phraseIndex * PHRASE_BEATS;
    for (const event of phraseEvents) {
      notes.push({ ...event, startBeat: event.startBeat + offset });
    }
  }

  return notes;
}

function seededRandom(seed: string): () => number {
  let value = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 1779033703);
  return () => {
    value = Math.imul(value ^ (value >>> 16), 2246822507);
    value = Math.imul(value ^ (value >>> 13), 3266489909);
    return ((value ^= value >>> 16) >>> 0) / 4294967296;
  };
}
