import { audiotool, type AuthenticatedClient, type BrowserAuthResult, type SyncedDocument } from '@audiotool/nexus';
import type { NexusLocation } from '@audiotool/nexus/document';
import { Ticks } from '@audiotool/nexus/utils';
import type { MidiInsertOptions, NexusClient, NexusConnectionState, SuggestedInstrumentRequest } from './NexusClient';
import type { SessionContext, SessionTrack, TrackRole } from '../core/types';
import type { GeneratedMidi, GeneratedMidiTrack } from '../generation/types';
import { playGeneratedMidiPreview } from './audioPreview';

type NexusEntityLike = {
  id: string;
  entityType: string;
  location?: NexusLocation;
  fields: Record<string, { value?: unknown } | undefined>;
};

const storedProjectUrlKey = 'sidekick:audiotool-project-url';

export class AudiotoolSdkNexusClient implements NexusClient {
  private authResult: BrowserAuthResult | null = null;
  private document: SyncedDocument | null = null;
  private projectUrl: string | null = readStoredProjectUrl();

  constructor(
    private readonly clientId: string,
    private readonly redirectUrl = getDefaultRedirectUrl()
  ) {}

  async initialize(): Promise<NexusConnectionState> {
    await this.ensureAuth();
    return this.getConnectionState();
  }

  async getConnectionState(): Promise<NexusConnectionState> {
    await this.ensureAuth();
    const authResult = this.authResult;
    const authenticated = authResult?.status === 'authenticated';
    const syncConnected = this.document?.connected.getValue() ?? false;
    return {
      mode: 'audiotool-sdk',
      authenticated,
      connected: Boolean(this.document && syncConnected),
      userName: authResult?.status === 'authenticated' ? authResult.userName : undefined,
      projectUrl: this.projectUrl ?? undefined,
      redirectUrl: this.redirectUrl,
      message: this.getStatusMessage(),
      canLogin: !authenticated,
      canConnectProject: authenticated,
      noteTrackCount: this.document ? getNoteTracks(this.document).length : undefined
    };
  }

  login(): void {
    if (this.authResult?.status === 'unauthenticated') {
      this.authResult.login();
    }
  }

  logout(): void {
    if (this.authResult?.status === 'authenticated') {
      this.authResult.logout();
    }
  }

  async connectProject(projectUrl: string): Promise<void> {
    const client = await this.getAuthenticatedClient();
    if (this.document) {
      await this.document.stop();
    }

    this.projectUrl = projectUrl.trim();
    localStorage.setItem(storedProjectUrlKey, this.projectUrl);
    this.document = await client.open(this.projectUrl);
    await this.document.start();
  }

  async disconnectProject(): Promise<void> {
    if (this.document) {
      await this.document.stop();
      this.document = null;
    }
  }

  async getCurrentSessionContext(): Promise<SessionContext> {
    await this.ensureAuth();
    if (!this.document && this.authResult?.status === 'authenticated' && this.projectUrl) {
      await this.connectProject(this.projectUrl);
    }

    if (!this.document) {
      return createDisconnectedSession();
    }

    const entities = this.document.queryEntities.get() as NexusEntityLike[];
    const config = this.document.queryEntities.ofTypes('config').getOne() as NexusEntityLike | undefined;
    const tracks = mapTimelineTracks(entities);

    return {
      id: this.projectUrl ?? 'audiotool-sdk-session',
      bpm: readNumberField(config, 'tempoBpm') ?? 120,
      key: null,
      scaleMode: null,
      tracks,
      arrangementState: {
        section: 'unknown',
        barLength: readDurationBars(config),
        density: tracks.length > 8 ? 'high' : tracks.length > 2 ? 'medium' : 'low',
        energy: tracks.some((track) => track.role === 'drums' || track.role === 'bass') ? 'medium' : 'low'
      },
      completionState: {
        drums: tracks.some((track) => track.role === 'drums'),
        bass: tracks.some((track) => track.role === 'bass'),
        harmony: tracks.some((track) => track.role === 'harmony'),
        lead: tracks.some((track) => track.role === 'lead'),
        arp: tracks.some((track) => track.role === 'arp'),
        other: tracks.some((track) => track.role === 'other')
      }
    };
  }

  async getSelectedTrack(): Promise<SessionTrack | null> {
    const session = await this.getCurrentSessionContext();
    return session.tracks[0] ?? null;
  }

  async previewMidi(midi: GeneratedMidi): Promise<void> {
    await playGeneratedMidiPreview(midi);
  }

  async insertMidi(midi: GeneratedMidi, options: MidiInsertOptions = {}): Promise<void> {
    if (!this.document) {
      throw new Error('Sync an Audiotool project before inserting MIDI.');
    }
    if (!this.document.connected.getValue()) {
      throw new Error('Audiotool sync is temporarily offline. Re-sync the project and try inserting again.');
    }

    const noteTracks = getNoteTracks(this.document);
    const explicitTarget = options.targetTrackId ? noteTracks.find((track) => track.id === options.targetTrackId) : null;
    // Preserve index positions: keep undefined slots so each generated track
    // maps to its intended target, even if some IDs weren't found yet.
    const distributedTargetIds = options.targetTrackIds ?? [];
    const distributedTargets: (NoteTrackTarget | undefined)[] = distributedTargetIds
      .map((id) => noteTracks.find((track) => track.id === id));
    if (noteTracks.length === 0) {
      throw new Error('No Audiotool note track was found. Create/select an instrument track first, then refresh Sidekick.');
    }

    const generatedTracks = midi.tracks.filter((track) => track.notes.length > 0);
    if (generatedTracks.length === 0) {
      throw new Error('Generated MIDI has no notes to insert.');
    }
    const startBeat = Math.max(0, options.startBeat ?? 0);
    const maxTrackLengthBeats = Math.max(...generatedTracks.map((track) => getGeneratedTrackLengthBeats(track, midi.request.bars * 4)));
    const requiredDurationTicks = beatsToTicks(startBeat + maxTrackLengthBeats);

    // Track which noteTracks are already claimed so we don't double-assign.
    const claimedNoteTrackIds = new Set<string>();
    distributedTargets.forEach((target) => { if (target) claimedNoteTrackIds.add(target.id); });

    const insertedRegions = await this.document.modify((transaction) => {
      ensureTimelineDuration(transaction, requiredDurationTicks);
      const regions: InsertedRegionSummary[] = [];
      generatedTracks.forEach((generatedTrack, index) => {
        let noteTrack: NoteTrackTarget;
        if (options.trackMode === 'selected') {
          noteTrack = explicitTarget ?? noteTracks[0];
        } else {
          const distributed = distributedTargets[index];
          if (distributed) {
            noteTrack = distributed;
          } else if (explicitTarget) {
            noteTrack = explicitTarget;
          } else {
            // Last resort: pick the first unclaimed track, then fall back to noteTracks[0].
            const unclaimed = noteTracks.find((t) => !claimedNoteTrackIds.has(t.id));
            noteTrack = unclaimed ?? noteTracks[0];
            if (noteTrack) claimedNoteTrackIds.add(noteTrack.id);
            console.warn(
              `[Sidekick] No distributed target for generated track "${generatedTrack.name}" (${generatedTrack.role}), ` +
              `falling back to "${noteTrack.id}". This may indicate a sync delay after creating instruments.`
            );
          }
        }
        regions.push(insertGeneratedTrack(transaction, midi, generatedTrack, noteTrack, startBeat));
      });
      return regions;
    });

    const noteRegions = this.document.queryEntities.ofTypes('noteRegion').get();
    const insertedRegionIds = new Set(insertedRegions.map((region) => region.regionId));
    const visibleRegions = noteRegions.filter((region) => insertedRegionIds.has(region.id)).length;
    if (visibleRegions !== insertedRegions.length) {
      console.warn(
        `[Sidekick] Insert transaction committed ${insertedRegions.length} region(s), but only ${visibleRegions} ` +
        'can be queried immediately. If this persists, refresh project sync.'
      );
    }
    console.info(
      `[Sidekick] Inserted ${insertedRegions.length} MIDI region(s) at beat ${startBeat}. ` +
      `Document online: ${this.document.connected.getValue()}.`
    );
  }

  async createAdditionalNoteTracks(count: number): Promise<number> {
    if (!this.document) {
      throw new Error('Sync an Audiotool project before creating note lanes.');
    }

    const noteTracks = getNoteTracks(this.document);
    const baseTrack = noteTracks[0];
    if (!baseTrack?.player) {
      throw new Error('No source instrument note track was found. Create an instrument track in Audiotool first, then refresh Sidekick.');
    }
    const basePlayer = baseTrack.player;

    const amount = Math.max(0, Math.min(8, Math.floor(count)));
    if (amount === 0) return 0;

    const maxOrder = Math.max(...noteTracks.map((track) => track.orderAmongTracks ?? 0), 0);
    await this.document.modify((transaction) => {
      for (let index = 0; index < amount; index += 1) {
        transaction.create('noteTrack', {
          player: basePlayer,
          isEnabled: true,
          orderAmongTracks: maxOrder + index + 1
        });
      }
    });

    return amount;
  }

  async setProjectBpm(bpm: number): Promise<void> {
    if (!this.document) {
      throw new Error('Sync an Audiotool project before changing BPM.');
    }
    const configs = this.document.queryEntities.ofTypes('config').get();
    if (configs.length === 0) {
      throw new Error('No project config entity found. Open a project and refresh Sidekick.');
    }
    const clampedBpm = Math.max(40, Math.min(240, Math.round(bpm)));
    await this.document.modify((transaction) => {
      transaction.update(configs[0].fields.tempoBpm, clampedBpm);
    });
  }

  async createSuggestedInstrument(request: SuggestedInstrumentRequest): Promise<SessionTrack> {
    const client = await this.getAuthenticatedClient();
    if (!this.document) {
      throw new Error('Sync an Audiotool project before adding instruments.');
    }

    const presetSlug = request.audiotoolInstrumentSlug ?? chooseInstrumentSlug(request);
    const preset = await fetchPreset(client, presetSlug);
    const presetName = normalizePresetName(presetSlug);
    const noteTracks = getNoteTracks(this.document);
    const maxOrder = Math.max(...noteTracks.map((track) => track.orderAmongTracks ?? 0), 0);
    let createdTrackId = '';

    await this.document.modify((transaction) => {
      const device = transaction.createDeviceFromPreset(preset);
      if ('displayName' in device.fields) {
        transaction.update(device.fields.displayName, request.name);
      }
      if ('presetName' in device.fields) {
        transaction.update(device.fields.presetName, presetName);
      }
      if ('positionX' in device.fields) {
        transaction.update(device.fields.positionX, 600 + noteTracks.length * 80);
      }
      if ('positionY' in device.fields) {
        transaction.update(device.fields.positionY, 300 + noteTracks.length * 80);
      }

      const noteTrack = transaction.create('noteTrack', {
        player: device.location,
        isEnabled: true,
        orderAmongTracks: maxOrder + 1
      });
      createdTrackId = noteTrack.id;

      if ('audioOutput' in device.fields) {
        const existingChannelCount = transaction.entities.ofTypes('mixerChannel').get().length;
        const mixerChannel = transaction.create('mixerChannel', {
          displayParameters: {
            displayName: request.name,
            orderAmongStrips: existingChannelCount + 1
          }
        });
        transaction.create('desktopAudioCable', {
          fromSocket: (device.fields as unknown as { audioOutput: { location: NexusLocation } }).audioOutput.location,
          toSocket: mixerChannel.fields.audioInput.location
        });
      }
    });

    return {
      id: createdTrackId,
      name: request.name,
      role: request.role,
      hasMidi: true,
      hasAudio: false,
      instrumentName: presetSlug,
      clipCount: 0,
      tags: ['noteTrack', 'sidekick-created', ...request.tags]
    };
  }

  private async ensureAuth(): Promise<void> {
    if (this.authResult) return;
    this.authResult = await audiotool({
      clientId: this.clientId,
      redirectUrl: this.redirectUrl,
      scope: 'project:write'
    });
  }

  private async getAuthenticatedClient(): Promise<AuthenticatedClient> {
    await this.ensureAuth();
    if (this.authResult?.status !== 'authenticated') {
      throw new Error('Log in with Audiotool before connecting a project.');
    }
    return this.authResult;
  }

  private getStatusMessage(): string {
    if (this.authResult?.status === 'unauthenticated') {
      return this.authResult.error ? `Audiotool login failed: ${this.authResult.error.message}` : 'Log in with Audiotool to connect a project.';
    }
    if (!this.document) {
      return 'Paste a beta.audiotool.com project URL to sync Sidekick.';
    }
    if (!this.document.connected.getValue()) {
      return 'Project is open, but live sync is offline. Changes will stay local until connection recovers.';
    }
    return 'Synced with Audiotool through @audiotool/nexus.';
  }
}

function mapTimelineTracks(entities: NexusEntityLike[]): SessionTrack[] {
  const timelineTracks = entities.filter((entity) => ['noteTrack', 'audioTrack', 'patternTrack'].includes(entity.entityType));
  return timelineTracks.map((entity, index) => {
    const playerEntity = getPlayerEntity(entity, entities);
    const instrumentName = inferInstrumentSlugFromEntity(entity, playerEntity);
    const tags = [entity.entityType, playerEntity?.entityType, instrumentName].filter((tag): tag is string => Boolean(tag));

    return {
      id: entity.id,
      name: readStringField(entity, 'displayName') ?? readStringField(playerEntity, 'displayName') ?? `${labelEntityType(entity.entityType)} ${index + 1}`,
      role: inferRoleFromEntity(entity, playerEntity),
      instrumentName,
      hasMidi: entity.entityType === 'noteTrack' || entity.entityType === 'patternTrack',
      hasAudio: entity.entityType === 'audioTrack',
      muted: readBooleanField(entity, 'isEnabled') === false,
      clipCount: countRegionsForTrack(entities, entity.id),
      tags
    };
  });
}

function getPlayerEntity(entity: NexusEntityLike, entities: NexusEntityLike[]): NexusEntityLike | undefined {
  const player = readFieldValue(entity, 'player');
  if (!isLocationLike(player)) return undefined;
  return entities.find((candidate) => candidate.id === player.entityId);
}

function inferRoleFromEntity(entity: NexusEntityLike, playerEntity?: NexusEntityLike): TrackRole {
  const player = JSON.stringify(readFieldValue(entity, 'player') ?? '').toLowerCase();
  const deviceType = playerEntity?.entityType.toLowerCase() ?? '';
  const presetName = readStringField(playerEntity, 'presetName')?.toLowerCase() ?? '';
  const displayName = readStringField(playerEntity, 'displayName')?.toLowerCase() ?? '';
  const text = `${entity.entityType} ${deviceType} ${presetName} ${displayName} ${player}`;
  if (/beatbox|drum|machiniste/.test(text)) return 'drums';
  if (/bassline|bass|sub|808/.test(text)) return 'bass';
  if (/tonematrix|chord|harmony|pad|piano|organ|keys|heisenberg|pulverisateur/.test(text)) return 'harmony';
  if (/matrix|arp/.test(text)) return 'arp';
  if (/lead|saw|gakki/.test(text)) return 'lead';
  if (entity.entityType === 'audioTrack') return 'other';
  return 'lead';
}

function inferInstrumentSlugFromEntity(entity: NexusEntityLike, playerEntity?: NexusEntityLike): string | undefined {
  const presetName = readStringField(playerEntity, 'presetName');
  if (presetName) return normalizePresetName(presetName);

  const deviceType = playerEntity?.entityType.toLowerCase();
  if (deviceType && AUDIOTOOL_DEVICE_TYPES.has(deviceType)) return deviceType;

  const player = JSON.stringify(readFieldValue(entity, 'player') ?? '').toLowerCase();
  if (/beatbox9/.test(player)) return 'beatbox9';
  if (/beatbox8/.test(player)) return 'beatbox8';
  if (/machiniste/.test(player)) return 'machiniste';
  if (/bassline/.test(player)) return 'bassline';
  if (/heisenberg/.test(player)) return 'heisenberg';
  if (/pulverisateur/.test(player)) return 'pulverisateur';
  return undefined;
}

function countRegionsForTrack(entities: NexusEntityLike[], trackId: string): number {
  return entities.filter((entity) => entity.entityType.endsWith('Region') && JSON.stringify(readFieldValue(entity, 'track') ?? '').includes(trackId)).length;
}

function readDurationBars(config: NexusEntityLike | undefined): number | undefined {
  const durationTicks = readNumberField(config, 'durationTicks');
  return durationTicks ? Math.max(1, Math.round(durationTicks / Ticks.SemiBreve)) : undefined;
}

function readNumberField(entity: NexusEntityLike | undefined, fieldName: string): number | undefined {
  const value = readFieldValue(entity, fieldName);
  return typeof value === 'number' ? value : undefined;
}

function readStringField(entity: NexusEntityLike | undefined, fieldName: string): string | undefined {
  const value = readFieldValue(entity, fieldName);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readBooleanField(entity: NexusEntityLike | undefined, fieldName: string): boolean | undefined {
  const value = readFieldValue(entity, fieldName);
  return typeof value === 'boolean' ? value : undefined;
}

function readFieldValue(entity: NexusEntityLike | undefined, fieldName: string): unknown {
  return entity?.fields?.[fieldName]?.value;
}

function labelEntityType(entityType: string): string {
  return entityType.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
}

function createDisconnectedSession(): SessionContext {
  return {
    id: 'audiotool-not-connected',
    bpm: 120,
    key: null,
    scaleMode: null,
    tracks: [],
    arrangementState: { section: 'unknown', density: 'low', energy: 'low' },
    completionState: { drums: false, bass: false, harmony: false, lead: false, fx: false, transition: false }
  };
}

function readStoredProjectUrl(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(storedProjectUrlKey);
}

function getDefaultRedirectUrl(): string {
  const redirectFromEnv = import.meta.env.VITE_AUDIOTOOL_REDIRECT_URL?.trim();
  if (redirectFromEnv) {
    return redirectFromEnv;
  }

  if (typeof window !== 'undefined') {
    return new URL(import.meta.env.BASE_URL ?? '/', window.location.origin).toString();
  }

  return 'http://127.0.0.1:5173/';
}

type NoteTrackTarget = {
  id: string;
  location: NexusLocation;
  player?: NexusLocation;
  orderAmongTracks?: number;
};

type MidiInsertTransaction = Parameters<SyncedDocument['modify']>[0] extends (transaction: infer T) => unknown ? T : never;

type InsertedRegionSummary = {
  regionId: string;
};

function getNoteTracks(document: SyncedDocument): NoteTrackTarget[] {
  return document.queryEntities.ofTypes('noteTrack').get().map((track) => ({
    id: track.id,
    location: track.location,
    player: track.fields.player.value,
    orderAmongTracks: track.fields.orderAmongTracks.value
  }));
}

function insertGeneratedTrack(
  transaction: MidiInsertTransaction,
  midi: GeneratedMidi,
  generatedTrack: GeneratedMidiTrack,
  noteTrack: NoteTrackTarget,
  startBeat: number
): InsertedRegionSummary {
  const regionDurationTicks = beatsToTicks(getGeneratedTrackLengthBeats(generatedTrack, midi.request.bars * 4));
  const collection = transaction.create('noteCollection', {});
  const noteRegion = transaction.create('noteRegion', {
    collection: collection.location,
    track: noteTrack.location,
    region: {
      positionTicks: beatsToTicks(startBeat),
      durationTicks: regionDurationTicks,
      collectionOffsetTicks: 0,
      loopOffsetTicks: 0,
      loopDurationTicks: regionDurationTicks,
      isEnabled: true,
      colorIndex: colorIndexForRole(generatedTrack.role),
      displayName: `${midi.name} - ${generatedTrack.name}`
    }
  });

  generatedTrack.notes.forEach((note) => {
    transaction.create('note', {
      collection: collection.location,
      positionTicks: beatsToTicks(note.startBeat),
      durationTicks: Math.max(1, beatsToTicks(note.durationBeats)),
      pitch: Math.max(0, Math.min(127, Math.round(note.pitch))),
      velocity: Math.max(0, Math.min(1, note.velocity / 127)),
      doesSlide: false
    });
  });

  return {
    regionId: noteRegion.id
  };
}

function ensureTimelineDuration(transaction: MidiInsertTransaction, requiredDurationTicks: number): void {
  const config = transaction.entities.ofTypes('config').get()[0];
  if (!config) return;

  const currentDurationTicks = config.fields.durationTicks.value;
  if (typeof currentDurationTicks !== 'number' || currentDurationTicks < requiredDurationTicks) {
    transaction.update(config.fields.durationTicks, requiredDurationTicks);
  }
}

function getGeneratedTrackLengthBeats(track: GeneratedMidiTrack, fallbackBeats: number): number {
  return Math.max(...track.notes.map((note) => note.startBeat + note.durationBeats), fallbackBeats);
}

function colorIndexForRole(role: GeneratedMidiTrack['role']): number {
  const colorByRole: Partial<Record<GeneratedMidiTrack['role'], number>> = {
    bass: 4,
    harmony: 12,
    lead: 20,
    arp: 24,
    drums: 2
  };
  return colorByRole[role] ?? 12;
}

function beatsToTicks(beats: number): number {
  return Math.round(beats * Ticks.Beat);
}

/** Audiotool-native synthesizer device types that must be resolved via
 *  `presets.search()` rather than the GM-only `presets.getInstrument()`. */
const AUDIOTOOL_DEVICE_TYPES = new Set(['heisenberg', 'pulverisateur', 'bassline', 'tonematrix', 'space', 'machiniste', 'beatbox8', 'beatbox9']);
const PRESET_ID_PATTERN = /^(?:presets\/)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isLocationLike(value: unknown): value is NexusLocation {
  return typeof value === 'object' && value !== null && 'entityId' in value && typeof (value as { entityId?: unknown }).entityId === 'string';
}

function normalizePresetName(slug: string): string {
  const trimmed = slug.trim();
  if (PRESET_ID_PATTERN.test(trimmed) && !trimmed.toLowerCase().startsWith('presets/')) {
    return `presets/${trimmed}`;
  }
  return trimmed;
}

async function fetchPreset(client: AuthenticatedClient, slug: string) {
  if (PRESET_ID_PATTERN.test(slug)) {
    return client.presets.get(slug);
  }
  if (AUDIOTOOL_DEVICE_TYPES.has(slug)) {
    const results = await client.presets.search(slug as never);
    const preset = results[0];
    if (!preset) {
      throw new Error(`No presets found for Audiotool device "${slug}". Verify the device is available in your project.`);
    }
    return preset;
  }
  return client.presets.getInstrument(slug as never);
}

function chooseInstrumentSlug(request: SuggestedInstrumentRequest): string {
  const text = `${request.name} ${request.role} ${request.tags.join(' ')}`.toLowerCase();
  if (/drum|beat|kick|snare|hat|perc/.test(text)) return 'machiniste';
  if (/bass|sub|808|bassline/.test(text)) return request.role === 'bass' ? 'bassline' : 'pulverisateur';
  if (/pad|airy|chord|harmony|piano|organ|keys/.test(text)) return 'pulverisateur';
  return 'heisenberg';
}
