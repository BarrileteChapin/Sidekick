import { z } from 'zod';

const generationRequestSchema = z.object({
  source: z.enum(['button', 'chat']),
  styleProfileId: z.string(),
  targetRole: z.union([z.enum(['drums', 'bass', 'harmony', 'lead', 'pad', 'arp', 'vocal', 'fx', 'transition', 'other']), z.literal('full')]),
  bpm: z.number().min(40).max(240),
  key: z.string(),
  scaleMode: z.enum(['major', 'minor', 'dorian', 'mixolydian', 'harmonic_minor']),
  bars: z.union([z.literal(4), z.literal(8), z.literal(16), z.literal(32)]),
  outputMode: z.enum(['motif', 'motif_chords_bass', 'motif_chords_bass_drums', 'continuation', 'variation']),
  density: z.enum(['low', 'medium', 'high']).optional(),
  energy: z.enum(['low', 'medium', 'high']).optional(),
  prompt: z.string().optional(),
  seedTrackId: z.string().optional()
});

/**
 * Discrete actions the chat composer can ask Sidekick to perform inside the
 * connected Audiotool project — independently of MIDI generation.
 *
 * - set_bpm       : change the project tempo
 * - create_track  : add an instrument + note lane to the timeline
 * - auto_insert   : immediately insert the generated MIDI after creation
 */
export const audiotoolActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('set_bpm'),
    bpm: z.number().min(40).max(240)
  }),
  z.object({
    type: z.literal('create_track'),
    name: z.string(),
    role: z.enum(['drums', 'bass', 'harmony', 'lead', 'pad', 'arp', 'vocal', 'fx', 'other']),
    /** Optional Audiotool preset reference (for example `presets/<uuid>` or a legacy instrument slug). */
    instrumentSlug: z.string().optional()
  }),
  z.object({
    type: z.literal('auto_insert'),
    /** Beat offset where the region should start (0 = bar 1 beat 1). */
    startBeat: z.number().min(0).optional()
  })
]);

export type AudiotoolAction = z.infer<typeof audiotoolActionSchema>;

export const chatGenerationPlanSchema = z.object({
  intent: z.enum(['generate_midi', 'variation', 'continue_track', 'setup_project', 'suggestion', 'clarifying_question']),
  request: generationRequestSchema.optional(),
  /**
   * Ordered list of Audiotool project mutations the composer wants to apply.
   * Executed before MIDI insertion so tracks exist when notes land.
   */
  audiotoolActions: z.array(audiotoolActionSchema).optional(),
  userFacingSummary: z.string(),
  clarifyingQuestion: z.string().optional(),
  safetyNotes: z.array(z.string()).optional()
});

export type ChatGenerationPlan = z.infer<typeof chatGenerationPlanSchema>;

export function parseChatGenerationPlan(input: unknown): ChatGenerationPlan {
  return chatGenerationPlanSchema.parse(input);
}
