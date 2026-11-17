import { describe, expect, it } from 'vitest';

import EntropyError from '../../../../src/domain/errors/EntropyError.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';
import { drawEntropy } from '../../../../src/domain/utils/EntropyDraw.ts';
import type RandomPort from '../../../../src/ports/RandomPort.ts';
import SequenceRandomPort from '../../../helpers/SequenceRandomPort.ts';

class LongRandomPort implements RandomPort {
  randomBytes(length: number): Uint8Array {
    return new Uint8Array(length + 1);
  }
}

class ShortRandomPort implements RandomPort {
  randomBytes(length: number): Uint8Array {
    return new Uint8Array(length - 1);
  }
}

/** A JavaScript caller can hand over any shape; the draw must still fail closed. */
function untypedPort(port) {
  return port;
}

describe('drawEntropy', () => {
  it('returns exactly the bytes the injected port produced', () => {
    const random = new SequenceRandomPort(7);

    expect([...drawEntropy(random, 4)]).toEqual([7, 8, 9, 10]);
    expect([...drawEntropy(random, 2)]).toEqual([11, 12]);
    expect(random.requests).toEqual([4, 2]);
  });

  it('rejects a port that returns too few bytes', () => {
    const draw = () => drawEntropy(new ShortRandomPort(), 16);

    expect(draw).toThrow(EntropyError);
    expect(draw).toThrow(WarpError);
    expect(draw).toThrow(expect.objectContaining({
      code: 'E_ENTROPY_WRONG_LENGTH',
      context: { requested: 16, received: 15 },
    }));
  });

  it('rejects a port that returns too many bytes', () => {
    expect(() => drawEntropy(new LongRandomPort(), 16)).toThrow(expect.objectContaining({
      code: 'E_ENTROPY_WRONG_LENGTH',
      context: { requested: 16, received: 17 },
    }));
  });

  it('rejects a port that returns something other than bytes', () => {
    const port = untypedPort({ randomBytes: (length: number) => Array.from({ length }, () => 0) });

    expect(() => drawEntropy(port, 4)).toThrow(expect.objectContaining({
      code: 'E_ENTROPY_WRONG_LENGTH',
      context: { requested: 4, received: null },
    }));
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects a non-positive or fractional length %s', (length) => {
    expect(() => drawEntropy(new SequenceRandomPort(), length)).toThrow(expect.objectContaining({
      code: 'E_ENTROPY_INVALID_LENGTH',
    }));
  });
});
