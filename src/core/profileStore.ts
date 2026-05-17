import type { FeedbackEvent, ItemFeatures, UserProfile } from './types';
import { createDefaultProfile } from './types';
import type { GeneratedMidi } from '../generation/types';

const storageKey = 'sidekick:user-profile:v1';
const positiveFeedback = new Set<FeedbackEvent['type']>(['accepted', 'downloaded', 'inserted', 'auditioned']);
const negativeFeedback = new Set<FeedbackEvent['type']>(['ignored', 'rejected']);

export async function loadProfile(userId = 'local-user'): Promise<UserProfile> {
  if (typeof localStorage === 'undefined') {
    return createDefaultProfile(userId);
  }

  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return createDefaultProfile(userId);
  }

  try {
    return { ...createDefaultProfile(userId), ...JSON.parse(raw) } as UserProfile;
  } catch {
    return createDefaultProfile(userId);
  }
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem(storageKey, JSON.stringify(profile));
}

export function applyFeedback(profile: UserProfile, feedback: FeedbackEvent, source: ItemFeatures | GeneratedMidi): UserProfile {
  const next: UserProfile = {
    ...profile,
    roleBias: { ...profile.roleBias },
    tagBias: { ...profile.tagBias },
    preferredStyleIds: [...profile.preferredStyleIds],
    history: [...profile.history, feedback].slice(-100)
  };

  const weight = positiveFeedback.has(feedback.type) ? 0.18 : negativeFeedback.has(feedback.type) ? -0.14 : 0.05;
  const isGeneratedMidi = 'tracks' in source;
  const roles = isGeneratedMidi ? source.tracks.map((track) => track.role) : [source.role];
  const tags = isGeneratedMidi ? [source.request.styleProfileId, source.request.targetRole] : source.tags;
  const styleIds = isGeneratedMidi ? [source.request.styleProfileId] : source.styleProfileIds ?? [];

  roles.forEach((role) => {
    next.roleBias[role] = clampBias((next.roleBias[role] ?? 0) + weight);
  });

  tags.filter(Boolean).forEach((tag) => {
    next.tagBias[tag] = clampBias((next.tagBias[tag] ?? 0) + weight);
  });

  if (weight > 0) {
    styleIds.forEach((styleId) => {
      if (!next.preferredStyleIds.includes(styleId)) {
        next.preferredStyleIds.push(styleId);
      }
    });
  }

  if ('audioVector' in source && source.audioVector) {
    next.timbreCentroid = movingAverage(next.timbreCentroid, source.audioVector);
  }

  return next;
}

function clampBias(value: number): number {
  return Number(Math.max(-1, Math.min(1, value)).toFixed(3));
}

function movingAverage(current: number[] | undefined, incoming: number[]): number[] {
  if (!current || current.length !== incoming.length) {
    return incoming;
  }
  return incoming.map((value, index) => Number((current[index] * 0.8 + value * 0.2).toFixed(4)));
}
