import { parseChatGenerationPlan, type ChatGenerationPlan } from './schemas';
import type { GeminiAdapter, GeminiPlanInput } from './GeminiAdapter';

const DEFAULT_GEMINI_FLASH_MODEL = 'gemini-flash-latest';

export class BrowserGeminiAdapter implements GeminiAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly model = DEFAULT_GEMINI_FLASH_MODEL
  ) {}

  async createPlan(input: GeminiPlanInput): Promise<ChatGenerationPlan> {
    const prompt = buildPrompt(input);
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    if (!response.ok) {
      throw new Error(await readGeminiError(response, this.model));
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = parseJsonText(text);
    if (!parsed) {
      throw new Error('Gemini returned an invalid plan.');
    }

    return parseChatGenerationPlan(parsed);
  }
}

function buildPrompt(input: GeminiPlanInput): string {
  const instrumentContext = readInstrumentContext(input);
  const styleRoleHints =
    Object.entries(instrumentContext.styleInstrumentByRole)
      .map(([role, slug]) => `${role}: ${slug}`)
      .join(', ') || 'none';
  const projectInstrumentsHint = instrumentContext.projectInstrumentNames.join(', ') || 'none';
  const availableSlugsHint = instrumentContext.availableInstrumentSlugs.join(', ') || 'none';

  return [
    'You are Sidekick, an AI music composition assistant for Audiotool.',
    'Return strict JSON matching the ChatGenerationPlan schema below. Do not create raw MIDI bytes.',
    '',
    '=== ChatGenerationPlan schema ===',
    '{',
    '  "intent": "generate_midi" | "variation" | "continue_track" | "setup_project" | "suggestion" | "clarifying_question",',
    '  "request": {   // omit only when intent is "setup_project" or "clarifying_question"',
    '    "source": "chat",',
    '    "styleProfileId": "<id from styleProfile>",',
    '    "targetRole": "drums" | "bass" | "harmony" | "lead" | "pad" | "arp" | "vocal" | "fx" | "transition" | "other" | "full",',
    '    "bpm": <number 40-240, use set_bpm value when present>,',
    '    "key": "<e.g. C, F#, Bb>",',
    '    "scaleMode": "major" | "minor" | "dorian" | "mixolydian" | "harmonic_minor",',
    '    "bars": 4 | 8 | 16 | 32,',
    '    "outputMode": "motif" | "motif_chords_bass" | "motif_chords_bass_drums" | "continuation" | "variation",',
    '    "density": "low" | "medium" | "high",  // optional',
    '    "energy": "low" | "medium" | "high",   // optional',
    '    "prompt": "<user message>"                // optional',
    '  },',
    '  "audiotoolActions": [  // optional - ordered list of project mutations',
    '    { "type": "set_bpm", "bpm": <number 40-240> },',
    '    { "type": "create_track", "name": "<display name>", "role": "drums|bass|harmony|lead|pad|arp|vocal|fx|other", "instrumentSlug": "<optional preset slug>" },',
    '    { "type": "auto_insert", "startBeat": <number, default 0> }',
    '  ],',
    '  "userFacingSummary": "<one sentence shown to the user>",',
    '  "clarifyingQuestion": "<only when intent is clarifying_question>",',
    '  "safetyNotes": ["<optional notes about what Sidekick is doing>"]',
    '}',
    '',
    '=== audiotoolActions guidance ===',
    '- Use "set_bpm" when the user mentions a specific BPM or asks to change the tempo.',
    '- Use "create_track" when the user asks to add a new instrument or track to the project.',
    `  Available instrument slugs in this session: ${availableSlugsHint}.`,
    '- Use "auto_insert" when the user says to insert, put, or add the MIDI into the project.',
    '- When "create_track" and "auto_insert" are both present, generated MIDI will land in the new track.',
    '- Omit "audiotoolActions" when the user only wants to generate MIDI without changing the project.',
    '',
    '=== instrument awareness context ===',
    `- Style role defaults: ${styleRoleHints}.`,
    `- Detected project instruments: ${projectInstrumentsHint}.`,
    '- For create_track, set instrumentSlug whenever a suitable slug is available.',
    '- Prefer style role defaults first, then detected project instruments, then other available slugs.',
    '- If the user requests an unavailable instrument, pick the closest available slug and mention it in safetyNotes.',
    '',
    `Input: ${JSON.stringify(input)}`
  ].join('\n');
}

function readInstrumentContext(input: GeminiPlanInput): {
  styleInstrumentByRole: Record<string, string>;
  projectInstrumentNames: string[];
  availableInstrumentSlugs: string[];
} {
  const context = (input.instrumentContext ?? {}) as {
    styleInstrumentByRole?: unknown;
    projectInstrumentNames?: unknown;
    availableInstrumentSlugs?: unknown;
  };

  return {
    styleInstrumentByRole: toStringRecord(context.styleInstrumentByRole),
    projectInstrumentNames: toStringArray(context.projectInstrumentNames),
    availableInstrumentSlugs: toStringArray(context.availableInstrumentSlugs)
  };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0))];
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0
  );
  return Object.fromEntries(entries);
}

function parseJsonText(text: unknown): unknown | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  try {
    return JSON.parse(fenced?.[1] ?? trimmed);
  } catch {
    return null;
  }
}

async function readGeminiError(response: Response, model: string): Promise<string> {
  try {
    const body = await response.json();
    const message = body?.error?.message;
    if (typeof message === 'string' && message.length > 0) {
      return `Gemini Flash request failed for model "${model}": ${message}`;
    }
  } catch {
    // Use fallback below.
  }

  return `Gemini Flash request failed for model "${model}" with status ${response.status}.`;
}