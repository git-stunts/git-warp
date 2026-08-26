import { describe, expect, it } from 'vitest';

import EntityAdmission from '../../../src/domain/api/EntityAdmission.ts';
import { snapshotReadingValue } from '../../../src/domain/api/ReadingValueRuntime.ts';
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
});
