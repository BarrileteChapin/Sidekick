import { NEXT_STEPS_EDUCATOR_PROMPT, parseNextStepsAnalysis, type NextStepsAnalysis } from './schemas';
import { NEXT_STEPS_AUDIO_SIZE_LIMIT_BYTES, type NextStepsClient } from './NextStepsClient';

const DEFAULT_GEMINI_FLASH_MODEL = 'gemini-flash-latest';

export class BrowserNextStepsClient implements NextStepsClient {
  constructor(
    private readonly apiKey: string,
    private readonly model = DEFAULT_GEMINI_FLASH_MODEL
  ) {}

  async analyzeReference(file: File): Promise<NextStepsAnalysis> {
    if (file.size > NEXT_STEPS_AUDIO_SIZE_LIMIT_BYTES) {
      throw new Error('Choose an audio file smaller than 20 MB for Gemini analysis.');
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: buildNextStepsPrompt(file.name) },
              {
                inlineData: {
                  mimeType: file.type || 'application/octet-stream',
                  data: toBase64(bytes)
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
      throw new Error(await readGeminiError(response, this.model));
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = parseJsonText(text);
    if (!parsed) {
      throw new Error('Gemini returned an invalid Next Steps analysis.');
    }

    return parseNextStepsAnalysis(parsed);
  }
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

function toBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}