import type { MusicStyleProfile } from '../data/musicStyles';
import type { GenerationRequest, MidiNoteEvent } from './types';
import { chordToneDegrees } from './chordProgressions';
import { degreeToPitch } from './scales';
import { MotifMemory } from './motifMemory';
import { cleanupMonophonic, transformMotif } from './motifTransform';

export function generateMotif(request: GenerationRequest, style: MusicStyleProfile, progression: number[]): MidiNoteEvent[] {
  const random = seededRandom(`${request.styleProfileId}-${request.key}-${request.bpm}-${request.bars}-${request.targetRole}`);
  const memory = new MotifMemory();
  const notes: MidiNoteEvent[] = [];
  const phraseBars = 2;

  for (let phraseStart = 0; phraseStart < request.bars; phraseStart += phraseBars) {
    const shouldReuse = memory.recall() && random() < style.motif.reuseProbability;
    const phrase = shouldReuse
      ? transformMotif(memory.recall() ?? [], style, request.key, request.scaleMode, random)
      : createPhrase(request, style, progression, phraseStart, phraseBars, random);

    const shifted = phrase.map((note) => ({ ...note, startBeat: phraseStart * 4 + (note.startBeat % (phraseBars * 4)) }));
    notes.push(...shifted);
    memory.remember(phrase);
  }

  return cleanupMonophonic(applySwing(notes, style.swing), request.bars * 4);
}

export function generateBass(request: GenerationRequest, progression: number[]): MidiNoteEvent[] {
  if (request.styleProfileId === 'uk-garage') {
    return generateUkGarageBass(request, progression);
  }

  const durationBeats = request.energy === 'low' ? 3.75 : request.energy === 'high' ? 3.0 : 3.5;
  const notes: MidiNoteEvent[] = [];
  for (let bar = 0; bar < request.bars; bar += 1) {
    const root = degreeToPitch(request.key, request.scaleMode, progression[bar % progression.length], -2);
    notes.push({
      pitch: root,
      startBeat: bar * 4,
      durationBeats,
      velocity: 88
    });
  }
  return notes;
}

function generateUkGarageBass(request: GenerationRequest, progression: number[]): MidiNoteEvent[] {
  const random = seededRandom(`uk-garage-bass-${request.key}-${request.scaleMode}-${request.bpm}-${request.bars}`);
  const notes: MidiNoteEvent[] = [];
  const grooveA = [
    { offset: 0, duration: 0.5, velocity: 94, tone: 'root' as const },
    { offset: 0.75, duration: 0.35, velocity: 82, tone: 'fifth' as const },
    { offset: 1.5, duration: 0.4, velocity: 88, tone: 'root' as const },
    { offset: 2.75, duration: 0.45, velocity: 86, tone: 'octave' as const },
    { offset: 3.5, duration: 0.35, velocity: 91, tone: 'root' as const }
  ];
  const grooveB = [
    { offset: 0, duration: 0.45, velocity: 93, tone: 'root' as const },
    { offset: 0.5, duration: 0.3, velocity: 80, tone: 'fifth' as const },
    { offset: 1.75, duration: 0.35, velocity: 89, tone: 'root' as const },
    { offset: 2.5, duration: 0.35, velocity: 84, tone: 'octave' as const },
    { offset: 3.25, duration: 0.45, velocity: 90, tone: 'root' as const }
  ];

  for (let bar = 0; bar < request.bars; bar += 1) {
    const degree = progression[bar % progression.length];
    const root = degreeToPitch(request.key, request.scaleMode, degree, -2);
    const fifth = degreeToPitch(request.key, request.scaleMode, degree + 4, -2);
    const octave = root + 12;
    const groove = random() > 0.5 ? grooveA : grooveB;
    const barStart = bar * 4;

    for (const step of groove) {
      const pitch = step.tone === 'fifth' ? fifth : step.tone === 'octave' ? octave : root;
      notes.push({
        pitch,
        startBeat: barStart + step.offset,
        durationBeats: step.duration,
        velocity: step.velocity
      });
    }
  }

  return notes;
}

function createPhrase(
  request: GenerationRequest,
  style: MusicStyleProfile,
  progression: number[],
  phraseStart: number,
  phraseBars: number,
  random: () => number
): MidiNoteEvent[] {
  const notes: MidiNoteEvent[] = [];
  for (let barOffset = 0; barOffset < phraseBars; barOffset += 1) {
    const bar = phraseStart + barOffset;
    const chordDegrees = chordToneDegrees(progression, bar);

    if (style.motif.passingNotes && request.targetRole !== 'bass') {
      notes.push(...createPassingNoteBar(request, style, chordDegrees, barOffset, random));
      continue;
    }

    const noteCount = randomInt(style.motif.minNotesPerBar, style.motif.maxNotesPerBar, random);

    for (let index = 0; index < noteCount; index += 1) {
      const slot = index * (4 / noteCount);
      const degree = chooseDegree(chordDegrees, random, style.motif.snapStrongBeats && Math.round(slot) % 2 === 0);
      notes.push({
        pitch: degreeToPitch(request.key, request.scaleMode, degree, request.targetRole === 'bass' ? -2 : 0),
        startBeat: barOffset * 4 + quantize(slot + randomRange(-0.12, 0.12, random)),
        durationBeats: random() > 0.78 ? 0.75 : 0.45,
        velocity: randomInt(64, request.energy === 'high' ? 108 : 92, random)
      });
    }
  }
  return notes;
}

function createPassingNoteBar(
  request: GenerationRequest,
  style: MusicStyleProfile,
  chordDegrees: number[],
  barOffset: number,
  random: () => number
): MidiNoteEvent[] {
  const passingNotes = style.motif.passingNotes;
  if (!passingNotes) return [];

  const notes: MidiNoteEvent[] = [];
  const anchorDegrees = [
    chooseDegree(chordDegrees, random, true),
    chooseDegree(chordDegrees, random, true),
    chooseDegree(chordDegrees, random, true)
  ];

  for (let beat = 0; beat < 4; beat += 1) {
    const isStrongBeat = beat % 2 === 0;
    const previousAnchor = anchorDegrees[Math.floor(beat / 2)];
    const nextAnchor = anchorDegrees[Math.min(Math.floor(beat / 2) + 1, anchorDegrees.length - 1)];
    const usePassingTone = !isStrongBeat && random() < passingNotes.probability;
    const degree = usePassingTone
      ? choosePassingDegree(previousAnchor, nextAnchor, chordDegrees, random)
      : chooseDegree(chordDegrees, random, isStrongBeat);

    notes.push({
      pitch: degreeToPitch(request.key, request.scaleMode, degree, 0),
      startBeat: barOffset * 4 + beat,
      durationBeats: passingNotes.durationBeats,
      velocity: randomInt(64, request.energy === 'high' ? 108 : 92, random)
    });
  }

  return notes;
}

function chooseDegree(chordDegrees: number[], random: () => number, preferChordTone: boolean): number {
  if (preferChordTone || random() > 0.35) {
    return chordDegrees[randomInt(0, chordDegrees.length - 1, random)];
  }
  return chordDegrees[0] + randomInt(-2, 4, random);
}

function choosePassingDegree(previousAnchor: number, nextAnchor: number, chordDegrees: number[], random: () => number): number {
  const direction = nextAnchor === previousAnchor ? (random() > 0.5 ? 1 : -1) : Math.sign(nextAnchor - previousAnchor);
  let degree = previousAnchor + direction;
  if (chordDegrees.includes(degree)) {
    degree += direction;
  }
  return degree;
}

function applySwing(notes: MidiNoteEvent[], swing: number): MidiNoteEvent[] {
  return notes.map((note) => {
    const eighth = Math.round(note.startBeat * 2);
    const isOffbeat = eighth % 2 === 1;
    return { ...note, startBeat: note.startBeat + (isOffbeat ? swing : 0) };
  });
}

function quantize(value: number): number {
  return Math.max(0, Math.round(value * 4) / 4);
}

function randomInt(min: number, max: number, random: () => number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function randomRange(min: number, max: number, random: () => number): number {
  return min + (max - min) * random();
}

function seededRandom(seed: string): () => number {
  let value = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 1779033703);
  return () => {
    value = Math.imul(value ^ (value >>> 16), 2246822507);
    value = Math.imul(value ^ (value >>> 13), 3266489909);
    return ((value ^= value >>> 16) >>> 0) / 4294967296;
  };
}
