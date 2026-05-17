import { describe, expect, it } from 'vitest';
import { parseNextStepsAnalysis } from '../nextSteps/schemas';

describe('next steps analysis', () => {
  it('validates structured Gemini reference-track output', () => {
    expect(() =>
      parseNextStepsAnalysis({
        educatorSummary: 'The track feels like a compact house reference with a clear energy lift.',
        analysis: {
          bpm: { value: 'Around 124 BPM feel', confidence: 'likely' },
          keyMood: { value: 'Minor-leaning, focused mood', confidence: 'uncertain' },
          vocalInstrumentalDetection: { value: 'Mostly instrumental', confidence: 'observed' }
        },
        observed: ['Steady four-on-the-floor pulse.'],
        likely: ['The bass follows the kick closely.'],
        uncertain: ['Exact chord roots are not guaranteed from the upload alone.'],
        suggested: ['Write a new bass rhythm with a similar push-pull feel.'],
        productionRoadmap: [
          {
            title: 'Sketch the groove',
            steps: ['Set the project tempo near the estimated BPM.', 'Program a kick and clap foundation.'],
            audiotoolFocus: 'Timeline and drum machine'
          }
        ]
      })
    ).not.toThrow();
  });
});
