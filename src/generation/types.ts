import type { EnergyLevel, ScaleMode, TrackRole } from '../core/types';

export type KickPattern = 'four_on_floor' | 'broken_club' | 'dembow' | 'two_step' | 'breakbeat' | 'half_time' | 'sparse';
export type SnarePattern = 'backbeat' | 'half_time' | 'dembow' | 'two_step' | 'breakbeat' | 'minimal';

export interface DrumParams {
  kick_pattern: KickPattern;
  snare_pattern: SnarePattern;
  /** Probability (0–1) of a closed hat hit on each 16th-note step. */
  hat_density: number;
  /** Fraction (0–1) of hat hits that become open hats instead of closed. */
  open_hat_rate: number;
  /** Controls how many rim/perc hits fill syncopated slots (0–1). */
  perc_density: number;
  /** Skews perc hits toward off-beat 16th positions when high (0–1). */
  syncopation: number;
  /** Swing delay applied to off-beat 8th notes (0–0.40 beats). */
  swing: number;
  /** Probability (0–1) of adding ghost snares on off-beat positions. */
  ghost_note_prob: number;
  /** Probability (0–1) of adding a tom fill near the end of the phrase. */
  fill_prob: number;
  velocity_min: number;
  velocity_max: number;
  /** Random ±offset applied to each hit's velocity (0–30). */
  velocity_humanization: number;
  /** Scales density of extra hits and fills (0–1). */
  complexity: number;
}

export interface GenerationRequest {
  source: 'button' | 'chat';
  styleProfileId: string;
  targetRole: TrackRole | 'full';
  bpm: number;
  key: string;
  scaleMode: ScaleMode;
  bars: 4 | 8 | 16 | 32;
  outputMode: 'motif' | 'motif_chords_bass' | 'motif_chords_bass_drums' | 'continuation' | 'variation';
  density?: EnergyLevel;
  energy?: EnergyLevel;
  prompt?: string;
  seedTrackId?: string;
}

export interface GeneratedMidi {
  id: string;
  name: string;
  request: GenerationRequest;
  tracks: GeneratedMidiTrack[];
  midiBytes: Uint8Array;
  explanation: string[];
  createdAt: number;
}

export interface GeneratedMidiTrack {
  name: string;
  role: TrackRole;
  channel: number;
  notes: MidiNoteEvent[];
}

export interface MidiNoteEvent {
  pitch: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
}
