import rawProfiles from './profiles.json';
import { isMusicStyleProfile, type MusicStyleProfile } from './schema';

export class MusicStyleRegistry {
  private readonly profiles: MusicStyleProfile[];

  constructor(profiles: MusicStyleProfile[] = loadSeedProfiles()) {
    this.profiles = profiles;
  }

  getAll(): MusicStyleProfile[] {
    return [...this.profiles];
  }

  getById(id: string | undefined): MusicStyleProfile {
    return this.profiles.find((profile) => profile.id === id) ?? this.getDefault();
  }

  getDefault(): MusicStyleProfile {
    return this.profiles[0];
  }

  findBestBySession(input: { bpm: number; tags: string[] }): MusicStyleProfile {
    return [...this.profiles].sort((left, right) => {
      const leftScore = scoreProfile(left, input);
      const rightScore = scoreProfile(right, input);
      return rightScore - leftScore;
    })[0];
  }
}

export function loadSeedProfiles(): MusicStyleProfile[] {
  const profiles = (rawProfiles as unknown[]).filter(isMusicStyleProfile);
  if (profiles.length === 0) {
    throw new Error('No valid music style profiles were loaded.');
  }
  return profiles;
}

function scoreProfile(profile: MusicStyleProfile, input: { bpm: number; tags: string[] }): number {
  const [minBpm, maxBpm] = profile.bpmRange;
  const bpmScore = input.bpm >= minBpm && input.bpm <= maxBpm ? 3 : Math.max(0, 2 - Math.abs(profile.defaultBpm - input.bpm) / 8);
  const tagScore = input.tags.reduce((score, tag) => score + (profile.tags.includes(tag.toLowerCase()) ? 1 : 0), 0);
  return bpmScore + tagScore;
}

export type { MusicStyleProfile };
