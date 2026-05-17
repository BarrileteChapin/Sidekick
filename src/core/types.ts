import type { GenerationRequest } from '../generation/types';

export type TrackRole =
  | 'drums'
  | 'bass'
  | 'harmony'
  | 'lead'
  | 'pad'
  | 'arp'
  | 'vocal'
  | 'fx'
  | 'transition'
  | 'other';

export type ScaleMode = 'major' | 'minor' | 'dorian' | 'mixolydian' | 'harmonic_minor';

export type ArrangementSection =
  | 'intro'
  | 'verse'
  | 'build'
  | 'drop'
  | 'breakdown'
  | 'outro'
  | 'unknown';

export type EnergyLevel = 'low' | 'medium' | 'high';

export interface SessionTrack {
  id: string;
  name: string;
  role: TrackRole;
  hasMidi: boolean;
  hasAudio: boolean;
  muted?: boolean;
  soloed?: boolean;
  instrumentName?: string;
  clipCount?: number;
  noteRange?: [number, number];
  tags?: string[];
}

export interface SessionContext {
  id: string;
  bpm: number;
  key: string | null;
  scaleMode: ScaleMode | null;
  tracks: SessionTrack[];
  styleProfileId?: string;
  arrangementState: {
    section?: ArrangementSection;
    barLength?: number;
    density: EnergyLevel;
    energy: EnergyLevel;
  };
  completionState: Partial<Record<TrackRole, boolean>>;
}

export type ItemType = 'sample' | 'instrument' | 'preset' | 'midi' | 'action';

export interface ItemFeatures {
  id: string;
  name: string;
  type: ItemType;
  bpm?: number;
  key?: string;
  scaleMode?: ScaleMode;
  role: TrackRole;
  tags: string[];
  popularity: number;
  styleProfileIds?: string[];
  audioVector?: number[];
  audiotoolInstrumentSlug?: string;
}

export type FeedbackType =
  | 'accepted'
  | 'downloaded'
  | 'inserted'
  | 'auditioned'
  | 'regenerated'
  | 'ignored'
  | 'rejected';

export interface FeedbackEvent {
  itemId: string;
  type: FeedbackType;
  timestamp: number;
  contextId?: string;
  notes?: string;
}

export interface UserProfile {
  id: string;
  bpmPreference?: number;
  keyPreference?: string;
  preferredStyleIds: string[];
  roleBias: Partial<Record<TrackRole, number>>;
  tagBias: Record<string, number>;
  timbreCentroid?: number[];
  generationDefaults?: Partial<GenerationRequest>;
  history: FeedbackEvent[];
}

export const trackRoles: TrackRole[] = [
  'drums',
  'bass',
  'harmony',
  'lead',
  'pad',
  'arp',
  'vocal',
  'fx',
  'transition',
  'other'
];

export function createDefaultProfile(id = 'local-user'): UserProfile {
  return {
    id,
    preferredStyleIds: ['deep-house-groove'],
    roleBias: {},
    tagBias: {},
    history: []
  };
}
