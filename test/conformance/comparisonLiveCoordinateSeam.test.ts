import { describe, expect, it, vi } from 'vitest';

import { createEmptyState } from '../../src/domain/services/JoinReducer.ts';
import type {
  ComparisonCoordinateSideRead,
  ComparisonCoordinateSideReadPort,
  CoordinateComparisonSideReadRequest,
  LiveComparisonSideReadRequest,
  StrandBaseComparisonSideReadRequest,
} from '../../src/domain/services/controllers/ComparisonCoordinateSideReadPort.ts';
import type ComparisonSideFinalizer from '../../src/domain/services/controllers/ComparisonSideFinalizerPort.ts';
import {
  CoordinateComparisonSelector,
  LiveComparisonSelector,
  ResolvedComparisonSide,
  StrandBaseComparisonSelector,
  type ComparisonHost,
  type ComparisonSelectorContext,
} from '../../src/domain/services/controllers/ComparisonSelector.ts';
import defaultCodec from '../../src/domain/utils/defaultCodec.ts';
import defaultCrypto from '../../src/domain/utils/defaultCrypto.ts';

const PATCH_SHA = 'f'.repeat(40);
const STATE_HASH = 'state-hash';
const PATCH_FRONTIER_DIGEST = 'patch-frontier-digest';
const LAMPORT_FRONTIER_DIGEST = 'lamport-frontier-digest';
const PATCH_UNIVERSE_DIGEST = 'patch-universe-digest';

describe('comparison coordinate-backed side seam', () => {
  it('resolves live selectors through the coordinate reader and finalizer', async () => {
    const reader = new RecordingCoordinateReader();
    const finalizer = new RecordingFinalizer();
    const selector = new LiveComparisonSelector(4);
    const liveFrontier = new Map([['alice', PATCH_SHA]]);

    const resolved = await selector.resolve(contextFor(reader, finalizer), null, liveFrontier);

    expect(resolved.resolved.coordinateKind).toBe('frontier');
    expect(reader.liveFrontierCalls).toBe(0);
    expect(reader.liveSideRequests).toStrictEqual([{ frontier: liveFrontier, ceiling: 4 }]);
    expect(reader.coordinateSideRequests).toStrictEqual([]);
    expect(reader.strandBaseSideRequests).toStrictEqual([]);
    expect(finalizer.reads).toHaveLength(1);
  });

  it('resolves coordinate selectors through the coordinate reader and finalizer', async () => {
    const reader = new RecordingCoordinateReader();
    const finalizer = new RecordingFinalizer();
    const frontier = { alice: PATCH_SHA };
    const selector = new CoordinateComparisonSelector(frontier, 5);

    const resolved = await selector.resolve(contextFor(reader, finalizer), null);

    expect(resolved.resolved.lamportCeiling).toBe(5);
    expect(reader.liveFrontierCalls).toBe(0);
    expect(reader.liveSideRequests).toStrictEqual([]);
    expect(reader.coordinateSideRequests).toStrictEqual([{ frontier, ceiling: 5 }]);
    expect(reader.strandBaseSideRequests).toStrictEqual([]);
    expect(finalizer.reads[0]?.requested).toStrictEqual({ kind: 'coordinate', frontier, ceiling: 5 });
  });

  it('resolves strand-base selectors through the coordinate reader and finalizer', async () => {
    const reader = new RecordingCoordinateReader();
    const finalizer = new RecordingFinalizer();
    const selector = new StrandBaseComparisonSelector('strand-alpha', 6);

    const resolved = await selector.resolve(contextFor(reader, finalizer), null);

    expect(resolved.resolved.coordinateKind).toBe('strand_base');
    expect(reader.liveFrontierCalls).toBe(0);
    expect(reader.liveSideRequests).toStrictEqual([]);
    expect(reader.coordinateSideRequests).toStrictEqual([]);
    expect(reader.strandBaseSideRequests).toStrictEqual([{ strandId: 'strand-alpha', ceiling: 6 }]);
    expect(finalizer.reads[0]?.requested).toStrictEqual({
      kind: 'strand_base',
      strandId: 'strand-alpha',
      frontier: { alice: PATCH_SHA },
      baseLamportCeiling: null,
      ceiling: 6,
    });
  });
});

class RecordingCoordinateReader implements ComparisonCoordinateSideReadPort {
  liveFrontierCalls = 0;
  readonly liveSideRequests: LiveComparisonSideReadRequest[] = [];
  readonly coordinateSideRequests: CoordinateComparisonSideReadRequest[] = [];
  readonly strandBaseSideRequests: StrandBaseComparisonSideReadRequest[] = [];

  async liveFrontier(): Promise<Map<string, string>> {
    this.liveFrontierCalls += 1;
    return new Map([['alice', PATCH_SHA]]);
  }

  async readLiveSide(request: LiveComparisonSideReadRequest): Promise<ComparisonCoordinateSideRead> {
    this.liveSideRequests.push(request);
    return readSide({
      requested: { kind: 'live', ceiling: request.ceiling },
      coordinateKind: 'frontier',
      lamportCeiling: request.ceiling,
    });
  }

  async readCoordinateSide(request: CoordinateComparisonSideReadRequest): Promise<ComparisonCoordinateSideRead> {
    this.coordinateSideRequests.push(request);
    return readSide({
      requested: { kind: 'coordinate', frontier: request.frontier, ceiling: request.ceiling },
      coordinateKind: 'frontier',
      lamportCeiling: request.ceiling,
    });
  }

  async readStrandBaseSide(request: StrandBaseComparisonSideReadRequest): Promise<ComparisonCoordinateSideRead> {
    this.strandBaseSideRequests.push(request);
    return readSide({
      requested: {
        kind: 'strand_base',
        strandId: request.strandId,
        frontier: { alice: PATCH_SHA },
        baseLamportCeiling: null,
        ceiling: request.ceiling,
      },
      coordinateKind: 'strand_base',
      lamportCeiling: request.ceiling,
    });
  }
}

class RecordingFinalizer implements ComparisonSideFinalizer {
  readonly reads: ComparisonCoordinateSideRead[] = [];

  async finalize(read: ComparisonCoordinateSideRead): Promise<ResolvedComparisonSide> {
    this.reads.push(read);
    return resolvedSide(read);
  }
}

function contextFor(
  reader: ComparisonCoordinateSideReadPort,
  finalizer: ComparisonSideFinalizer,
): ComparisonSelectorContext {
  return {
    coordinateReader: reader,
    sideFinalizer: finalizer,
    strandGraph: poisonHost(),
  };
}

function readSide(options: {
  readonly requested: ComparisonCoordinateSideRead['requested'];
  readonly coordinateKind: ComparisonCoordinateSideRead['coordinateKind'];
  readonly lamportCeiling: number | null;
}): ComparisonCoordinateSideRead {
  return {
    requested: options.requested,
    state: createEmptyState(),
    patchEntries: [],
    coordinateKind: options.coordinateKind,
    lamportCeiling: options.lamportCeiling,
  };
}

function resolvedSide(read: ComparisonCoordinateSideRead): ResolvedComparisonSide {
  return new ResolvedComparisonSide({
    requested: read.requested,
    state: read.state,
    patchEntries: read.patchEntries,
    resolved: {
      coordinateKind: read.coordinateKind,
      patchFrontier: {},
      patchFrontierDigest: PATCH_FRONTIER_DIGEST,
      lamportFrontier: {},
      lamportFrontierDigest: LAMPORT_FRONTIER_DIGEST,
      lamportCeiling: read.lamportCeiling,
      stateHash: STATE_HASH,
      patchUniverseDigest: PATCH_UNIVERSE_DIGEST,
      summary: {
        nodeCount: 0,
        edgeCount: 0,
        nodePropertyCount: 0,
        edgePropertyCount: 0,
        patchCount: read.patchEntries.length,
      },
    },
  });
}

function poisonHost(): ComparisonHost {
  return {
    _crypto: defaultCrypto,
    _codec: defaultCodec,
    _stateHashService: null,
    _blobStorage: {
      retrieve: vi.fn(async () => failPoisonHostCall()),
    },
    _persistence: {
      readBlob: vi.fn(async () => failPoisonHostCall()),
    },
  };
}

function failPoisonHostCall(): never {
  throw new Error('coordinate-backed selector touched the host seam');
}
