import { describe, expect, it } from 'vitest';

import CodecPort from '../../../../../src/ports/CodecPort.ts';
import CryptoPort from '../../../../../src/ports/CryptoPort.ts';
import LoggerPort from '../../../../../src/ports/LoggerPort.ts';
import DetachedGraphFactory, {
  type DetachedGraphInternalReadSurface,
} from '../../../../../src/domain/capabilities/DetachedGraphFactory.ts';
import PatchCollector, {
  type CheckpointData,
  type PatchWithSha,
} from '../../../../../src/domain/capabilities/PatchCollector.ts';
import MaterializeController, {
  type MaterializeDeps,
  type MaterializePersistence,
} from '../../../../../src/domain/services/controllers/MaterializeController.ts';
import MaterializePatchStreamReducer from '../../../../../src/domain/services/controllers/MaterializePatchStreamReducer.ts';
import { createEmptyDiff } from '../../../../../src/domain/types/PatchDiff.ts';
import StateSession from '../../../../../src/domain/orset/session/StateSession.ts';
import PageCache from '../../../../../src/domain/orset/trie/PageCache.ts';
import TrieGeometry from '../../../../../src/domain/orset/trie/TrieGeometry.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import cborCodec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import type CodecValue from '../../../../../src/domain/types/codec/CodecValue.ts';
import type LogFields from '../../../../../src/domain/types/log/LogFields.ts';
import InMemoryCheckpointStore from '../../../../helpers/InMemoryCheckpointStore.ts';
import { InMemoryTrieStore } from '../../../../helpers/trieHelpers.ts';
import InMemoryMaterializationStore from '../../../../helpers/InMemoryMaterializationStore.ts';

describe('MaterializePatchStreamReducer', () => {
  it('reduces each patch before requesting the next stream item', async () => {
    const reduction = await MaterializePatchStreamReducer.reduce(
      {
        source: ephemeralPatchStream(128),
        base: undefined,
        options: { receipts: false, wantDiff: false },
      },
    );

    expect(reduction.summary.patchCount).toBe(128);
    expect(reduction.summary.maxObservedLamport).toBe(128);
    expect(reduction.summary.provenance.patchesFor('node-001')).toEqual(['sha-001']);
    expect(reduction.summary.provenance.patchesFor('node-128')).toEqual(['sha-128']);
    expect(reduction.summary.provenance.has('poisoned-node')).toBe(false);
  });
});

describe('MaterializeController patch streams', () => {
  it('materializes live graphs from the declared frontier stream without loading arrays', async () => {
    const collector = new StreamingOnlyPatchCollector([
      patchEntry(1),
      patchEntry(2),
      patchEntry(3),
    ]);
    const controller = new MaterializeController(materializeDeps(collector));

    const result = await controller.materialize();

    expect(result.patchCount).toBe(3);
    expect(result.maxObservedLamport).toBe(3);
    expect(result.provenanceIndex.patchesFor('node-001')).toEqual(['sha-001']);
    expect(result.provenanceIndex.patchesFor('node-003')).toEqual(['sha-003']);
    expect(collector.streamedWriters).toEqual(['writer-a']);
    expect(collector.writerLoadCount).toBe(0);
  });

  it.each([
    ['plain', { receipts: false, wantDiff: false }],
    ['receipt', { receipts: true, wantDiff: false }],
    ['diff', { receipts: false, wantDiff: true }],
  ] as const)('reduces session-backed patches incrementally in %s mode', async (mode, options) => {
    const collector = new StreamingOnlyPatchCollector(
      Array.from({ length: 128 }, (_, index) => patchEntry(index + 1)),
    );
    const store = new InMemoryTrieStore();
    const controller = new MaterializeController({
      ...materializeDeps(collector),
      openStateSession: async ({ nodeAliveRootOid, edgeAliveRootOid }) =>
        await StateSession.open({
          nodeAliveRootOid,
          edgeAliveRootOid,
          store,
          codec: cborCodec,
          geometry: TrieGeometry.default16way(),
          pageCache: new PageCache({ maxResident: 16 }),
        }),
    });

    const result = await controller.materialize(options);

    expect(result.patchCount).toBe(128);
    expect(result.maxObservedLamport).toBe(128);
    expect(result.provenanceIndex.patchesFor('node-001')).toEqual(['sha-001']);
    expect(result.provenanceIndex.patchesFor('node-128')).toEqual(['sha-128']);
    expect(result.provenanceIndex.has('poisoned-node')).toBe(false);
    expect(collector.writerLoadCount).toBe(0);
    if (mode === 'receipt') {
      expect(result.receipts).toHaveLength(128);
      expect(result.diff).toBeUndefined();
    } else if (mode === 'diff') {
      expect(result.receipts).toBeUndefined();
      expect(result.diff).toEqual(createEmptyDiff());
    } else {
      expect(result.receipts).toBeUndefined();
      expect(result.diff).toBeUndefined();
    }
  });
});

async function* ephemeralPatchStream(count: number): AsyncIterable<PatchWithSha> {
  let previous: PatchWithSha | null = null;
  for (let ordinal = 1; ordinal <= count; ordinal += 1) {
    if (previous !== null) {
      poison(previous);
    }
    const entry = patchEntry(ordinal);
    previous = entry;
    yield entry;
  }
  if (previous !== null) {
    poison(previous);
  }
}

function poison(entry: PatchWithSha): void {
  entry.patch = new Patch({
    writer: 'writer-poison',
    lamport: 0,
    context: {},
    ops: [],
    writes: ['poisoned-node'],
  });
  entry.sha = 'poisoned-sha';
}

function patchEntry(lamport: number): PatchWithSha {
  const suffix = lamport.toString().padStart(3, '0');
  return {
    patch: new Patch({
      writer: 'writer-a',
      lamport,
      context: {},
      ops: [],
      writes: [`node-${suffix}`],
    }),
    sha: `sha-${suffix}`,
  };
}

class StreamingOnlyPatchCollector extends PatchCollector {
  readonly streamedWriters: string[] = [];
  writerLoadCount = 0;
  readonly #entries: readonly PatchWithSha[];

  constructor(entries: readonly PatchWithSha[]) {
    super();
    this.#entries = entries;
  }

  async discoverWriters(): Promise<string[]> {
    return ['writer-a'];
  }

  async loadWriterPatches(_writerId: string): Promise<PatchWithSha[]> {
    this.writerLoadCount += 1;
    throw new Error('loadWriterPatches must not be called by stream materialization');
  }

  override async *streamWriterPatches(writerId: string): AsyncIterable<PatchWithSha> {
    this.streamedWriters.push(writerId);
    yield* ephemeralEntries(this.#entries);
  }

  override async *streamForFrontier(
    frontier: Map<string, string>,
    ceiling: number | null,
  ): AsyncIterable<PatchWithSha> {
    for (const [writerId, tipSha] of frontier) {
      let reachedTip = false;
      for await (const entry of this.streamWriterPatches(writerId)) {
        if (ceiling === null || entry.patch.lamport <= ceiling) {
          yield entry;
        }
        if (entry.sha === tipSha) {
          reachedTip = true;
          break;
        }
      }
      if (!reachedTip) {
        throw new Error(`frontier tip ${tipSha} was not present in the writer stream`);
      }
    }
  }

  async loadCheckpoint(): Promise<CheckpointData | null> {
    return null;
  }

  async loadPatchesSince(_checkpoint: CheckpointData): Promise<PatchWithSha[]> {
    throw new Error('loadPatchesSince must not be called by stream materialization');
  }

  async loadPatchChain(_toSha: string, _fromSha?: string | null): Promise<PatchWithSha[]> {
    throw new Error('loadPatchChain must not be called by live materialization');
  }

  async getFrontier(): Promise<Map<string, string>> {
    const last = this.#entries.at(-1);
    return last === undefined
      ? new Map()
      : new Map([['writer-a', last.sha]]);
  }
}

async function* ephemeralEntries(entries: readonly PatchWithSha[]): AsyncIterable<PatchWithSha> {
  let previous: PatchWithSha | null = null;
  for (const source of entries) {
    if (previous !== null) {
      poison(previous);
    }
    const entry = patchEntry(source.patch.lamport);
    previous = entry;
    yield entry;
  }
  if (previous !== null) {
    poison(previous);
  }
}

function materializeDeps(patches: PatchCollector): MaterializeDeps {
  return {
    logger: new TestLogger(),
    codec: new TestCodec(),
    crypto: new TestCrypto(),
    persistence: new TestPersistence(),
    checkpointStore: new InMemoryCheckpointStore(),
    materializations: new InMemoryMaterializationStore(),
    patches,
    graphCloner: new UnusedDetachedGraphFactory(),
    graphName: 'stream-memory-witness',
  };
}

class TestCodec extends CodecPort {
  encode<TEncoded = CodecValue>(_data: TEncoded): Uint8Array {
    return new Uint8Array([1, 2, 3]);
  }

  decode<TDecoded = CodecValue>(_bytes: Uint8Array): TDecoded {
    throw new Error('decode is not used by stream materialization witness');
  }
}

class TestCrypto extends CryptoPort {
  async hash(_algorithm: string, _data: string | Uint8Array): Promise<string> {
    return 'state-hash';
  }

  async hmac(
    _algorithm: string,
    _key: string | Uint8Array,
    _data: string | Uint8Array,
  ): Promise<Uint8Array> {
    return new Uint8Array([1]);
  }

  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
    return a.length === b.length;
  }
}

class TestLogger extends LoggerPort {
  debug(_message: string, _context?: LogFields): void {}
  info(_message: string, _context?: LogFields): void {}
  warn(_message: string, _context?: LogFields): void {}
  error(_message: string, _context?: LogFields): void {}

  child(_context: LogFields): LoggerPort {
    return this;
  }
}

class TestPersistence implements MaterializePersistence {
  async readRef(_ref: string): Promise<string | null> {
    return null;
  }

  async showNode(_sha: string): Promise<string> {
    return '';
  }

  async readTreeOids(_treeOid: string): Promise<Record<string, string>> {
    return {};
  }

  async readBlob(_oid: string): Promise<Uint8Array> {
    return new Uint8Array();
  }
}

class UnusedDetachedGraphFactory extends DetachedGraphFactory {
  async openReadOnly(): Promise<DetachedGraphInternalReadSurface> {
    throw new Error('detached graph factory is not used by stream materialization witness');
  }
}
