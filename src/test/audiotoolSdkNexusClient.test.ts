import { describe, expect, it } from 'vitest';
import { resolveDeviceAudioOutputLocation } from '../nexus/AudiotoolSdkNexusClient';

describe('Audiotool SDK audio routing', () => {
  it('uses the standard audioOutput socket when present', () => {
    expect(resolveDeviceAudioOutputLocation({
      audioOutput: {
        location: { entityId: 'device-1', fieldIndex: [7] }
      }
    })).toEqual({
      fieldName: 'audioOutput',
      location: { entityId: 'device-1', fieldIndex: [7] }
    });
  });

  it('falls back to mainOutput for machiniste-style devices', () => {
    expect(resolveDeviceAudioOutputLocation({
      mainOutput: {
        location: { entityId: 'device-1', fieldIndex: [5] }
      }
    })).toEqual({
      fieldName: 'mainOutput',
      location: { entityId: 'device-1', fieldIndex: [5] }
    });
  });

  it('rejects socket locations that only expose an entity id', () => {
    expect(resolveDeviceAudioOutputLocation({
      audioOutput: {
        location: { entityId: 'device-1' }
      }
    })).toBeUndefined();
  });

  it('returns undefined when the preset exposes no known output socket', () => {
    expect(resolveDeviceAudioOutputLocation({ notesInput: { location: { entityId: 'device-1', fieldIndex: [8] } } })).toBeUndefined();
  });
});