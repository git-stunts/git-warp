/**
 * Host-level witness for the incremental index path (#192).
 *
 * The runtime is opened through the production boot (`openRuntimeHostProduct`
 * to `RuntimeHostBoot`), which passes the storage provider's index store to
 * `MaterializedViewService`. The provider here is the memory test provider;
 * its index store is the real `CborIndexStoreAdapter` with the real CBOR codec.
 * The Git-backed provider is not exercised by this file.
 *
 * Oracle: specified behaviour. `RuntimeHost._buildViewFromResult` catches an
 * index failure, marks the index degraded, and logs `index build failed`.
 * A healthy incremental materialize must do neither.
 */
import { describe, expect, it } from 'vitest';
import RuntimeHost from '../../../../src/domain/RuntimeHost.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import LoggerPort from '../../../../src/ports/LoggerPort.ts';
import type LogFields from '../../../../src/domain/types/log/LogFields.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';
import ManualClock from '../../../helpers/ManualClock.ts';
import { openMemoryRuntimeHostProduct } from '../../../helpers/MemoryRuntimeHost.ts';

const INDEX_FAILURE_MESSAGE = 'index build failed';
const RECEIPT_PATH = 'receipt.cbor';

interface RecordedWarning {
  readonly message: string;
  readonly context: LogFields | undefined;
}

/** In-memory LoggerPort that keeps every warning it receives. */
class WarningRecorder extends LoggerPort {
  readonly warnings: RecordedWarning[] = [];

  override debug(): void {}
  override info(): void {}
  override error(): void {}

  override warn(message: string, context?: LogFields): void {
    this.warnings.push({ message, context });
  }

  override child(): LoggerPort {
    return this;
  }
}

interface OpenedRuntimes {
  /** The runtime under test. It only reads in the materialize cases. */
  readonly runtime: RuntimeHost;
  /** A second writer on the same history, so new patches reach `runtime` only through materialize(). */
  readonly peer: RuntimeHost;
  readonly logger: WarningRecorder;
}

async function openRuntimes(graphName: string): Promise<OpenedRuntimes> {
  const persistence = new InMemoryGraphAdapter();
  const logger = new WarningRecorder();
  const runtime = await openMemoryRuntimeHostProduct({
    persistence, graphName, writerId: 'reader', clock: new ManualClock(), logger,
  });
  const peer = await openMemoryRuntimeHostProduct({
    persistence, graphName, writerId: 'peer', clock: new ManualClock(),
  });
  if (!(runtime instanceof RuntimeHost) || !(peer instanceof RuntimeHost)) {
    throw new Error('expected the production boot to return a RuntimeHost');
  }
  return { runtime, peer, logger };
}

function cachedIndexTree(runtime: RuntimeHost): Record<string, Uint8Array> {
  const tree = runtime._cachedIndexTree;
  if (tree === null) {
    throw new Error('expected the runtime to hold a cached index tree');
  }
  return tree;
}

describe('RuntimeHost incremental index through the production boot wiring', () => {
  it('updates the index incrementally on the second materialize without degrading it', async () => {
    const { runtime, peer, logger } = await openRuntimes('incremental-materialize');
    const first = await peer.createPatch();
    await first.addNode('A').addNode('B').addEdge('A', 'B', 'knows').commit();
    await runtime.materialize();
    const builtReceipt = cachedIndexTree(runtime)[RECEIPT_PATH];

    const second = await peer.createPatch();
    await second.addNode('C').addEdge('B', 'C', 'knows').setProperty('C', 'name', 'Carol').commit();
    await runtime.materialize();

    expect(logger.warnings).toEqual([]);
    expect(runtime._indexDegraded).toBe(false);
    expect(runtime._logicalIndex).not.toBeNull();
    // Only a full build writes the receipt (it records the node count). An
    // unchanged receipt after the node count changed shows the tree came from
    // applyDiff(), not from a second full build.
    expect(builtReceipt).toBeInstanceOf(Uint8Array);
    expect(cachedIndexTree(runtime)[RECEIPT_PATH]).toEqual(builtReceipt);
    await expect(runtime.neighbors('B', 'outgoing')).resolves.toEqual([
      { nodeId: 'C', label: 'knows', direction: 'outgoing' },
    ]);
    await expect(runtime.neighbors('B', 'incoming')).resolves.toEqual([
      { nodeId: 'A', label: 'knows', direction: 'incoming' },
    ]);
    await expect(runtime.getNodeProps('C')).resolves.toMatchObject({ name: 'Carol' });
  });

  it('updates the index incrementally when the runtime commits its own patch', async () => {
    const { runtime, logger } = await openRuntimes('incremental-commit');
    const first = await runtime.createPatch();
    await first.addNode('A').addNode('B').addEdge('A', 'B', 'knows').commit();
    await runtime.materialize();
    const builtReceipt = cachedIndexTree(runtime)[RECEIPT_PATH];

    const second = await runtime.createPatch();
    await second.addNode('C').addEdge('B', 'C', 'knows').commit();

    expect(logger.warnings).toEqual([]);
    expect(runtime._indexDegraded).toBe(false);
    expect(builtReceipt).toBeInstanceOf(Uint8Array);
    expect(cachedIndexTree(runtime)[RECEIPT_PATH]).toEqual(builtReceipt);
    await expect(runtime.neighbors('B', 'outgoing')).resolves.toEqual([
      { nodeId: 'C', label: 'knows', direction: 'outgoing' },
    ]);
  });

  it('degrades the index for one materialize when a cached shard is malformed, then rebuilds', async () => {
    const { runtime, peer, logger } = await openRuntimes('malformed-cached-shard');
    const first = await peer.createPatch();
    await first.addNode('A').commit();
    await runtime.materialize();
    // Seam: the host's own cached tree. No stored shard reaches the adapter at
    // this release, so the cache is the only place a malformed shard can sit.
    const tree = cachedIndexTree(runtime);
    const metaPaths = Object.keys(tree).filter((path) => path.startsWith('meta_'));
    expect(metaPaths).toHaveLength(1);
    const metaPath = String(metaPaths[0]);
    const malformedMeta = defaultCodec.encode({ nodeToGlobal: [['A', 0]], nextLocalId: 'one' });
    runtime._cachedIndexTree = { ...tree, [metaPath]: malformedMeta };

    const second = await peer.createPatch();
    await second.addNode('B').addEdge('A', 'B', 'knows').commit();
    await runtime.materialize();

    expect(logger.warnings).toEqual([{
      message: INDEX_FAILURE_MESSAGE,
      context: { error: `Index shard is malformed: ${metaPath} (id is not a non-negative integer)` },
    }]);
    expect(runtime._indexDegraded).toBe(true);
    expect(runtime._logicalIndex).toBeNull();
    expect(runtime._cachedIndexTree).toBeNull();
    await expect(runtime.hasNode('B')).resolves.toBe(true);
    await expect(runtime.neighbors('A', 'outgoing')).resolves.toEqual([
      { nodeId: 'B', label: 'knows', direction: 'outgoing' },
    ]);

    await runtime.materialize();

    expect(logger.warnings).toHaveLength(1);
    expect(runtime._indexDegraded).toBe(false);
    expect(runtime._logicalIndex).not.toBeNull();
    expect(Object.keys(cachedIndexTree(runtime))).toContain(metaPath);
    await expect(runtime.neighbors('A', 'outgoing')).resolves.toEqual([
      { nodeId: 'B', label: 'knows', direction: 'outgoing' },
    ]);
  });
});
