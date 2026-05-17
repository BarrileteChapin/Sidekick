import type { SessionTrack, TrackRole } from '../core/types';

export function findCompatibleNoteTrack(
  tracks: SessionTrack[],
  role: TrackRole,
  expectedInstrumentSlug?: string,
  excludedTrackIds = new Set<string>()
): SessionTrack | undefined {
  const candidates = tracks.filter((track) => !excludedTrackIds.has(track.id) && (track.tags?.includes('noteTrack') ?? track.hasMidi));
  const roleMatches = candidates.filter((track) => track.role === role);

  if (roleMatches.length > 0) {
    if (expectedInstrumentSlug) {
      // Never steal a lane from another role just because the preset string matched:
      // wrong-role matches were routing multiple MIDI layers onto one instrument.
      return roleMatches.find((track) => hasInstrumentSlug(track, expectedInstrumentSlug)) ?? roleMatches[0];
    }
    return roleMatches[0];
  }

  // Fallback: If no lane of the requested role is available, try to find an unassigned lane
  // to avoid overwriting a completely different instrument.
  const unassignedMatches = candidates.filter((track) => !track.role || track.role === 'other');
  return unassignedMatches[0];
}

function hasInstrumentSlug(track: SessionTrack, instrumentSlug: string): boolean {
  return track.instrumentName === instrumentSlug || Boolean(track.tags?.includes(instrumentSlug));
}

export interface InsertionPreviewRow {
  generatedRole: string;
  summary: string;
  detail?: string;
}

export function planDistributedMidiInsertion(options: {
  generatedTracks: { role: TrackRole; name: string }[];
  noteTracks: SessionTrack[];
  instruments?: Partial<Record<TrackRole, string>>;
  canAutoCreateInstruments: boolean;
}): InsertionPreviewRow[] {
  const preview: InsertionPreviewRow[] = [];
  const usedTrackIds = new Set<string>();

  for (const track of options.generatedTracks) {
    const expectedInstrumentSlug = options.instruments?.[track.role];
    let target = findCompatibleNoteTrack(options.noteTracks, track.role, expectedInstrumentSlug, usedTrackIds);

    // Prefer reusing an unused existing lane before provisioning a new instrument.
    if (!target) {
      target = options.noteTracks.find((candidate) => !usedTrackIds.has(candidate.id));
    }

    if (target) {
      usedTrackIds.add(target.id);
      
      let summary = `Use existing: ${target.name}`;
      if (target.role && target.role !== 'other' && target.role !== track.role) {
        summary = `WARNING: Overwriting ${target.role} track (${target.name})`;
      }

      preview.push({
        generatedRole: track.role,
        summary,
        detail: expectedInstrumentSlug && hasInstrumentSlug(target, expectedInstrumentSlug)
          ? `Matches requested style preset (${expectedInstrumentSlug})`
          : `Lane role: ${target.role || 'unassigned'}`
      });
    } else {
      if (options.canAutoCreateInstruments) {
        preview.push({
          generatedRole: track.role,
          summary: `Will create new ${track.role} track`,
          detail: expectedInstrumentSlug ? `Preset: ${expectedInstrumentSlug}` : `Standard ${track.role} track`
        });
      } else {
        preview.push({
          generatedRole: track.role,
          summary: `Missing ${track.role} track`,
          detail: `No compatible track available.`
        });
      }
    }
  }

  return preview;
}

export function selectDistributedTargetTrackIds(options: {
  generatedTracks: { role: TrackRole; name: string }[];
  noteTracks: SessionTrack[];
  preferredTracks?: SessionTrack[];
  instruments?: Partial<Record<TrackRole, string>>;
}): string[] {
  const preferredCandidates = options.preferredTracks ?? [];
  const preferredTrackIds = new Set(preferredCandidates.map((track) => track.id));
  const fallbackCandidates = options.noteTracks.filter((track) => !preferredTrackIds.has(track.id));
  const usedTrackIds = new Set<string>();
  const targetTrackIds: string[] = [];

  for (const track of options.generatedTracks) {
    const expectedInstrumentSlug = options.instruments?.[track.role];
    let target = findCompatibleNoteTrack(preferredCandidates, track.role, expectedInstrumentSlug, usedTrackIds);

    if (!target) {
      target = preferredCandidates.find((candidate) => !usedTrackIds.has(candidate.id));
    }
    if (!target) {
      target = findCompatibleNoteTrack(fallbackCandidates, track.role, expectedInstrumentSlug, usedTrackIds);
    }
    if (!target) {
      target = fallbackCandidates.find((candidate) => !usedTrackIds.has(candidate.id));
    }
    if (!target) {
      break;
    }

    usedTrackIds.add(target.id);
    targetTrackIds.push(target.id);
  }

  return targetTrackIds;
}

export function formatPresetLabel(instrumentName: string | undefined): string {
  if (!instrumentName) return '';
  return instrumentName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
