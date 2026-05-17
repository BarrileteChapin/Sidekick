import { z } from 'zod';

export const NEXT_STEPS_EDUCATOR_PROMPT =
  "You are a music-production educator. Analyze the uploaded track as a reference for learning, not copying. Do not give mixing/mastering advice. Break down the track's creative elements: genre/subgenre, BPM feel, key/mood, arrangement, drums, bass, harmony, melody, vocals/samples, sound design, transitions, and energy arc. Then give a practical step-by-step guide for producing a new original track inspired by it. Separate claims into Observed, Likely, Uncertain, and Suggested. Do not claim exact plugins, presets, samples, lyrics, or melodies.";

export const nextStepsConfidenceSchema = z.enum(['observed', 'likely', 'uncertain']);

export const nextStepsClaimSchema = z.object({
  value: z.string(),
  confidence: nextStepsConfidenceSchema,
  note: z.string().optional()
});

export const nextStepsMirAnalysisSchema = z
  .object({
    genreSubgenre: nextStepsClaimSchema.optional(),
    bpm: nextStepsClaimSchema.optional(),
    keyMood: nextStepsClaimSchema.optional(),
    loudnessEnergyCurve: nextStepsClaimSchema.optional(),
    beatGrid: nextStepsClaimSchema.optional(),
    sectionBoundaries: nextStepsClaimSchema.optional(),
    chordEstimate: nextStepsClaimSchema.optional(),
    instrumentStemEstimate: nextStepsClaimSchema.optional(),
    vocalInstrumentalDetection: nextStepsClaimSchema.optional(),
    arrangement: nextStepsClaimSchema.optional(),
    drums: nextStepsClaimSchema.optional(),
    bass: nextStepsClaimSchema.optional(),
    harmony: nextStepsClaimSchema.optional(),
    melody: nextStepsClaimSchema.optional(),
    vocalsSamples: nextStepsClaimSchema.optional(),
    soundDesign: nextStepsClaimSchema.optional(),
    transitions: nextStepsClaimSchema.optional(),
    energyArc: nextStepsClaimSchema.optional()
  })
  .default({});

export const productionRoadmapStepSchema = z.object({
  title: z.string(),
  steps: z.array(z.string()).min(1),
  audiotoolFocus: z.string().optional()
});

export const nextStepsAnalysisSchema = z.object({
  educatorSummary: z.string(),
  analysis: nextStepsMirAnalysisSchema,
  observed: z.array(z.string()).default([]),
  likely: z.array(z.string()).default([]),
  uncertain: z.array(z.string()).default([]),
  suggested: z.array(z.string()).default([]),
  productionRoadmap: z.array(productionRoadmapStepSchema).min(1)
});

export type NextStepsAnalysis = z.infer<typeof nextStepsAnalysisSchema>;
export type NextStepsClaim = z.infer<typeof nextStepsClaimSchema>;

export function parseNextStepsAnalysis(input: unknown): NextStepsAnalysis {
  return nextStepsAnalysisSchema.parse(input);
}
