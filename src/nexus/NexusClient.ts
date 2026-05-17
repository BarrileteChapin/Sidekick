import type { GeneratedMidi } from '../generation/types';
import type { ItemFeatures, SessionContext, SessionTrack, TrackRole } from '../core/types';

export interface NexusConnectionState {
  mode: 'mock' | 'host' | 'audiotool-sdk';
  authenticated: boolean;
  connected: boolean;
  userName?: string;
  projectUrl?: string;
  redirectUrl?: string;
  message: string;
  canLogin: boolean;
  canConnectProject: boolean;
  noteTrackCount?: number;
}

export interface MidiInsertOptions {
  targetTrackId?: string;
  /**
   * Ordered target IDs for distributed insertion (one per generated track).
   * Used by SDK mode to route lead/bass/harmony to the intended lanes.
   */
  targetTrackIds?: string[];
  startBeat?: number;
  trackMode?: 'distribute' | 'selected';
}

export interface SuggestedInstrumentRequest {
  name: string;
  role: TrackRole;
  tags: string[];
  audiotoolInstrumentSlug?: string;
}

export interface NexusClient {
  getCurrentSessionContext(): Promise<SessionContext>;
  getSelectedTrack?(): Promise<SessionTrack | null>;
  previewMidi?(midi: GeneratedMidi): Promise<void>;
  insertMidi?(midi: GeneratedMidi, options?: MidiInsertOptions): Promise<void>;
  createAdditionalNoteTracks?(count: number): Promise<number>;
  createSuggestedInstrument?(request: SuggestedInstrumentRequest | ItemFeatures): Promise<SessionTrack>;
  /** Change the project tempo. Clamps to 40–240 BPM. */
  setProjectBpm?(bpm: number): Promise<void>;
  getConnectionState?(): Promise<NexusConnectionState>;
  login?(): Promise<void> | void;
  logout?(): Promise<void> | void;
  connectProject?(projectUrl: string): Promise<void>;
  disconnectProject?(): Promise<void>;
}
