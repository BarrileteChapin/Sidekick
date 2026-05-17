import { parseChatGenerationPlan, type ChatGenerationPlan } from './schemas';

export interface GeminiPlanInput {
  message: string;
  sessionSummary: string;
  styleProfile: unknown;
  instrumentContext?: {
    styleInstrumentByRole: Record<string, string>;
    projectInstrumentNames: string[];
    availableInstrumentSlugs: string[];
  };
  userPreferences: unknown;
}

export interface GeminiAdapter {
  createPlan(input: GeminiPlanInput): Promise<ChatGenerationPlan>;
}

export class ProxyGeminiAdapter implements GeminiAdapter {
  constructor(private readonly endpoint = '/api/gemini/plan') {}

  async createPlan(input: GeminiPlanInput): Promise<ChatGenerationPlan> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });

    if (!response.ok) {
      throw new Error(`Gemini proxy failed with ${response.status}`);
    }

    return parseChatGenerationPlan(await response.json());
  }
}
