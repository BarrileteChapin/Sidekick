import { describe, expect, it } from 'vitest';
import { ChatOrchestrator } from '../chat/ChatOrchestrator';
import type { GeminiAdapter, GeminiPlanInput } from '../chat/GeminiAdapter';
import { parseChatGenerationPlan } from '../chat/schemas';
import { createDefaultProfile } from '../core/types';
import { mockSessions } from '../nexus/MockNexusClient';

describe('chat orchestration', () => {
  it('creates a fallback generation plan without Gemini', async () => {
    const plan = await new ChatOrchestrator().createPlan('Make an 8-bar deep house bassline', mockSessions.DeepHouseSketch, createDefaultProfile());
    expect(plan.intent).toBe('generate_midi');
    expect(plan.request?.targetRole).toBe('bass');
    expect(plan.request?.bars).toBe(8);
  });

  it('validates structured Gemini plans', () => {
    expect(() =>
      parseChatGenerationPlan({
        intent: 'generate_midi',
        userFacingSummary: 'Generate a lead.',
        request: {
          source: 'chat',
          styleProfileId: 'festival-drop-lead',
          targetRole: 'lead',
          bpm: 128,
          key: 'G',
          scaleMode: 'major',
          bars: 8,
          outputMode: 'motif'
        }
      })
    ).not.toThrow();
  });

  it('detects requested instrument slugs in fallback mode', async () => {
    const plan = await new ChatOrchestrator().createPlan(
      'Create a bass track with bassline and insert it into the project.',
      mockSessions.DeepHouseSketch,
      createDefaultProfile()
    );
    const createTrackAction = plan.audiotoolActions?.find((action) => action.type === 'create_track');
    expect(createTrackAction?.type).toBe('create_track');
    if (createTrackAction?.type === 'create_track') {
      expect(createTrackAction.instrumentSlug).toBe('bassline');
    }
  });

  it('passes instrument context to Gemini planner input', async () => {
    const capturedInput: { value?: GeminiPlanInput } = {};
    const gemini: GeminiAdapter = {
      async createPlan(input) {
        capturedInput.value = input;
        return parseChatGenerationPlan({
          intent: 'generate_midi',
          userFacingSummary: 'Generate a bassline.',
          request: {
            source: 'chat',
            styleProfileId: 'deep-house-groove',
            targetRole: 'bass',
            bpm: 122,
            key: 'A',
            scaleMode: 'minor',
            bars: 8,
            outputMode: 'motif_chords_bass'
          }
        });
      }
    };

    await new ChatOrchestrator(undefined, gemini).createPlan('Create a bassline.', mockSessions.DeepHouseSketch, createDefaultProfile());
    const instrumentContext = capturedInput.value?.instrumentContext;
    expect(instrumentContext).toBeDefined();
    expect(instrumentContext?.availableInstrumentSlugs).toContain('heisenberg');
    expect(instrumentContext?.styleInstrumentByRole?.bass).toBeDefined();
    expect(Array.isArray(instrumentContext?.projectInstrumentNames)).toBe(true);
  });

  it('accepts explicit preset IDs in fallback mode track creation requests', async () => {
    const presetId = 'presets/36ebd66f-7c40-5958-a56a-b16b124cea6b';
    const plan = await new ChatOrchestrator().createPlan(
      `Create a bass track with ${presetId} and insert it into the project.`,
      mockSessions.DeepHouseSketch,
      createDefaultProfile()
    );
    const createTrackAction = plan.audiotoolActions?.find((action) => action.type === 'create_track');
    expect(createTrackAction?.type).toBe('create_track');
    if (createTrackAction?.type === 'create_track') {
      expect(createTrackAction.instrumentSlug).toBe(presetId);
    }
  });

  it('normalizes Gemini legacy slugs to style preset IDs', async () => {
    const gemini: GeminiAdapter = {
      async createPlan() {
        return parseChatGenerationPlan({
          intent: 'setup_project',
          userFacingSummary: 'Create a bass track.',
          audiotoolActions: [
            {
              type: 'create_track',
              name: 'Bass',
              role: 'bass',
              instrumentSlug: 'bassline'
            }
          ]
        });
      }
    };

    const plan = await new ChatOrchestrator(undefined, gemini).createPlan(
      'Create a bass track.',
      {
        ...mockSessions.DeepHouseSketch,
        styleProfileId: 'uk-garage'
      },
      createDefaultProfile()
    );
    const createTrackAction = plan.audiotoolActions?.find((action) => action.type === 'create_track');
    expect(createTrackAction?.type).toBe('create_track');
    if (createTrackAction?.type === 'create_track') {
      expect(createTrackAction.instrumentSlug).toBe('presets/36ebd66f-7c40-5958-a56a-b16b124cea6b');
    }
  });
});
