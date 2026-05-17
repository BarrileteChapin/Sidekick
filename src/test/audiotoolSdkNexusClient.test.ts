import { describe, expect, it } from 'vitest';
import { resolveDeviceAudioOutputLocation } from '../nexus/AudiotoolSdkNexusClient';

describe('Audiotool SDK audio routing', () => {
  it('uses the standard audioOutput socket when present', () => {
    expect(resolveDeviceAudioOutputLocation({
      audioOutput: {
        location: { entityId: 'device-1', schemaPath: '/bassline/audioOutput' }
      }
    })).toEqual({ entityId: 'device-1', schemaPath: '/bassline/audioOutput' });
  });

  it('falls back to mainOutput for machiniste-style devices', () => {
    expect(resolveDeviceAudioOutputLocation({
      mainOutput: {
        location: { entityId: 'device-1', schemaPath: '/machiniste/mainOutput' }
      }
    })).toEqual({ entityId: 'device-1', schemaPath: '/machiniste/mainOutput' });
  });

  it('returns undefined when the preset exposes no known output socket', () => {
    expect(resolveDeviceAudioOutputLocation({ notesInput: { location: { entityId: 'device-1', schemaPath: '/device/notesInput' } } })).toBeUndefined();
  });
});