import { describe, it, expect, beforeEach, vi } from 'vitest';
import WarpRuntime from '../../../src/domain/WarpRuntime.ts';
import NodeHttpAdapter from '../../../src/infrastructure/adapters/NodeHttpAdapter.ts';

/** @returns {any} */
function canonicalizeJson(/** @type {any} */ value) {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  if (value && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      (sorted)[key] = canonicalizeJson(value[key]);
    }
    return sorted;
  }
  return value;
}

function canonicalStringify(/** @type {any} */ value) {
  return JSON.stringify(canonicalizeJson(value));
}

describe('WarpRuntime serve', () => {
    let graph;

  beforeEach(async () => {
    const mockPersistence = {
      readRef: vi.fn().mockResolvedValue(null),
      listRefs: vi.fn().mockResolvedValue([]),
      updateRef: vi.fn().mockResolvedValue(undefined),
      configGet: vi.fn().mockResolvedValue(null),
      configSet: vi.fn().mockResolvedValue(undefined),
      readBlob: vi.fn(),
      writeBlob: vi.fn(),
      getNodeInfo: vi.fn(),
      readTreeOids: vi.fn(),
      writeTree: vi.fn(),
    };

    graph = await WarpRuntime.open({
      persistence: (mockPersistence as any),
      graphName: 'test',
      writerId: 'writer-1',
    });
  });

  it('serves sync responses with canonical JSON', async () => {
    const payload = {
      type: 'sync-response',
      frontier: { b: '2', a: '1' },
      patches: [
        {
          writerId: 'writer-1',
          sha: 'sha-1',
          patch: { z: 1, a: 2 },
        },
      ],
    };

    graph.processSyncRequest = vi.fn().mockResolvedValue(payload);

    const server = await graph.serve({ port: 0, httpPort: new NodeHttpAdapter() });
    try {
      const res = await fetch(server.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'sync-request', frontier: {} }),
      });

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe(canonicalStringify(payload));
    } finally {
      await server.close();
    }
  });

  it('returns 400 for invalid JSON', async () => {
    const server = await graph.serve({ port: 0, httpPort: new NodeHttpAdapter() });
    try {
      const res = await fetch(server.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{bad json',
      });

      expect(res.status).toBe(400);
    } finally {
      await server.close();
    }
  });
});
