import { chatGenerationPlanSchema } from '../../src/chat/schemas';
import { NEXT_STEPS_EDUCATOR_PROMPT, nextStepsAnalysisSchema } from '../../src/nextSteps/schemas';

export async function createGeminiPlan(request: Request): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'GEMINI_API_KEY is not configured on the server.' }, { status: 503 });
  }

  const body = await request.json();
  const prompt = buildPrompt(body);

  const model = getGeminiFlashModel();
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });

  if (!response.ok) {
    return Response.json({ error: await readGeminiError(response, model) }, { status: response.status });
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  const parsed = chatGenerationPlanSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    return Response.json({ error: 'Gemini returned an invalid plan.' }, { status: 502 });
  }

  return Response.json(parsed.data);
}

export async function createGeminiNextSteps(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Use POST with multipart form data to analyze a reference audio file.' }, { status: 405 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'GEMINI_API_KEY is not configured on the server.' }, { status: 503 });
  }

  const formData = await request.formData();
  const audio = formData.get('audio');
  if (!isUploadedFile(audio)) {
    return Response.json({ error: 'Upload an audio file in the "audio" form field.' }, { status: 400 });
  }

  if (audio.size > 20 * 1024 * 1024) {
    return Response.json({ error: 'Choose an audio file smaller than 20 MB.' }, { status: 413 });
  }

  const bytes = Buffer.from(await audio.arrayBuffer());
  const model = getGeminiFlashModel();
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: buildNextStepsPrompt(audio.name) },
            {
              inlineData: {
                mimeType: audio.type || 'application/octet-stream',
                data: bytes.toString('base64')
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    return Response.json({ error: await readGeminiError(response, model) }, { status: response.status });
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  const parsedJson = parseJsonText(text);
  const parsed = nextStepsAnalysisSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return Response.json({ error: 'Gemini returned an invalid Next Steps analysis.' }, { status: 502 });
  }

  return Response.json(parsed.data);
}

function buildPrompt(input: unknown): string {
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
    '    "targetRole": "drums" | "bass" | "harmony" | "lead" | "pad" | "arp" | "vocal" | "fx" | "other" | "full",',
    '    "bpm": <number 40–240, use set_bpm value when present>,',
    '    "key": "<e.g. C, F#, Bb>",',
    '    "scaleMode": "major" | "minor" | "dorian" | "mixolydian" | "harmonic_minor",',
    '    "bars": 4 | 8 | 16 | 32,',
    '    "outputMode": "motif" | "motif_chords_bass" | "continuation" | "variation",',
    '    "density": "low" | "medium" | "high",  // optional',
    '    "energy": "low" | "medium" | "high",   // optional',
    '    "prompt": "<user message>"              // optional',
    '  },',
    '  "audiotoolActions": [  // optional — ordered list of project mutations',
    '    { "type": "set_bpm", "bpm": <number 40–240> },',
    '    { "type": "create_track", "name": "<display name>", "role": "<role>", "instrumentSlug": "<optional preset slug>" },',
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

function readInstrumentContext(input: unknown): {
  styleInstrumentByRole: Record<string, string>;
  projectInstrumentNames: string[];
  availableInstrumentSlugs: string[];
} {
  const record = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const context = (record.instrumentContext && typeof record.instrumentContext === 'object' ? record.instrumentContext : {}) as Record<string, unknown>;

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

function buildNextStepsPrompt(fileName: string): string {
  return [
    NEXT_STEPS_EDUCATOR_PROMPT,
    '',
    `Uploaded file name: ${fileName}`,
    '',
    'Return strict JSON with this shape:',
    '{',
    '  "educatorSummary": "short learning-focused explanation",',
    '  "analysis": {',
    '    "genreSubgenre": { "value": "...", "confidence": "observed|likely|uncertain", "note": "optional" },',
    '    "bpm": { "value": "...", "confidence": "observed|likely|uncertain", "note": "optional" },',
    '    "keyMood": { "value": "...", "confidence": "observed|likely|uncertain", "note": "optional" },',
    '    "loudnessEnergyCurve": { "value": "...", "confidence": "observed|likely|uncertain", "note": "optional" },',
    '    "beatGrid": { "value": "...", "confidence": "observed|likely|uncertain", "note": "optional" },',
    '    "sectionBoundaries": { "value": "...", "confidence": "observed|likely|uncertain", "note": "optional" },',
    '    "chordEstimate": { "value": "...", "confidence": "observed|likely|uncertain", "note": "optional" },',
    '    "instrumentStemEstimate": { "value": "...", "confidence": "observed|likely|uncertain", "note": "optional" },',
    '    "vocalInstrumentalDetection": { "value": "...", "confidence": "observed|likely|uncertain", "note": "optional" },',
    '    "arrangement": { "value": "...", "confidence": "observed|likely|uncertain", "note": "optional" },',
    '    "drums": { "value": "...", "confidence": "observed|likely|uncertain", "note": "optional" },',
    '    "bass": { "value": "...", "confidence": "observed|likely|uncertain", "note": "optional" },',
    '    "harmony": { "value": "...", "confidence": "observed|likely|uncertain", "note": "optional" },',
    '    "melody": { "value": "...", "confidence": "observed|likely|uncertain", "note": "optional" },',
    '    "vocalsSamples": { "value": "...", "confidence": "observed|likely|uncertain", "note": "optional" },',
    '    "soundDesign": { "value": "...", "confidence": "observed|likely|uncertain", "note": "optional" },',
    '    "transitions": { "value": "...", "confidence": "observed|likely|uncertain", "note": "optional" },',
    '    "energyArc": { "value": "...", "confidence": "observed|likely|uncertain", "note": "optional" }',
    '  },',
    '  "observed": ["directly supported facts from the audio"],',
    '  "likely": ["reasonable musical inferences"],',
    '  "uncertain": ["claims that may be wrong or underdetermined"],',
    '  "suggested": ["creative ideas for a new original track inspired by the reference"],',
    '  "productionRoadmap": [{ "title": "step title", "steps": ["practical Audiotool step"], "audiotoolFocus": "optional Audiotool area" }]',
    '}',
    '',
    'Keep roadmap steps practical for Audiotool. Do not include mixing or mastering advice. Do not identify exact plugins, presets, samples, lyrics, or melodies.'
  ].join('\n');
}

function parseJsonText(text: unknown): unknown {
  if (typeof text !== 'string') return null;

  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  try {
    return JSON.parse(fenced?.[1] ?? trimmed);
  } catch {
    return null;
  }
}

function getGeminiFlashModel(): string {
  const configured = process.env.GEMINI_FLASH_MODEL?.trim();
  if (!configured || configured === 'gemini-flash') {
    return 'gemini-flash-latest';
  }

  return configured;
}

async function readGeminiError(response: Response, model: string): Promise<string> {
  try {
    const body = await response.json();
    const message = body?.error?.message;
    if (typeof message === 'string' && message.length > 0) {
      return `Gemini Flash request failed for model "${model}": ${message}`;
    }
  } catch {
    // Fall through to a generic message if Gemini did not return JSON.
  }

  return `Gemini Flash request failed for model "${model}" with status ${response.status}.`;
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === 'object' &&
    value !== null &&
    'arrayBuffer' in value &&
    typeof value.arrayBuffer === 'function' &&
    'size' in value &&
    typeof value.size === 'number'
  );
}
