import { describe, expect, it } from 'vitest';

import AllocationProvenance from '../../../src/domain/migrations/AllocationProvenance.ts';
import DotCollision from '../../../src/domain/repair/DotCollision.ts';
import DotRepairRecord from '../../../src/domain/repair/DotRepairRecord.ts';
import type CodecValue from '../../../src/domain/types/codec/CodecValue.ts';
import type LogFields from '../../../src/domain/types/log/LogFields.ts';
import defaultCodec from '../../../src/infrastructure/codecs/CborCodec.ts';
import AllocationProvenancePort from '../../../src/ports/AllocationProvenancePort.ts';
import CodecPort, { type CodecDecodeBound } from '../../../src/ports/CodecPort.ts';
import LoggerPort from '../../../src/ports/LoggerPort.ts';
import DotRepairStorePort from '../../../src/ports/DotRepairStorePort.ts';
import type RuntimeStorageProviderPort from '../../../src/ports/RuntimeStorageProviderPort.ts';
import type { RuntimeStorageRequest, RuntimeStorageServices } from '../../../src/ports/RuntimeStorageProviderPort.ts';
import InMemoryGraphAdapter from '../../helpers/InMemoryGraphAdapter.ts';
import ManualClock from '../../helpers/ManualClock.ts';
import { createMemoryRuntimeStorage, openMemoryRuntimeHostProduct } from '../../helpers/MemoryRuntimeHost.ts';
import SequenceRandomPort from '../../helpers/SequenceRandomPort.ts';
import { createStateBuilder } from '../../helpers/stateBuilder.ts';

const GRAPH = 'runtime-host-paths';
const COMMIT = 'c'.repeat(40);

/** Answers every allocation as resolved to one mint id, and records each question. */
class ResolvingProvenance extends AllocationProvenancePort {
  readonly questions: Array<readonly [string, number, string]> = [];

  override resolve(commit: string, operationIndex: number, original: string): Promise<AllocationProvenance> {
    this.questions.push([commit, operationIndex, original]);
    return Promise.resolve(new AllocationProvenance({ status: 'resolved', original, identity: 'mint:7', candidates: [] }));
  }
}

/** The CBOR codec, except that once armed its next encode throws a string, as a foreign codec might. */
class FaultingCodec extends CodecPort {
  private failure: string | null = null;

  failNextEncode(failure: string): void {
    this.failure = failure;
  }

  override encode<TEncoded = CodecValue>(data: TEncoded): Uint8Array {
    const { failure } = this;
    this.failure = null;
    if (failure !== null) {
      throw failure;
    }
    return defaultCodec.encode(data);
  }

  override decode<TDecoded = CodecValue>(bytes: Uint8Array): TDecoded {
    return defaultCodec.decode<TDecoded>(bytes);
  }

  override decodeWithin<TDecoded = CodecValue>(bytes: Uint8Array, bound: CodecDecodeBound): TDecoded {
    return defaultCodec.decodeWithin<TDecoded>(bytes, bound);
  }
}

/** Keeps every warning with its fields. */
class WarningFields extends LoggerPort {
  readonly warnings: Array<readonly [string, LogFields | undefined]> = [];

  override debug(): void {}
  override info(): void {}
  override error(): void {}
  override warn(message: string, fields?: LogFields): void {
    this.warnings.push([message, fields]);
  }
  override child(): LoggerPort {
    return this;
  }
}

/** A repair store holding one recorded collision and the repairs written since, in memory. */
class OneCollisionRepairs extends DotRepairStorePort {
  readonly records = new Map<string, DotRepairRecord>();

  constructor(private readonly collision: DotCollision) {
    super();
  }

  override collisions(): Promise<readonly DotCollision[]> {
    return Promise.resolve([this.collision]);
  }

  override repairs(): Promise<readonly DotRepairRecord[]> {
    return Promise.resolve([...this.records.values()]);
  }

  override readRepair(repairId: string): Promise<DotRepairRecord | null> {
    return Promise.resolve(this.records.get(repairId) ?? null);
  }

  override writeRepair(record: DotRepairRecord): Promise<void> {
    this.records.set(record.repairId, record);
    return Promise.resolve();
  }
}

/** Memory storage whose services one test replaces in part. */
class OverriddenStorage implements RuntimeStorageProviderPort {
  constructor(
    private readonly inner: RuntimeStorageProviderPort,
    private readonly override: (services: RuntimeStorageServices) => RuntimeStorageServices,
  ) {}

  async createRuntimeStorageServices(request: RuntimeStorageRequest): Promise<RuntimeStorageServices> {
    return this.override(await this.inner.createRuntimeStorageServices(request));
  }
}

async function openOver(override: (services: RuntimeStorageServices) => RuntimeStorageServices) {
  const persistence = new InMemoryGraphAdapter();
  const clock = new ManualClock();
  const runtimeStorage = new OverriddenStorage(createMemoryRuntimeStorage(persistence, clock), override);
  return await openMemoryRuntimeHostProduct({ persistence, runtimeStorage, clock, graphName: GRAPH, writerId: 'alice' });
}

async function openWithProvenance(provenance: AllocationProvenancePort | null) {
  return await openOver(({ allocationProvenance: _replaced, ...services }) => (
    provenance === null ? services : { ...services, allocationProvenance: provenance }
  ));
}

describe('RuntimeHost paths (#1112)', () => {
  it('returns the compacted graph when automatic GC compacts during materialization', async () => {
    const persistence = new InMemoryGraphAdapter();
    const clock = new ManualClock();
    const writer = await openMemoryRuntimeHostProduct({ persistence, clock, graphName: GRAPH, writerId: 'alice' });
    await writer.patch((patch) => { patch.addNode('n:1'); });
    // Oracle: GCPolicy.evaluate runs GC once the entry count exceeds its threshold; zero admits any node.
    const reader = await openMemoryRuntimeHostProduct({
      persistence, clock, graphName: GRAPH, writerId: 'reader', gcPolicy: { enabled: true, entryCountThreshold: 0 },
    });

    const graph = await reader._materializeGraph();

    expect(graph).not.toBeNull();
    expect(graph.state.nodeAlive.contains('n:1')).toBe(true);
  });

  it('draws the index verification seed from the injected entropy when given no options', async () => {
    const random = new SequenceRandomPort(0x40);
    const host = await openMemoryRuntimeHostProduct({
      persistence: new InMemoryGraphAdapter(), clock: new ManualClock(), random, graphName: GRAPH, writerId: 'alice',
    });
    await host.patch((patch) => { patch.addNode('n:1'); });
    await host.materialize();
    const drawsBefore = random.requests.length;

    host.verifyIndex();

    // Oracle: MaterializedViewVerifier draws SEED_ENTROPY_BYTES (4) only when options.seed is absent.
    expect(random.requests.slice(drawsBefore)).toEqual([4]);
  });

  it('resolves an allocation through the runtime migration provenance store', async () => {
    const provenance = new ResolvingProvenance();
    const host = await openWithProvenance(provenance);

    const resolved = await host.resolveAllocationProvenance(COMMIT, 2, 'next:2');

    expect([resolved, provenance.questions]).toEqual([
      new AllocationProvenance({ status: 'resolved', original: 'next:2', identity: 'mint:7', candidates: [] }),
      [[COMMIT, 2, 'next:2']],
    ]);
  });

  it('reports an allocation as unmapped when the runtime keeps no provenance store', async () => {
    const host = await openWithProvenance(null);

    const resolved = await host.resolveAllocationProvenance(COMMIT, 2, 'next:2');

    expect(resolved).toEqual(AllocationProvenance.unmapped('next:2'));
  });

  it('finishes an edge repair interrupted after its commit by recognising the edge that commit added', async () => {
    const edge = 'a\0b\0knows';
    const repairs = new OneCollisionRepairs(new DotCollision({
      scope: 'lane', dot: 'alice:1', sites: [{ commit: COMMIT, target: edge }, { commit: 'd'.repeat(40), target: 'gone' }],
    }));
    const host = await openOver((services) => ({ ...services, dotRepairs: repairs }));
    await host.patch((patch) => { patch.addNode('a').addNode('b').addEdge('a', 'b', 'knows'); });
    const applied = await host.applyDotRepair({ dot: 'alice:1', policy: 'separate' });
    // An apply that stopped after its commit, before it marked the record applied.
    repairs.records.set(applied.repairId, new DotRepairRecord({ ...applied, status: 'pending', commits: [] }));

    const finished = await host.applyDotRepair({ dot: 'alice:1', policy: 'separate' });

    expect([finished, (await host.getWriterPatches('repair.alice')).length]).toEqual([applied, 1]);
  });

  it('degrades the index and logs the thrown text when the codec throws something that is not an Error', async () => {
    const codec = new FaultingCodec();
    const logger = new WarningFields();
    const host = await openMemoryRuntimeHostProduct({
      persistence: new InMemoryGraphAdapter(), clock: new ManualClock(), codec, logger, graphName: GRAPH, writerId: 'alice',
    });
    codec.failNextEncode('codec exploded');

    host._buildViewFromResult({ state: createStateBuilder().node('n:1').build(), stateHash: 'unbuilt-state' });

    expect(logger.warnings).toEqual([['index build failed', { error: 'codec exploded' }]]);
  });

  it('admits writers it cannot verify under a log-only trust override on a host opened without trust or a logger', async () => {
    const clock = new ManualClock();
    const peer = await openMemoryRuntimeHostProduct({ persistence: new InMemoryGraphAdapter(), clock, graphName: GRAPH, writerId: 'bob' });
    await peer.patch((patch) => { patch.addNode('n:bob'); });
    const local = await openMemoryRuntimeHostProduct({ persistence: new InMemoryGraphAdapter(), clock, graphName: GRAPH, writerId: 'alice' });

    const result = await local.syncWith(peer, { trust: { mode: 'log-only' } });

    expect(result.applied).toBe(1);
  });
});
