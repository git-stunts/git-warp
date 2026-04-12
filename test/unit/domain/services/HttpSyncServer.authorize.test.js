/**
 * B1 — HttpSyncServer._authorize() writer extraction fix tests.
 *
 * Verifies that _authorize extracts writer IDs from frontier keys
 * (not from patches, which don't exist in sync-requests).
 */

import { describe, it, expect, vi } from 'vitest';
import HttpSyncServer from '../../../../src/domain/services/sync/HttpSyncServer.ts';

function createMockHttpPort() {
  return {
    createServer: vi.fn(() => ({
      listen: vi.fn(),
      close: vi.fn(),
      address: vi.fn(),
    })),
  };
}

function createMockGraph() {
  return {
    processSyncRequest: vi.fn(async () => ({
      type: 'sync-response',
      frontier: {},
      patches: [],
    })),
  };
}

const SHA_A = 'a'.repeat(40);

describe('B1 — HttpSyncServer._authorize writer extraction', () => {
  it('extracts writer IDs from frontier keys for sync-requests', async () => {
    const enforceWriters = vi.fn(() => ({ ok: true }));
    const mockAuth = {
      verify: vi.fn(async () => ({ ok: true })),
      enforceWriters,
      recordLogOnlyPassthrough: vi.fn(),
    };

    const server = new HttpSyncServer({
      httpPort: /** @type {*} */ (createMockHttpPort()),
      graph: /** @type {*} */ (createMockGraph()),
      auth: {
        keys: { default: 'test-secret' },
        mode: 'enforce',
      },
    });

    // Replace the constructed auth with our mock
    /** @type {*} */ (server)._auth = mockAuth;

    const request = {
      method: 'POST',
      url: '/sync',
      headers: { 'content-type': 'application/json' },
      body: undefined,
    };

    const parsed = {
      type: 'sync-request',
      frontier: { w1: SHA_A, w2: 'b'.repeat(40) },
    };

    const result = await /** @type {*} */ (server)._authorize(request, parsed);
    expect(result).toBeNull(); // No error

    // Verify enforceWriters was called with frontier keys, not patches
    expect(enforceWriters).toHaveBeenCalledWith(['w1', 'w2']);
  });

  it('skips writer whitelist when frontier is empty', async () => {
    const enforceWriters = vi.fn();
    const mockAuth = {
      verify: vi.fn(async () => ({ ok: true })),
      enforceWriters,
      recordLogOnlyPassthrough: vi.fn(),
    };

    const server = new HttpSyncServer({
      httpPort: /** @type {*} */ (createMockHttpPort()),
      graph: /** @type {*} */ (createMockGraph()),
      auth: {
        keys: { default: 'test-secret' },
        mode: 'enforce',
      },
    });
    /** @type {*} */ (server)._auth = mockAuth;

    const request = {
      method: 'POST',
      url: '/sync',
      headers: {},
      body: undefined,
    };
    const parsed = { type: 'sync-request', frontier: {} };

    await /** @type {*} */ (server)._authorize(request, parsed);

    // enforceWriters should not be called for empty frontier
    expect(enforceWriters).not.toHaveBeenCalled();
  });

  it('returns 403 when frontier writers are forbidden', async () => {
    const mockAuth = {
      verify: vi.fn(async () => ({ ok: true })),
      enforceWriters: vi.fn(() => ({
        ok: false,
        reason: 'FORBIDDEN_WRITER',
        status: 403,
      })),
      recordLogOnlyPassthrough: vi.fn(),
    };

    const server = new HttpSyncServer({
      httpPort: /** @type {*} */ (createMockHttpPort()),
      graph: /** @type {*} */ (createMockGraph()),
      auth: {
        keys: { default: 'test-secret' },
        mode: 'enforce',
      },
    });
    /** @type {*} */ (server)._auth = mockAuth;

    const request = {
      method: 'POST',
      url: '/sync',
      headers: {},
      body: undefined,
    };
    const parsed = { type: 'sync-request', frontier: { untrusted: SHA_A } };

    const result = await /** @type {*} */ (server)._authorize(request, parsed);
    expect(result).not.toBeNull();
    expect(result.status).toBe(403);
  });
});
