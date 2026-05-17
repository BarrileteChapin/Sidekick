import type { MidiInsertOptions, NexusClient, SuggestedInstrumentRequest } from './NexusClient';
import type { SessionContext, SessionTrack } from '../core/types';
import type { GeneratedMidi } from '../generation/types';
import { playGeneratedMidiPreview } from './audioPreview';

export const mockSessions: Record<string, SessionContext> = {
  DeepHouseSketch: {
    id: 'mock-deep-house-sketch',
    bpm: 122,
    key: 'A',
    scaleMode: 'minor',
    styleProfileId: 'deep-house-groove',
    tracks: [
      { id: 'drums-1', name: 'Pencil House Drums', role: 'drums', hasMidi: true, hasAudio: true, clipCount: 4, tags: ['groove', 'house'] },
      { id: 'chords-1', name: 'Soft Minor Chords', role: 'harmony', hasMidi: true, hasAudio: false, clipCount: 2, noteRange: [48, 72], tags: ['warm'] }
    ],
    arrangementState: { section: 'build', barLength: 32, density: 'medium', energy: 'medium' },
    completionState: { drums: true, harmony: true, bass: false, lead: false, pad: false, fx: false, transition: false }
  },
  EDMDrop: {
    id: 'mock-edm-drop',
    bpm: 128,
    key: 'G',
    scaleMode: 'major',
    styleProfileId: 'festival-drop-lead',
    tracks: [
      { id: 'drop-drums', name: 'Drop Drums', role: 'drums', hasMidi: true, hasAudio: true, clipCount: 8, tags: ['drop'] },
      { id: 'drop-bass', name: 'Main Bass', role: 'bass', hasMidi: true, hasAudio: false, clipCount: 4, tags: ['wide'] }
    ],
    arrangementState: { section: 'drop', barLength: 16, density: 'high', energy: 'high' },
    completionState: { drums: true, bass: true, lead: false, harmony: false, fx: false, transition: false }
  },
  MelodicTechnoLoop: {
    id: 'mock-melodic-techno-loop',
    bpm: 126,
    key: 'D',
    scaleMode: 'harmonic_minor',
    styleProfileId: 'melodic-minor-drive',
    tracks: [
      { id: 'arp-1', name: 'Sparse Arp', role: 'arp', hasMidi: true, hasAudio: false, clipCount: 1, tags: ['melodic', 'minor'] }
    ],
    arrangementState: { section: 'breakdown', barLength: 16, density: 'low', energy: 'medium' },
    completionState: { arp: true, drums: false, bass: false, harmony: false, lead: false, fx: false }
  },
  PopHouseVocalIdea: {
    id: 'mock-pop-house-vocal-idea',
    bpm: 120,
    key: 'C',
    scaleMode: 'major',
    styleProfileId: 'pop-house',
    tracks: [
      { id: 'vocal-1', name: 'Hook Vocal', role: 'vocal', hasMidi: false, hasAudio: true, clipCount: 3, tags: ['vocal', 'hook'] },
      { id: 'piano-1', name: 'Clean Piano Chords', role: 'harmony', hasMidi: true, hasAudio: false, clipCount: 3, tags: ['pop'] }
    ],
    arrangementState: { section: 'verse', barLength: 24, density: 'medium', energy: 'medium' },
    completionState: { vocal: true, harmony: true, bass: false, lead: false, drums: false, fx: false }
  }
};

export class MockNexusClient implements NexusClient {
  private currentSession: SessionContext;

  constructor(sessionName: keyof typeof mockSessions = 'DeepHouseSketch') {
    this.currentSession = structuredClone(mockSessions[sessionName]);
  }

  async getCurrentSessionContext(): Promise<SessionContext> {
    return structuredClone(this.currentSession);
  }

  async getSelectedTrack(): Promise<SessionTrack | null> {
    return this.currentSession.tracks[0] ?? null;
  }

  async previewMidi(midi: GeneratedMidi): Promise<void> {
    await playGeneratedMidiPreview(midi);
  }

  async insertMidi(midi: GeneratedMidi, options?: MidiInsertOptions): Promise<void> {
    void midi;
    void options;
    // Mock: no-op — MIDI bytes are not written anywhere in mock mode.
  }

  async createAdditionalNoteTracks(count: number): Promise<number> {
    const amount = Math.max(0, Math.min(8, Math.floor(count)));
    const newTracks: SessionTrack[] = Array.from({ length: amount }, (_, i) => ({
      id: crypto.randomUUID(),
      name: `Note Track ${this.currentSession.tracks.length + i + 1}`,
      role: 'lead' as const,
      hasMidi: true,
      hasAudio: false,
      clipCount: 0,
      tags: ['noteTrack', 'mock-created']
    }));
    this.currentSession = {
      ...this.currentSession,
      tracks: [...this.currentSession.tracks, ...newTracks]
    };
    return amount;
  }

  async createSuggestedInstrument(request: SuggestedInstrumentRequest): Promise<SessionTrack> {
    const track: SessionTrack = {
      id: crypto.randomUUID(),
      name: request.name,
      role: request.role,
      hasMidi: true,
      hasAudio: false,
      instrumentName: request.audiotoolInstrumentSlug,
      clipCount: 0,
      tags: ['noteTrack', 'sidekick-created', ...request.tags]
    };
    this.currentSession = {
      ...this.currentSession,
      tracks: [...this.currentSession.tracks, track]
    };
    return track;
  }

  async setProjectBpm(bpm: number): Promise<void> {
    this.currentSession = {
      ...this.currentSession,
      bpm: Math.max(40, Math.min(240, Math.round(bpm)))
    };
  }
}
