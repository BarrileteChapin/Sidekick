import { parseNextStepsAnalysis, type NextStepsAnalysis } from './schemas';

export const NEXT_STEPS_AUDIO_SIZE_LIMIT_BYTES = 20 * 1024 * 1024;

export interface NextStepsClient {
  analyzeReference(file: File): Promise<NextStepsAnalysis>;
}

export class DisabledNextStepsClient implements NextStepsClient {
  constructor(private readonly reason: string) {}

  async analyzeReference(): Promise<NextStepsAnalysis> {
    throw new Error(this.reason);
  }
}

export class ProxyNextStepsClient implements NextStepsClient {
  constructor(private readonly endpoint = '/api/gemini/next-steps') {}

  async analyzeReference(file: File): Promise<NextStepsAnalysis> {
    if (file.size > NEXT_STEPS_AUDIO_SIZE_LIMIT_BYTES) {
      throw new Error('Choose an audio file smaller than 20 MB for Gemini analysis.');
    }

    const formData = new FormData();
    formData.append('audio', file);

    const response = await fetch(this.endpoint, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await readError(response);
      throw new Error(error ?? `Gemini Flash analysis failed with ${response.status}`);
    }

    return parseNextStepsAnalysis(await response.json());
  }
}

async function readError(response: Response): Promise<string | null> {
  try {
    const body = await response.json();
    return typeof body?.error === 'string' ? body.error : null;
  } catch {
    return null;
  }
}
