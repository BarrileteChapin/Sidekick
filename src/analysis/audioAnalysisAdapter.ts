export interface AudioFeatureSummary {
  timbreVector?: number[];
  estimatedKey?: string;
  estimatedBpm?: number;
}

export interface AudioAnalysisAdapter {
  analyzeAudio(buffer: AudioBuffer): Promise<AudioFeatureSummary>;
}

export class NoopAudioAnalysisAdapter implements AudioAnalysisAdapter {
  async analyzeAudio(): Promise<AudioFeatureSummary> {
    return {};
  }
}
