import { describe, expect, it } from 'vitest';

import EntityAdmission from '../../../src/domain/api/EntityAdmission.ts';
import { snapshotReadingValue } from '../../../src/domain/api/ReadingValueRuntime.ts';
import ImmutableBytes from '../../../src/domain/services/snapshot/ImmutableBytes.ts';
import EntityAdmissionOrigin from '../../../src/domain/types/EntityAdmissionOrigin.ts';

describe('EntityAdmission', () => {
  it('preserves a top-level __proto__ property as ordinary data', () => {
    const admission = new EntityAdmission({
      occurrenceId: 'occurrence:1',
      orderingKey: 'order:1',
      origin: EntityAdmissionOrigin.suppliedSubject(),
      properties: { ['__proto__']: 'retained' },
      subject: 'capture:1',
    });

    expect(Object.hasOwn(admission.initialProperties, '__proto__')).toBe(true);
    expect(admission.initialProperties['__proto__']).toBe('retained');
    expect(Object.getOwnPropertyDescriptor(Object.prototype, 'retained')).toBeUndefined();

    const snapshot = snapshotReadingValue({ ['__proto__']: 'retained' });
    expect(Object.hasOwn(snapshot, '__proto__')).toBe(true);
    expect(snapshot['__proto__']).toBe('retained');
  });

  it('requires constructor options', () => {
    expect(() => new EntityAdmission(null)).toThrowError(
      expect.objectContaining({ code: 'E_ENTITY_ADMISSION_READING' })
    );
  });

  it('recursively snapshots bytes, arrays, and records', () => {
    const sourceBytes = new Uint8Array([1, 2]);
    const sourceTags = ['first'];
    const sourceMetadata = { approved: true };
    const admission = new EntityAdmission({
      occurrenceId: 'occurrence:complex',
      orderingKey: 'order:complex',
      origin: EntityAdmissionOrigin.suppliedSubject(),
      properties: {
        bytes: sourceBytes,
        tags: sourceTags,
        metadata: sourceMetadata,
      },
      subject: 'capture:complex',
    });

    sourceBytes[0] = 9;
    sourceTags.push('later');
    sourceMetadata.approved = false;

    const bytes = admission.initialProperties['bytes'];
    expect(bytes).toBeInstanceOf(ImmutableBytes);
    expect(bytes instanceof ImmutableBytes ? bytes.toArray() : []).toEqual([1, 2]);
    expect(admission.initialProperties['tags']).toEqual(['first']);
    expect(admission.initialProperties['metadata']).toEqual({ approved: true });
  });
});
