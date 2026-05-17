import { MusicStyleRegistry } from '../data/musicStyles';
import type { SessionContext } from '../core/types';
import { generateArrangementTracks } from './arrangementGenerator';
import { writeMidi } from './midiWriter';
import type { GeneratedMidi, GenerationRequest } from './types';
import type { MagentaAdapter } from './magentaAdapter';

export class GenerationService {
  constructor(
    private readonly styles = new MusicStyleRegistry(),
    private readonly magenta?: MagentaAdapter
  ) {}

  createRequestFromSession(
    session: SessionContext,
    overrides: Partial<GenerationRequest> = {}
  ): GenerationRequest {
    const styleProfileId = overrides.styleProfileId ?? session.styleProfileId ?? this.styles.getDefault().id;
    const style = this.styles.getById(styleProfileId);

    return {
      source: overrides.source ?? 'button',
      styleProfileId,
      targetRole: overrides.targetRole ?? 'full',
      bpm: resolveBpm(session, style, overrides),
      key: overrides.key ?? session.key ?? 'C',
      scaleMode: overrides.scaleMode ?? session.scaleMode ?? style.defaultScaleMode,
      bars: overrides.bars ?? 8,
      outputMode: overrides.outputMode ?? 'motif_chords_bass',
      density: overrides.density ?? session.arrangementState.density,
      energy: overrides.energy ?? session.arrangementState.energy,
      prompt: overrides.prompt,
      seedTrackId: overrides.seedTrackId
    };
  }

  async generate(request: GenerationRequest): Promise<GeneratedMidi> {
    const style = this.styles.getById(request.styleProfileId);
    let tracks = generateArrangementTracks(request, style);

    if ((request.outputMode === 'continuation' || request.outputMode === 'variation') && this.magenta) {
      tracks = await Promise.race([
        this.magenta.generateContinuation(request, tracks),
        new Promise<typeof tracks>((resolve) => setTimeout(() => resolve(tracks), 2500))
      ]);
    }

    const midiBytes = writeMidi(request, tracks);
    return {
      id: crypto.randomUUID(),
      name: `${style.name} ${request.targetRole === 'full' ? 'Idea' : request.targetRole}`,
      request,
      tracks,
      midiBytes,
      explanation: [
        `Generated ${request.bars} bars at ${request.bpm} BPM in ${request.key} ${request.scaleMode}.`,
        `Used ${style.name} phrasing with ${Math.round(style.swing * 100)}% swing.`,
        'MIDI is ready to preview, download, or explicitly insert if the host supports it.'
      ],
      createdAt: Date.now()
    };
  }
}

function resolveBpm(session: SessionContext, style: ReturnType<MusicStyleRegistry['getById']>, overrides: Partial<GenerationRequest>): number {
  if (typeof overrides.bpm === 'number') return overrides.bpm;

  // When the caller explicitly selects a style (Generate Music panel), prefer
  // that profile's tempo guidance over the incoming session BPM.
  if (typeof overrides.styleProfileId === 'string' && overrides.styleProfileId.length > 0) {
    return style.defaultBpm;
  }

  const [minBpm, maxBpm] = style.bpmRange;
  if (session.bpm >= minBpm && session.bpm <= maxBpm) {
    return session.bpm;
  }

  return style.defaultBpm;
}
