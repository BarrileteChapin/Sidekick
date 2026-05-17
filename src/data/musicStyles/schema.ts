import type { EnergyLevel, ScaleMode, TrackRole } from '../../core/types';
import type { DrumParams } from '../../generation/types';

export interface MusicStyleProfile {
  id: string;
  name: string;
  description: string;
  genres: string[];
  bpmRange: [number, number];
  defaultBpm: number;
  defaultScaleMode: ScaleMode;
  swing: number;
  density: EnergyLevel;
  energy: EnergyLevel;
  rolePriorities: Partial<Record<TrackRole, number>>;
  chordProgressions: number[][];
  /** Maps each track role to an Audiotool preset reference (usually `presets/<uuid>`, legacy slugs still allowed). */
  instruments?: Partial<Record<TrackRole, string>>;
  motif: {
    minNotesPerBar: number;
    maxNotesPerBar: number;
    stepBias: number;
    reuseProbability: number;
    recentPhraseBlock: number;
    transformationWeights: {
      transpose: number;
      rhythmNudge: number;
      ornament: number;
    };
    snapStrongBeats: boolean;
    snapBarEdges: boolean;
    passingNotes?: {
      probability: number;
      durationBeats: number;
    };
  };
  /** Genre-specific drum rhythm parameters. Present on all built-in profiles. */
  drums?: DrumParams;
  tags: string[];
}

export function isMusicStyleProfile(value: unknown): value is MusicStyleProfile {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const profile = value as Partial<MusicStyleProfile>;
  return (
    typeof profile.id === 'string' &&
    typeof profile.name === 'string' &&
    Array.isArray(profile.bpmRange) &&
    profile.bpmRange.length === 2 &&
    typeof profile.defaultBpm === 'number' &&
    typeof profile.defaultScaleMode === 'string' &&
    typeof profile.motif === 'object'
  );
}
