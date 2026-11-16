import { describe, expect, it } from 'vitest';

import { normalizeSyncPath, resolveSyncTarget } from '../../../../../src/domain/services/controllers/syncHelpers.ts';

/** A JavaScript caller can pass any shape as a remote; resolution must still be typed. */
function untypedRemote(remote) {
  return remote;
}

describe('syncHelpers', () => {
  it.each([undefined, null, ''])('defaults a missing sync path %s to /sync', (path) => {
    expect(normalizeSyncPath(path)).toBe('/sync');
  });

  it('prefixes a relative sync path with a slash', () => {
    expect(normalizeSyncPath('peer/sync')).toBe('/peer/sync');
    expect(normalizeSyncPath('/already')).toBe('/already');
  });

  it.each([{ sync: null }, { sync: 7 }, { other: true }])('treats a remote without a sync processor as a URL: %o', (remote) => {
    expect(() => resolveSyncTarget(untypedRemote(remote), '/sync', false)).toThrow(expect.objectContaining({
      code: 'E_SYNC_REMOTE_URL',
    }));
  });
});
