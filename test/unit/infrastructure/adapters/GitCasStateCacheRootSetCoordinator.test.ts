import { describe, expect, it, vi } from 'vitest';
import type {
  RootSetDoctorResult,
  RootSetEntry,
  RootSetMutationResult,
  RootSetState,
} from '@git-stunts/git-cas';
import type { WarpStateSnapshotRecord } from '../../../../src/ports/WarpStateCachePort.ts';
import WarpStateCacheRetentionReport from '../../../../src/domain/services/state/WarpStateCacheRetentionReport.ts';
import WarpStateCacheRepairResult from '../../../../src/domain/services/state/WarpStateCacheRepairResult.ts';
import GitCasStateCacheRootSetCoordinator from '../../../../src/infrastructure/adapters/GitCasStateCacheRootSetCoordinator.ts';

const TREE_A = 'a'.repeat(40);
const TREE_B = 'b'.repeat(40);
const TREE_C = 'c'.repeat(40);

function snapshot(
  snapshotId: string,
  payloadRef: string,
  retention: 'evictable' | 'pinned' = 'evictable',
): WarpStateSnapshotRecord {
  return {
    snapshotId,
    coordinate: { frontier: new Map([['writer-1', TREE_A]]), ceiling: 4 },
    retention,
    provenancePosture: 'full',
    stateHash: `hash-${snapshotId}`,
    payloadRef,
    createdAt: '2026-07-11T20:00:00.000Z',
  };
}

class RootSetConflictError extends Error {
  readonly code = 'ROOT_SET_CONFLICT';
}

class MockRootSet {
  readonly events: string[];
  entries: RootSetEntry[];
  headOid: string | null;
  cleanupConflict = false;
  cleanupError: unknown = null;
  unhealthyMessage: string | null = null;
  unhealthyWithoutDetails = false;
  readonly replaceCalls: Array<{
    entries: RootSetEntry[];
    expectedHeadOid: string | null | undefined;
  }> = [];
  readonly repairCalls: RootSetEntry[][] = [];

  constructor(events: string[], entries: RootSetEntry[] = []) {
    this.events = events;
    this.entries = entries;
    this.headOid = entries.length === 0 ? null : TREE_C;
  }

  async read(): Promise<RootSetState> {
    return {
      ref: 'refs/cas/rootsets/git-warp/demo/state-cache',
      headOid: this.headOid,
      treeOid: this.headOid,
      entries: [...this.entries],
    };
  }

  async mutate(
    mutator: (
      entries: ReadonlyArray<Readonly<RootSetEntry>>,
    ) => Iterable<RootSetEntry> | Promise<Iterable<RootSetEntry>>,
  ): Promise<RootSetMutationResult> {
    this.events.push('root:prepare');
    this.entries = Array.from(await mutator(this.entries));
    this.headOid = TREE_B;
    return {
      changed: true,
      commitOid: this.headOid,
      treeOid: this.headOid,
      entries: [...this.entries],
    };
  }

  async replace(options: {
    entries: Iterable<RootSetEntry>;
    expectedHeadOid?: string | null;
  }): Promise<RootSetMutationResult> {
    this.events.push('root:cleanup');
    const entries = Array.from(options.entries);
    this.replaceCalls.push({ entries, expectedHeadOid: options.expectedHeadOid });
    if (this.cleanupError !== null) {
      throw this.cleanupError;
    }
    if (this.cleanupConflict) {
      throw new RootSetConflictError('concurrent root-set writer');
    }
    this.entries = entries;
    this.headOid = TREE_C;
    return {
      changed: true,
      commitOid: this.headOid,
      treeOid: this.headOid,
      entries: [...this.entries],
    };
  }

  async doctor(): Promise<RootSetDoctorResult> {
    if (this.unhealthyWithoutDetails) {
      return {
        healthy: false,
        ref: 'refs/cas/rootsets/git-warp/demo/state-cache',
      };
    }
    if (this.unhealthyMessage !== null) {
      return {
        healthy: false,
        ref: 'refs/cas/rootsets/git-warp/demo/state-cache',
        entries: [...this.entries],
        error: { code: 'ROOT_SET_METADATA_INVALID', message: this.unhealthyMessage },
      };
    }
    return {
      healthy: true,
      ref: 'refs/cas/rootsets/git-warp/demo/state-cache',
      headOid: this.headOid,
      entries: [...this.entries],
    };
  }

  async repair(options: { entries: Iterable<RootSetEntry> }): Promise<{
    repaired: true;
    commitOid: string;
    treeOid: string;
    entries: RootSetEntry[];
  }> {
    const entries = Array.from(options.entries);
    this.events.push('root:repair');
    this.repairCalls.push(entries);
    this.entries = entries;
    this.headOid = TREE_C;
    this.unhealthyMessage = null;
    return {
      repaired: true,
      commitOid: TREE_C,
      treeOid: TREE_C,
      entries: [...entries],
    };
  }
}

class MockObjectProbe {
  readonly objectTypes = new Map<string, string>();

  async nodeExists(oid: string): Promise<boolean> {
    return this.objectTypes.has(oid);
  }

  async readObjectType(oid: string): Promise<string> {
    const objectType = this.objectTypes.get(oid);
    if (objectType === undefined) {
      throw new Error(`missing object ${oid}`);
    }
    return objectType;
  }
}

function coordinatorFixture(rootEntries: RootSetEntry[] = []) {
  const events: string[] = [];
  const rootSet = new MockRootSet(events, rootEntries);
  const objectProbe = new MockObjectProbe();
  const openedRefs: string[] = [];
  const coordinator = new GitCasStateCacheRootSetCoordinator({
    graphName: 'demo',
    openRootSet: async (ref) => {
      openedRefs.push(ref);
      return rootSet;
    },
    objectProbe,
  });
  return { coordinator, events, objectProbe, openedRefs, rootSet };
}

describe('GitCasStateCacheRootSetCoordinator', () => {
  it('does not open a root set when there are no legacy records to adopt', async () => {
    const { coordinator, openedRefs } = coordinatorFixture();

    await coordinator.adopt([]);

    expect(openedRefs).toEqual([]);
  });

  it('adopts a legacy live payload into the graph root set', async () => {
    const { coordinator, objectProbe, openedRefs, rootSet } = coordinatorFixture();
    objectProbe.objectTypes.set(TREE_A, 'tree');

    await coordinator.adopt([snapshot('snapshot-a', TREE_A, 'pinned')]);

    expect(openedRefs).toEqual(['refs/cas/rootsets/git-warp/demo/state-cache']);
    expect(rootSet.entries).toEqual([
      { name: 'snapshot-a', oid: TREE_A, type: 'tree', retention: 'pinned' },
    ]);
  });

  it('does not rewrite an already exact adopted root', async () => {
    const exact: RootSetEntry = {
      name: 'snapshot-a',
      oid: TREE_A,
      type: 'tree',
      retention: 'evictable',
    };
    const { coordinator, events, rootSet } = coordinatorFixture([exact]);

    await coordinator.adopt([snapshot('snapshot-a', TREE_A)]);

    expect(events).toEqual([]);
    expect(rootSet.entries).toEqual([exact]);
  });

  it('publishes the index only after a protective superset and cleans with the prepared head', async () => {
    const { coordinator, events, objectProbe, rootSet } = coordinatorFixture([
      { name: 'stale', oid: TREE_C, type: 'tree', retention: 'evictable' },
    ]);
    objectProbe.objectTypes.set(TREE_A, 'tree');

    await coordinator.publishTransition([snapshot('snapshot-a', TREE_A)], async () => {
      events.push('index:publish');
    });

    expect(events).toEqual(['root:prepare', 'index:publish', 'root:cleanup']);
    expect(rootSet.replaceCalls[0]?.expectedHeadOid).toBe(TREE_B);
    expect(rootSet.replaceCalls[0]?.entries).toEqual([
      { name: 'snapshot-a', oid: TREE_A, type: 'tree', retention: 'evictable' },
    ]);
  });

  it('skips cleanup when the prepared root set is already exact', async () => {
    const { coordinator, events, objectProbe, rootSet } = coordinatorFixture();
    objectProbe.objectTypes.set(TREE_A, 'tree');

    await coordinator.publishTransition([snapshot('snapshot-a', TREE_A)], async () => {
      events.push('index:publish');
    });

    expect(events).toEqual(['root:prepare', 'index:publish']);
    expect(rootSet.replaceCalls).toEqual([]);
  });

  it('orders duplicate desired names deterministically', async () => {
    const { coordinator, objectProbe, rootSet } = coordinatorFixture();
    objectProbe.objectTypes.set(TREE_A, 'tree');
    objectProbe.objectTypes.set(TREE_B, 'tree');

    await coordinator.publishTransition([
      snapshot('snapshot-a', TREE_A),
      snapshot('snapshot-a', TREE_B),
    ], async () => undefined);

    expect(rootSet.entries.map((entry) => entry.name)).toEqual([
      'snapshot-a',
      'snapshot-a',
    ]);
  });

  it('accepts a newly created CAS tree without probing it again', async () => {
    const { coordinator, events, rootSet } = coordinatorFixture();

    await coordinator.publishTransition(
      [snapshot('snapshot-a', TREE_A)],
      async () => { events.push('index:publish'); },
      [TREE_A],
    );

    expect(events).toEqual(['root:prepare', 'index:publish']);
    expect(rootSet.entries).toEqual([
      { name: 'snapshot-a', oid: TREE_A, type: 'tree', retention: 'evictable' },
    ]);
  });

  it('leaves the pre-anchored superset in place when index publication fails', async () => {
    const { coordinator, events, objectProbe, rootSet } = coordinatorFixture();
    objectProbe.objectTypes.set(TREE_A, 'tree');

    await expect(
      coordinator.publishTransition([snapshot('snapshot-a', TREE_A)], async () => {
        events.push('index:publish');
        throw new Error('index compare-and-swap failed');
      }),
    ).rejects.toThrow(/index compare-and-swap failed/);

    expect(events).toEqual(['root:prepare', 'index:publish']);
    expect(rootSet.entries).toEqual([
      { name: 'snapshot-a', oid: TREE_A, type: 'tree', retention: 'evictable' },
    ]);
  });

  it('keeps harmless extra roots when guarded cleanup loses a race', async () => {
    const { coordinator, events, objectProbe, rootSet } = coordinatorFixture([
      { name: 'stale', oid: TREE_C, type: 'tree', retention: 'evictable' },
    ]);
    objectProbe.objectTypes.set(TREE_A, 'tree');
    rootSet.cleanupConflict = true;

    await expect(
      coordinator.publishTransition([snapshot('snapshot-a', TREE_A)], async () => {
        events.push('index:publish');
      }),
    ).resolves.toBeUndefined();

    expect(events).toEqual(['root:prepare', 'index:publish', 'root:cleanup']);
    expect(rootSet.entries.map((entry) => entry.name).sort()).toEqual(['snapshot-a', 'stale']);
  });

  it('surfaces cleanup failures that are not root-set conflicts', async () => {
    const { coordinator, objectProbe, rootSet } = coordinatorFixture([
      { name: 'stale', oid: TREE_C, type: 'tree', retention: 'evictable' },
    ]);
    objectProbe.objectTypes.set(TREE_A, 'tree');
    rootSet.cleanupError = new Error('cleanup failed');

    await expect(coordinator.publishTransition(
      [snapshot('snapshot-a', TREE_A)],
      async () => undefined,
    )).rejects.toThrow(/cleanup failed/);

    rootSet.cleanupError = { code: 7 };
    await expect(coordinator.publishTransition(
      [snapshot('snapshot-a', TREE_A)],
      async () => undefined,
    )).rejects.toEqual({ code: 7 });
  });

  it('reports mismatched roots and malformed doctor output', async () => {
    const { coordinator, objectProbe, rootSet } = coordinatorFixture([
      { name: 'snapshot-a', oid: TREE_C, type: 'tree', retention: 'evictable' },
    ]);
    objectProbe.objectTypes.set(TREE_A, 'tree');

    const mismatch = await coordinator.inspect([snapshot('snapshot-a', TREE_A)]);
    expect(mismatch.unanchoredSnapshotIds).toEqual(['snapshot-a']);
    expect(mismatch.mismatchedRootNames).toEqual(['snapshot-a']);

    rootSet.unhealthyWithoutDetails = true;
    const malformed = await coordinator.inspect([]);
    expect(malformed.rootSetError).toBe('Root-set doctor reported integrity issues');
    expect(malformed.staleRootNames).toEqual([]);
  });

  it('reports missing and stale entries, then repairs every payload that still exists', async () => {
    const { coordinator, objectProbe, rootSet } = coordinatorFixture([
      { name: 'stale', oid: TREE_C, type: 'tree', retention: 'evictable' },
    ]);
    objectProbe.objectTypes.set(TREE_A, 'tree');
    const records = [snapshot('snapshot-a', TREE_A), snapshot('snapshot-b', TREE_B)];

    const before = await coordinator.inspect(records);
    expect(before).toBeInstanceOf(WarpStateCacheRetentionReport);
    expect(before.unanchoredSnapshotIds).toEqual(['snapshot-a']);
    expect(before.missingSnapshotIds).toEqual(['snapshot-b']);
    expect(before.staleRootNames).toEqual(['stale']);

    const repair = await coordinator.repair(records);
    expect(repair).toBeInstanceOf(WarpStateCacheRepairResult);
    expect(repair.anchoredSnapshotIds).toEqual(['snapshot-a']);
    expect(repair.unrecoverableSnapshotIds).toEqual(['snapshot-b']);
    expect(repair.removedStaleRootNames).toEqual(['stale']);
    expect(rootSet.replaceCalls[0]?.entries).toEqual([
      { name: 'snapshot-a', oid: TREE_A, type: 'tree', retention: 'evictable' },
    ]);
    expect(repair.after.missingSnapshotIds).toEqual(['snapshot-b']);
  });

  it('uses root-set repair when metadata is malformed', async () => {
    const { coordinator, objectProbe, rootSet } = coordinatorFixture();
    objectProbe.objectTypes.set(TREE_A, 'tree');
    rootSet.unhealthyMessage = 'malformed root metadata';

    const repair = await coordinator.repair([snapshot('snapshot-a', TREE_A)]);

    expect(rootSet.repairCalls).toHaveLength(1);
    expect(repair.before.rootSetError).toBe('malformed root metadata');
    expect(repair.after.rootSetError).toBeNull();
  });

  it('does not classify a blob payload as an anchorable state tree', async () => {
    const { coordinator, objectProbe } = coordinatorFixture();
    objectProbe.objectTypes.set(TREE_A, 'blob');

    const report = await coordinator.inspect([snapshot('snapshot-a', TREE_A)]);

    expect(report.wrongTypeSnapshotIds).toEqual(['snapshot-a']);
    expect(report.unanchoredSnapshotIds).toEqual([]);
    expect(report.isHealthy()).toBe(false);
  });

  it('opens the root set lazily once', async () => {
    const { coordinator, objectProbe, openedRefs } = coordinatorFixture();
    objectProbe.objectTypes.set(TREE_A, 'tree');

    await coordinator.inspect([snapshot('snapshot-a', TREE_A)]);
    await coordinator.inspect([snapshot('snapshot-a', TREE_A)]);

    expect(openedRefs).toHaveLength(1);
  });
});
