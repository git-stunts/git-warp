import { beforeEach, describe, expect, it } from 'vitest';
import { openRuntimeHostProduct, type RuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';
import ProvenanceController from '../../../src/domain/services/controllers/ProvenanceController.ts';
import type { ProvenanceReadHost } from '../../../src/domain/services/controllers/ReadGraphHost.ts';
import { createEmptyState } from '../../../src/domain/services/JoinReducer.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import defaultCodec from '../../../src/infrastructure/codecs/CborCodec.ts';
import { createMockPersistence } from '../../helpers/warpGraphTestUtils.ts';

const READINGS_DOC = 'docs/READINGS_AND_OPTICS.md';

function createProvenanceReadHost(options: { provenanceDegraded: boolean }): ProvenanceReadHost {
  return {
    _ensureFreshState: async () => {},
    _cachedState: createEmptyState(),
    _autoMaterialize: false,
    _persistence: createMockPersistence(),
    _commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
    _readPatchBlob: async () => new Uint8Array(),
    _codec: defaultCodec,
    _provenanceDegraded: options.provenanceDegraded,
    _provenanceIndex: null,
  };
}

describe('runtime read-basis error guidance', () => {
  let graph: RuntimeHostProduct;

  beforeEach(async () => {
    graph = await openRuntimeHostProduct({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      autoMaterialize: false,
    });
  });

  it('points no-state query errors at readings instead of materialization', async () => {
    await expect(graph.hasNode('node:a')).rejects.toThrow('No live reading basis is available');
    await expect(graph.hasNode('node:a')).rejects.toThrow(READINGS_DOC);
    await expect(graph.hasNode('node:a')).rejects.not.toThrow('Call materialize');
  });

  it('points stale query errors at refreshing a reading basis', async () => {
    await graph.materialize();
    graph._stateDirty = true;

    await expect(graph.hasNode('node:a')).rejects.toThrow('live reading basis is stale');
    await expect(graph.hasNode('node:a')).rejects.toThrow(READINGS_DOC);
    await expect(graph.hasNode('node:a')).rejects.not.toThrow('Call materialize');
  });

  it('points missing provenance index errors at provenance readings', async () => {
    const controller = new ProvenanceController(createProvenanceReadHost({ provenanceDegraded: false }));

    await expect(controller.patchesFor('node:a')).rejects.toThrow('No provenance reading index');
    await expect(controller.patchesFor('node:a')).rejects.toThrow(READINGS_DOC);
    await expect(controller.patchesFor('node:a')).rejects.not.toThrow('Call materialize');
  });

  it('points degraded provenance errors at provenance diagnostics', async () => {
    const controller = new ProvenanceController(createProvenanceReadHost({ provenanceDegraded: true }));

    await expect(controller.patchesFor('node:a')).rejects.toThrow('Provenance reading is unavailable');
    await expect(controller.patchesFor('node:a')).rejects.toThrow(READINGS_DOC);
    await expect(controller.patchesFor('node:a')).rejects.not.toThrow('call materialize');
  });
});
