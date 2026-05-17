import { describe, expect, it } from 'vitest';
import { GenerationService } from '../generation/generationService';
import type { SessionContext } from '../core/types';

const baseSession: SessionContext = {
  id: 'session-1',
  bpm: 126,
  key: 'C',
  scaleMode: 'minor',
  styleProfileId: 'melodic-techno',
  tracks: [],
  arrangementState: { density: 'medium', energy: 'medium' },
  completionState: {}
};

describe('generation service request resolution', () => {
  it('uses selected style default BPM when style is explicitly overridden', () => {
    const service = new GenerationService();
    const request = service.createRequestFromSession(baseSession, { styleProfileId: 'afro-house' });

    expect(request.bpm).toBe(121);
  });

  it('keeps session BPM when it fits the active style range', () => {
    const service = new GenerationService();
    const request = service.createRequestFromSession(baseSession);

    expect(request.bpm).toBe(126);
  });

  it('falls back to style default BPM when session BPM is out of range', () => {
    const service = new GenerationService();
    const request = service.createRequestFromSession({ ...baseSession, styleProfileId: 'afro-house', bpm: 145 });

    expect(request.bpm).toBe(121);
  });
});
