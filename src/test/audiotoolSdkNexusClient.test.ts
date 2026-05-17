import { describe, expect, it, vi } from 'vitest';
import { __testing } from '../nexus/AudiotoolSdkNexusClient';

describe('AudiotoolSdkNexusClient pointer helpers', () => {
  it('normalizes valid pointer locations and defaults missing fieldIndex', () => {
    expect(__testing.normalizePointerLocation({ entityId: 'abc' })).toEqual({
      entityId: 'abc',
      fieldIndex: []
    });
  });

  it('filters non-integer fieldIndex values', () => {
    expect(__testing.normalizePointerLocation({ entityId: 'abc', fieldIndex: [1, 2.2, '3', 4] })).toEqual({
      entityId: 'abc',
      fieldIndex: [1, 4]
    });
  });

  it('rejects socket locations with non-array fieldIndex', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = __testing.resolveSocketLocation({
      location: {
        entityId: 'socket-1',
        fieldIndex: '0,1'
      }
    }, 'device.audioOutput');

    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it('resolves the first supported output field location', () => {
    const result = __testing.resolveDeviceAudioOutputLocation({
      mainOutput: {
        location: {
          entityId: 'main-output',
          fieldIndex: [0, 1]
        }
      },
      audioOutput: {
        location: {
          entityId: 'audio-output',
          fieldIndex: [3]
        }
      }
    });

    expect(result).toEqual({
      fieldName: 'audioOutput',
      location: {
        entityId: 'audio-output',
        fieldIndex: [3]
      }
    });
  });

  it('throws when converting an invalid pointer location', () => {
    expect(() => __testing.toPointerLocation({ fieldIndex: [] }, 'invalid-pointer')).toThrow(
      'Audiotool pointer "invalid-pointer" is missing or invalid.'
    );
  });

  it('creates a root pointer from entity id', () => {
    expect(__testing.pointerFromEntityId('entity-123', 'root')).toEqual({
      entityId: 'entity-123',
      fieldIndex: []
    });
  });

  it('prefers an existing entity location over a synthesized root pointer', () => {
    const existingLocation = {
      entityId: 'entity-123',
      fieldIndex: [7]
    } as unknown as Parameters<typeof __testing.locationOrEntityPointer>[0];

    expect(__testing.locationOrEntityPointer(existingLocation, 'fallback-id', 'existing')).toBe(existingLocation);
  });

  it('throws when entity id is missing for root pointer conversion', () => {
    expect(() => __testing.pointerFromEntityId('', 'root')).toThrow(
      'Audiotool entityId for "root" is missing or invalid.'
    );
  });

  it('describes pointer shape for diagnostics', () => {
    expect(__testing.describePointerShape({ entityId: 'id', fieldIndex: [1] })).toEqual({
      entityId: 'id',
      fieldIndex: [1],
      fieldIndexType: 'object',
      fieldIndexIsArray: true
    });
  });
});
