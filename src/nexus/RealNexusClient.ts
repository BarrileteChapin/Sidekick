import type { NexusClient } from './NexusClient';
import type { MidiInsertOptions } from './NexusClient';
import type { GeneratedMidi } from '../generation/types';
import type { SessionContext, SessionTrack } from '../core/types';
import { playGeneratedMidiPreview } from './audioPreview';

export type AudiotoolNexusLike = {
  project?: {
    getBpm?: () => Promise<number> | number;
    setBpm?: (bpm: number) => Promise<void> | void;
    getKey?: () => Promise<string | null> | string | null;
    getTracks?: () => Promise<unknown[]> | unknown[];
  };
  selection?: {
    getTrack?: () => Promise<unknown> | unknown;
  };
  midi?: {
    preview?: (bytes: Uint8Array) => Promise<void> | void;
    insert?: (bytes: Uint8Array, options?: { targetTrackId?: string }) => Promise<void> | void;
  };
};

export class RealNexusClient implements NexusClient {
  readonly insertMidi?: (midi: GeneratedMidi, options?: MidiInsertOptions) => Promise<void>;
  readonly setProjectBpm?: (bpm: number) => Promise<void>;

  constructor(private readonly nexus: AudiotoolNexusLike) {
    if (nexus.midi?.insert) {
      this.insertMidi = async (midi: GeneratedMidi, options?: MidiInsertOptions) => {
        await nexus.midi?.insert?.(midi.midiBytes, { targetTrackId: options?.targetTrackId });
      };
    }
    if (nexus.project?.setBpm) {
      this.setProjectBpm = async (bpm: number) => {
        await nexus.project?.setBpm?.(Math.max(40, Math.min(240, Math.round(bpm))));
      };
    }
  }

  async getCurrentSessionContext(): Promise<SessionContext> {
    const bpm = await this.nexus.project?.getBpm?.();
    const key = await this.nexus.project?.getKey?.();
    const rawTracks = (await this.nexus.project?.getTracks?.()) ?? [];

    return {
      id: 'audiotool-live-session',
      bpm: typeof bpm === 'number' ? bpm : 120,
      key: typeof key === 'string' ? key : null,
      scaleMode: null,
      tracks: rawTracks.map(mapUnknownTrack),
      arrangementState: { section: 'unknown', density: 'medium', energy: 'medium' },
      completionState: {}
    };
  }

  async getSelectedTrack(): Promise<SessionTrack | null> {
    const track = await this.nexus.selection?.getTrack?.();
    return track ? mapUnknownTrack(track) : null;
  }

  async previewMidi(midi: GeneratedMidi): Promise<void> {
    if (this.nexus.midi?.preview) {
      await this.nexus.midi.preview(midi.midiBytes);
      return;
    }
    await playGeneratedMidiPreview(midi);
  }
}

function mapUnknownTrack(raw: unknown): SessionTrack {
  const track = raw as Record<string, unknown>;
  const name = typeof track.name === 'string' ? track.name : 'Untitled Track';
  return {
    id: typeof track.id === 'string' ? track.id : crypto.randomUUID(),
    name,
    role: inferRole(name),
    hasMidi: Boolean(track.hasMidi ?? track.midiClips),
    hasAudio: Boolean(track.hasAudio ?? track.audioClips),
    instrumentName: typeof track.instrumentName === 'string' ? track.instrumentName : undefined,
    clipCount: typeof track.clipCount === 'number' ? track.clipCount : undefined,
    tags: Array.isArray(track.tags) ? track.tags.filter((tag): tag is string => typeof tag === 'string') : undefined
  };
}

function inferRole(name: string): SessionTrack['role'] {
  const lower = name.toLowerCase();
  if (/kick|snare|hat|drum|perc/.test(lower)) return 'drums';
  if (/bass|sub/.test(lower)) return 'bass';
  if (/chord|keys|piano|organ/.test(lower)) return 'harmony';
  if (/lead|hook|saw/.test(lower)) return 'lead';
  if (/pad|string/.test(lower)) return 'pad';
  if (/arp|seq/.test(lower)) return 'arp';
  if (/vocal|vox/.test(lower)) return 'vocal';
  if (/fx|riser|impact|noise/.test(lower)) return 'fx';
  return 'other';
}
