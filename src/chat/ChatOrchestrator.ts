import { buildSessionSummary } from '../analysis/sessionAnalyzer';
import type { SessionContext, TrackRole, UserProfile } from '../core/types';
import { MusicStyleRegistry, type MusicStyleProfile } from '../data/musicStyles';
import type { GenerationRequest } from '../generation/types';
import type { GeminiAdapter } from './GeminiAdapter';
import type { AudiotoolAction, ChatGenerationPlan } from './schemas';

export class ChatOrchestrator {
  constructor(
    private readonly styles = new MusicStyleRegistry(),
    private readonly gemini?: GeminiAdapter
  ) {}

  async createPlan(message: string, session: SessionContext, profile: UserProfile): Promise<ChatGenerationPlan> {
    const styleProfile = this.styles.getById(session.styleProfileId);
    const instrumentContext = buildInstrumentContext(session, styleProfile, this.styles.getAll());

    if (this.gemini) {
      try {
        const plan = await this.gemini.createPlan({
          message,
          sessionSummary: buildSessionSummary(session),
          styleProfile,
          instrumentContext,
          userPreferences: {
            preferredStyleIds: profile.preferredStyleIds,
            roleBias: profile.roleBias,
            tagBias: profile.tagBias
          }
        });
        return normalizeGeminiPlanInstruments(plan, message, this.styles, session.styleProfileId);
      } catch {
        return this.createFallbackPlan(message, session);
      }
    }

    return this.createFallbackPlan(message, session);
  }

  createFallbackPlan(message: string, session: SessionContext): ChatGenerationPlan {
    const styleProfile = this.styles.getById(detectStyleId(message, session.styleProfileId));
    const actions = detectAudiotoolActions(message, session);
    const bpmOverride = actions.find((a): a is Extract<AudiotoolAction, { type: 'set_bpm' }> => a.type === 'set_bpm')?.bpm;

    const request: GenerationRequest = {
      source: 'chat',
      styleProfileId: styleProfile.id,
      targetRole: detectTargetRole(message),
      bpm: bpmOverride ?? session.bpm,
      key: session.key ?? 'C',
      scaleMode: session.scaleMode ?? styleProfile.defaultScaleMode,
      bars: detectBars(message),
      outputMode: detectOutputMode(message),
      density: session.arrangementState.density,
      energy: session.arrangementState.energy,
      prompt: message
    };

    const isSetupOnly = actions.length > 0 && !hasMidiGenerationIntent(message);

    return {
      intent: isSetupOnly ? 'setup_project' : request.outputMode === 'variation' ? 'variation' : 'generate_midi',
      request: isSetupOnly ? undefined : request,
      audiotoolActions: actions.length > 0 ? actions : undefined,
      userFacingSummary: buildFallbackSummary(actions, request, styleProfile.name, isSetupOnly),
      safetyNotes: ['Gemini was not used; local rule-based planning handled this request.']
    };
  }
}

function detectTargetRole(message: string): TrackRole | 'full' {
  const lower = message.toLowerCase();
  if (lower.includes('bass')) return 'bass';
  if (lower.includes('chord') || lower.includes('harmony')) return 'harmony';
  if (lower.includes('drum')) return 'drums';
  if (lower.includes('arp')) return 'arp';
  if (lower.includes('pad')) return 'pad';
  if (lower.includes('full')) return 'full';
  return 'lead';
}

function detectBars(message: string): GenerationRequest['bars'] {
  const match = message.match(/\b(4|8|16|32)\s*-?\s*bar/i);
  const bars = Number(match?.[1]);
  return bars === 4 || bars === 8 || bars === 16 || bars === 32 ? bars : 8;
}

function detectOutputMode(message: string): GenerationRequest['outputMode'] {
  const lower = message.toLowerCase();
  if (lower.includes('continue')) return 'continuation';
  if (lower.includes('variation') || lower.includes('darker') || lower.includes('more uplifting')) return 'variation';
  if (lower.includes('chord') || lower.includes('bass')) return 'motif_chords_bass';
  return 'motif';
}

function detectStyleId(message: string, fallback?: string): string | undefined {
  const lower = message.toLowerCase();
  if (lower.includes('tech house')) return 'tech-house-bounce';
  if (lower.includes('deep house')) return 'deep-house-groove';
  if (lower.includes('melodic techno')) return 'melodic-minor-drive';
  if (lower.includes('festival')) return 'festival-drop-lead';
  if (lower.includes('pop')) return 'pop-house';
  return fallback;
}

function hasMidiGenerationIntent(message: string): boolean {
  return /generat|make|creat|write|add|build|give me|compose|play/.test(message.toLowerCase());
}

function detectAudiotoolActions(message: string, session: SessionContext): AudiotoolAction[] {
  const actions: AudiotoolAction[] = [];
  const lower = message.toLowerCase();

  // BPM change: "set bpm to 128", "at 130bpm", "change tempo to 120", "140 bpm"
  const bpmMatch = message.match(/\b(\d{2,3})\s*(?:bpm|BPM)\b/) ??
    message.match(/(?:set|change|make it|tempo|bpm)\s+(?:to\s+)?(\d{2,3})\b/i);
  if (bpmMatch) {
    const bpm = Number(bpmMatch[1]);
    if (bpm >= 40 && bpm <= 240 && bpm !== session.bpm) {
      actions.push({ type: 'set_bpm', bpm });
    }
  }

  // Track / instrument creation: "add a bass track", "create a lead synth", "new pad instrument"
  const trackCreateMatch = /\b(?:add|create|new|give me a?)\s+(?:a\s+)?(?:new\s+)?(?:(bass|lead|drum|chord|harmony|pad|arp|piano|synth|organ|guitar)\s+)?(?:track|instrument|lane|channel)\b/i.test(message) ||
    /\b(?:add|create|new|give me a?)\s+(?:a\s+)?(?:new\s+)?(bass|lead|drums?|chord|harmony|pad|arp)\b/i.test(message);
  if (trackCreateMatch) {
    const raw = detectTargetRole(message);
    const role: 'drums' | 'bass' | 'harmony' | 'lead' | 'pad' | 'arp' | 'vocal' | 'fx' | 'other' =
      raw === 'full' || raw === 'transition' ? 'lead' : raw;
    const name = detectInstrumentName(lower, role);
    const instrumentSlug = detectRequestedInstrumentSlug(lower);
    actions.push({
      type: 'create_track',
      name,
      role,
      ...(instrumentSlug ? { instrumentSlug } : {})
    });
  }

  // Auto-insert: "insert into project", "auto-insert", "put it in", "add it to the project"
  if (/auto.?insert|insert.{0,20}(?:into|in)\s+(?:the\s+)?project|put\s+it\s+in|add\s+it\s+to\s+(?:the\s+)?project/i.test(message)) {
    actions.push({ type: 'auto_insert', startBeat: 0 });
  }

  // Convenience: if creating a track AND generating MIDI, auto-insert makes sense
  if (trackCreateMatch && hasMidiGenerationIntent(lower) && !actions.some((a) => a.type === 'auto_insert')) {
    actions.push({ type: 'auto_insert', startBeat: 0 });
  }

  return actions;
}

function detectInstrumentName(lower: string, role: TrackRole): string {
  if (/organ/.test(lower)) return 'Organ';
  if (/piano/.test(lower)) return 'Piano';
  if (/pad|airy/.test(lower)) return 'Warm Pad';
  if (/bass|sub/.test(lower)) return 'Synth Bass';
  if (/lead|saw/.test(lower)) return 'Saw Lead';
  if (/drum|beat/.test(lower)) return 'Drums';
  if (/chord|harmony/.test(lower)) return 'Chords';
  if (/arp/.test(lower)) return 'Arp';
  const defaults: Partial<Record<TrackRole, string>> = {
    bass: 'Synth Bass', lead: 'Saw Lead', harmony: 'Chords',
    drums: 'Drums', pad: 'Warm Pad', arp: 'Arp'
  };
  return defaults[role] ?? 'Synth';
}

function detectRequestedInstrumentSlug(lower: string): string | undefined {
  const presetId = lower.match(/\b(?:presets\/)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i)?.[0];
  if (presetId) {
    return presetId.startsWith('presets/') ? presetId : `presets/${presetId}`;
  }
  if (/\bmachiniste\b|\bdrum machine\b/.test(lower)) return 'machiniste';
  if (/\bbeatbox[\s-]?9\b/.test(lower)) return 'beatbox9';
  if (/\bbeatbox[\s-]?8\b/.test(lower)) return 'beatbox8';
  if (/\bbassline\b/.test(lower)) return 'bassline';
  if (/\bheisenberg\b/.test(lower)) return 'heisenberg';
  if (/\bpulverisateur\b/.test(lower)) return 'pulverisateur';
  return undefined;
}

function buildInstrumentContext(session: SessionContext, styleProfile: MusicStyleProfile, allProfiles: MusicStyleProfile[]) {
  const styleInstrumentByRole: Record<string, string> = {};
  for (const [role, slug] of Object.entries(styleProfile.instruments ?? {})) {
    if (typeof slug === 'string' && slug.length > 0) {
      styleInstrumentByRole[role] = slug;
    }
  }

  const projectInstrumentNames = [...new Set(session.tracks.map((track) => track.instrumentName).filter((name): name is string => Boolean(name)))];
  const profileInstrumentSlugs = allProfiles
    .flatMap((profile) => Object.values(profile.instruments ?? {}))
    .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0);
  const fallbackInstrumentSlugs = ['heisenberg', 'pulverisateur', 'bassline', 'machiniste', 'beatbox8', 'beatbox9'];

  return {
    styleInstrumentByRole,
    projectInstrumentNames,
    // Put style/profile defaults first so Gemini prefers preset IDs where available.
    availableInstrumentSlugs: [...new Set([...profileInstrumentSlugs, ...projectInstrumentNames, ...fallbackInstrumentSlugs])]
  };
}

function normalizeGeminiPlanInstruments(
  plan: ChatGenerationPlan,
  message: string,
  styles: MusicStyleRegistry,
  sessionStyleId: string | undefined
): ChatGenerationPlan {
  if (!plan.audiotoolActions || plan.audiotoolActions.length === 0) {
    return plan;
  }

  const style = styles.getById(plan.request?.styleProfileId ?? sessionStyleId);
  const lowerMessage = message.toLowerCase();
  const nextActions = plan.audiotoolActions.map((action) => {
    if (action.type !== 'create_track') {
      return action;
    }

    const styleInstrument = style.instruments?.[action.role];
    if (!styleInstrument || !isPresetRef(styleInstrument)) {
      return action;
    }

    if (!action.instrumentSlug) {
      return { ...action, instrumentSlug: styleInstrument };
    }

    if (isPresetRef(action.instrumentSlug)) {
      return action;
    }

    // Respect explicit user requests for legacy slugs; otherwise prefer style preset IDs.
    if (lowerMessage.includes(action.instrumentSlug.toLowerCase())) {
      return action;
    }

    return { ...action, instrumentSlug: styleInstrument };
  });

  return { ...plan, audiotoolActions: nextActions };
}

function isPresetRef(value: string): boolean {
  return /^(?:presets\/)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function buildFallbackSummary(
  actions: AudiotoolAction[],
  request: GenerationRequest,
  styleName: string,
  isSetupOnly: boolean
): string {
  const parts: string[] = [];
  for (const action of actions) {
    if (action.type === 'set_bpm') parts.push(`set BPM to ${action.bpm}`);
    if (action.type === 'create_track') parts.push(`create "${action.name}" track`);
    if (action.type === 'auto_insert') parts.push('auto-insert MIDI');
  }
  if (!isSetupOnly) {
    parts.push(`generate ${request.bars}-bar ${request.targetRole} (${styleName})`);
  }
  return `Offline plan: ${parts.join(', ')}.`;
}
