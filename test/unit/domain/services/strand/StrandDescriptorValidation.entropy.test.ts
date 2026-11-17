import { describe, expect, it } from 'vitest';

import StrandError from '../../../../../src/domain/errors/StrandError.ts';
import {
  normalizeCreateOptions,
  resolveStrandId,
} from '../../../../../src/domain/services/strand/StrandDescriptorValidation.ts';
import SequenceRandomPort from '../../../../helpers/SequenceRandomPort.ts';

/** Strand id minted from the bytes 0x00..0x0f. */
const SEQUENCE_STRAND_ID = 'ws_000g40r40m30e209185gr38e1w';

describe('StrandDescriptorValidation entropy', () => {
  it('mints an unnamed strand id only from the injected port', () => {
    const random = new SequenceRandomPort(0);

    expect(resolveStrandId(undefined, random)).toBe(SEQUENCE_STRAND_ID);
    expect(resolveStrandId(null, new SequenceRandomPort(0))).toBe(SEQUENCE_STRAND_ID);
    expect(random.requests).toEqual([16]);
  });

  it('keeps an explicit strand id and draws no entropy', () => {
    const random = new SequenceRandomPort(0);

    expect(normalizeCreateOptions({ strandId: 'review' }, random).strandId).toBe('review');
    expect(random.requests).toEqual([]);
  });

  it('still validates an explicit strand id', () => {
    expect(() => resolveStrandId('a/b', new SequenceRandomPort(0))).toThrow(StrandError);
  });

  it('normalizes unnamed creation through the injected port', () => {
    expect(normalizeCreateOptions({}, new SequenceRandomPort(0)).strandId).toBe(SEQUENCE_STRAND_ID);
  });
});
