import { describe, expect, it, vi } from 'vitest';

import Patch from '../../../src/domain/types/Patch.ts';
import RuntimePatchCollector from '../../../src/domain/warp/RuntimePatchCollector.ts';
import type { PatchWithSha } from '../../../src/domain/capabilities/PatchCollector.ts';

function patchEntry(lamport: number, sha: string): PatchWithSha {
  return {
    patch: new Patch({
      writer: 'agent-1',
      lamport,
      context: {},
      ops: [],
    }),
    sha,
  };
}

async function collect(source: AsyncIterable<PatchWithSha>): Promise<PatchWithSha[]> {
  const entries: PatchWithSha[] = [];
  for await (const entry of source) {
    entries.push(entry);
  }
  return entries;
}

describe('RuntimePatchCollector streams', () => {
  it('streams frontier patches and keeps collectForFrontier as stream collection sugar', async () => {
    const frontier = new Map([['agent-1', 'tip-sha']]);
    const entries = [
      patchEntry(1, 'sha-1'),
      patchEntry(3, 'sha-3'),
    ];
    const host = {
      discoverWriters: vi.fn(async () => ['agent-1']),
      _loadWriterPatches: vi.fn(async () => entries),
      _loadPatchChainFromSha: vi.fn(async () => entries),
      _loadLatestCheckpoint: vi.fn(async () => null),
      _loadPatchesSince: vi.fn(async () => []),
      getFrontier: vi.fn(async () => frontier),
    };
    const collector = new RuntimePatchCollector(host);

    const streamed = await collect(collector.streamForFrontier(frontier, 2));
    const collected = await collector.collectForFrontier(frontier, 2);

    expect(streamed.map((entry) => entry.sha)).toEqual(['sha-1']);
    expect(collected).toEqual(streamed);
    expect(host._loadPatchChainFromSha).toHaveBeenCalledWith('tip-sha');
  });
});
