import { describe, expect, it } from 'vitest';

import HostRandomAdapter from '../../../../src/infrastructure/adapters/HostRandomAdapter.ts';

describe('HostRandomAdapter', () => {
  it('returns the requested number of host CSPRNG bytes', () => {
    const bytes = new HostRandomAdapter().randomBytes(16);

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes).toHaveLength(16);
  });

  it('returns fresh bytes on every draw', () => {
    const random = new HostRandomAdapter();

    expect(random.randomBytes(32)).not.toEqual(random.randomBytes(32));
  });

  it('fills draws larger than one Web Crypto quota', () => {
    const bytes = new HostRandomAdapter().randomBytes(65_536 + 16);

    expect(bytes).toHaveLength(65_552);
    expect(bytes.subarray(65_536).some((byte) => byte !== 0)).toBe(true);
  });
});
