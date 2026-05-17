import { MusicStyleRegistry } from '../data/musicStyles';
import { trackRoles, type EnergyLevel, type ScaleMode, type SessionContext, type SessionTrack, type TrackRole } from '../core/types';

const essentialRoles: TrackRole[] = ['drums', 'bass', 'harmony', 'lead', 'fx', 'transition'];

export interface SessionAnalysis {
  session: SessionContext;
  missingRoles: TrackRole[];
  weakRoles: TrackRole[];
  summary: string;
}

export class SessionAnalyzer {
  constructor(private readonly styles = new MusicStyleRegistry()) {}

  analyze(rawSession: SessionContext): SessionAnalysis {
    const tracks = rawSession.tracks.map((track) => ({ ...track, role: track.role ?? inferTrackRole(track) }));
    const completionState = buildCompletionState(tracks, rawSession.completionState);
    const tags = tracks.flatMap((track) => track.tags ?? []);
    const style = rawSession.styleProfileId
      ? this.styles.getById(rawSession.styleProfileId)
      : this.styles.findBestBySession({ bpm: rawSession.bpm, tags });

    const session: SessionContext = {
      ...rawSession,
      tracks,
      key: rawSession.key ?? inferKey(tracks),
      scaleMode: rawSession.scaleMode ?? inferScaleMode(tags, style.defaultScaleMode),
      styleProfileId: style.id,
      arrangementState: {
        ...rawSession.arrangementState,
        density: rawSession.arrangementState.density ?? estimateDensity(tracks),
        energy: rawSession.arrangementState.energy ?? estimateEnergy(tracks)
      },
      completionState
    };

    const missingRoles = essentialRoles.filter((role) => !completionState[role]);
    const weakRoles = tracks
      .filter((track) => essentialRoles.includes(track.role) && (track.clipCount ?? 0) <= 1)
      .map((track) => track.role);

    return {
      session,
      missingRoles,
      weakRoles: [...new Set(weakRoles)],
      summary: buildSessionSummary(session, missingRoles)
    };
  }
}

export function buildSessionSummary(session: SessionContext, missingRoles = essentialRoles.filter((role) => !session.completionState[role])): string {
  const trackSummary =
    session.tracks
      .map((track) => `${track.name} (${track.role}${track.instrumentName ? `, ${track.instrumentName}` : ''})`)
      .join(', ') || 'no tracks';
  return [
    `${session.bpm} BPM`,
    `${session.key ?? 'unknown key'} ${session.scaleMode ?? 'unknown mode'}`,
    `style ${session.styleProfileId ?? 'unknown'}`,
    `${session.arrangementState.section ?? 'unknown'} section`,
    `tracks: ${trackSummary}`,
    `missing: ${missingRoles.join(', ') || 'none'}`
  ].join('; ');
}

function buildCompletionState(tracks: SessionTrack[], existing: SessionContext['completionState']): SessionContext['completionState'] {
  const next: SessionContext['completionState'] = { ...existing };
  trackRoles.forEach((role) => {
    if (next[role] === undefined) {
      next[role] = tracks.some((track) => track.role === role && ((track.clipCount ?? 0) > 0 || track.hasMidi || track.hasAudio));
    }
  });
  return next;
}

function inferTrackRole(track: SessionTrack): TrackRole {
  const text = `${track.name} ${track.instrumentName ?? ''} ${(track.tags ?? []).join(' ')}`.toLowerCase();
  if (/kick|snare|hat|drum|perc/.test(text)) return 'drums';
  if (/bass|sub|808/.test(text)) return 'bass';
  if (/chord|piano|keys|organ/.test(text)) return 'harmony';
  if (/lead|hook|melody/.test(text)) return 'lead';
  if (/pad|string/.test(text)) return 'pad';
  if (/arp|sequence/.test(text)) return 'arp';
  if (/vocal|vox/.test(text)) return 'vocal';
  if (/fx|riser|impact|transition/.test(text)) return 'fx';
  return 'other';
}

function inferKey(tracks: SessionTrack[]): string | null {
  const firstNoteRange = tracks.find((track) => track.noteRange)?.noteRange;
  if (!firstNoteRange) return null;
  const rootPitch = firstNoteRange[0] % 12;
  return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][rootPitch];
}

function inferScaleMode(tags: string[], fallback: ScaleMode): ScaleMode {
  const lowerTags = tags.map((tag) => tag.toLowerCase());
  if (lowerTags.includes('major') || lowerTags.includes('sunny')) return 'major';
  if (lowerTags.includes('dorian')) return 'dorian';
  if (lowerTags.includes('dark') || lowerTags.includes('minor')) return 'minor';
  return fallback;
}

function estimateDensity(tracks: SessionTrack[]): EnergyLevel {
  const clipCount = tracks.reduce((sum, track) => sum + (track.clipCount ?? 0), 0);
  if (clipCount >= 8) return 'high';
  if (clipCount >= 3) return 'medium';
  return 'low';
}

function estimateEnergy(tracks: SessionTrack[]): EnergyLevel {
  if (tracks.some((track) => track.tags?.some((tag) => ['drop', 'rave', 'drive'].includes(tag)))) return 'high';
  return estimateDensity(tracks);
}
