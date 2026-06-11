import NodeAdd from '../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../src/domain/types/ops/NodeRemove.ts';
import EdgeAdd from '../../src/domain/types/ops/EdgeAdd.ts';
import EdgeRemove from '../../src/domain/types/ops/EdgeRemove.ts';
import PropSet from '../../src/domain/types/ops/PropSet.ts';
import NodePropSet from '../../src/domain/types/ops/NodePropSet.ts';
import EdgePropSet from '../../src/domain/types/ops/EdgePropSet.ts';
import BlobValue from '../../src/domain/types/ops/BlobValue.ts';
import type { PatchOp } from '../../src/domain/types/ops/unions.ts';
import Patch from '../../src/domain/types/Patch.ts';
import VersionVector from '../../src/domain/crdt/VersionVector.ts';
import { Dot } from '../../src/domain/crdt/Dot.ts';
import { normalizeRawOp } from '../../src/domain/services/OpNormalizer.ts';
import { encode } from '../../src/infrastructure/codecs/CborCodec.ts';
import { encodePatchMessage } from '../../src/domain/services/codec/WarpMessageCodec.ts';
import { generateOidFromNumber } from './WarpGraphObjectIds.ts';

type PatchContext = ConstructorParameters<typeof Patch>[0]['context'];
type PatchOps = ConstructorParameters<typeof Patch>[0]['ops'];
type RawDotInput = {
  readonly writerId?: string;
  readonly counter?: number;
};

type RawPatchInputOperation = {
  readonly type: string;
  readonly node?: string;
  readonly dot?: Dot | RawDotInput;
  readonly scope?: number;
  readonly observedDots?: Iterable<string>;
  readonly from?: string;
  readonly to?: string;
  readonly label?: string;
  readonly key?: string;
  readonly value?: InlineFixtureValue | InlineValueFixture;
  readonly oid?: string;
};

type PatchInputOperation = PatchOp | RawPatchInputOperation;

type InlineFixtureValue =
  | string
  | number
  | boolean
  | null
  | Uint8Array
  | readonly InlineFixtureValue[]
  | { readonly [key: string]: InlineFixtureValue };

type PatchBufferOperation = { readonly type: string; readonly [key: string]: object | string | number | boolean | null | undefined };

type MockPatchOptions = {
  readonly sha: string;
  readonly patchOid: string;
  readonly graphName: string;
  readonly writerId: string;
  readonly lamport: number;
  readonly ops?: readonly PatchBufferOperation[];
  readonly parentSha?: string | null;
};

type MockPatchWithIoOptions = Omit<MockPatchOptions, 'patchOid'> & {
  readonly ops: readonly PatchBufferOperation[];
  readonly reads?: readonly string[];
  readonly writes?: readonly string[];
};

class InlineValueFixture {
  readonly type = 'inline';

  constructor(readonly value: InlineFixtureValue) {
    Object.freeze(this);
  }
}

class PatchFixtureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PatchFixtureError';
  }
}

function isPatchOp(op: PatchInputOperation | ReturnType<typeof normalizeRawOp>): op is PatchOp {
  return op instanceof NodeAdd
    || op instanceof NodeRemove
    || op instanceof EdgeAdd
    || op instanceof EdgeRemove
    || op instanceof PropSet
    || op instanceof NodePropSet
    || op instanceof EdgePropSet
    || op instanceof BlobValue;
}

function normalizePatchInputOps(ops: readonly PatchInputOperation[]): PatchOps {
  const normalized: PatchOps = [];
  for (const op of ops) {
    const patchOp = isPatchOp(op) ? op : normalizeRawOp(op);
    if (!isPatchOp(patchOp)) {
      throw new PatchFixtureError(`Unsupported patch fixture op: ${patchOp.type}`);
    }
    normalized.push(patchOp);
  }
  return normalized;
}

class PatchBufferFixture {
  readonly schema = 2;
  readonly context: { readonly [writerId: string]: number };
  readonly reads: readonly string[] | undefined;
  readonly writes: readonly string[] | undefined;

  constructor(
    readonly writer: string,
    readonly lamport: number,
    readonly ops: readonly PatchBufferOperation[],
    reads?: readonly string[],
    writes?: readonly string[],
  ) {
    this.context = Object.freeze({ [writer]: lamport });
    this.reads = reads && reads.length > 0 ? Object.freeze([...reads]) : undefined;
    this.writes = writes && writes.length > 0 ? Object.freeze([...writes]) : undefined;
    Object.freeze(this);
  }
}

class MockPatchFixture {
  readonly patchBuffer: Uint8Array;
  readonly message: string;
  readonly patch: PatchBufferFixture;
  readonly nodeInfo: {
    readonly sha: string;
    readonly message: string;
    readonly author: string;
    readonly date: string;
    readonly parents: readonly string[];
  };

  constructor(
    readonly sha: string,
    readonly patchOid: string,
    readonly graphName: string,
    readonly writerId: string,
    readonly lamport: number,
    ops: readonly PatchBufferOperation[],
    reads?: readonly string[],
    writes?: readonly string[],
    parentSha: string | null = null,
  ) {
    this.patch = new PatchBufferFixture(writerId, lamport, ops, reads, writes);
    this.patchBuffer = encode(this.patch);
    this.message = encodePatchMessage({ graph: graphName, writer: writerId, lamport, patchOid, schema: 2 });
    this.nodeInfo = Object.freeze({
      sha,
      message: this.message,
      author: 'Test <test@example.com>',
      date: '2026-01-01T00:00:00.000Z',
      parents: parentSha ? [parentSha] : [],
    });
    Object.freeze(this);
  }
}

export function createInlineValue(value: InlineFixtureValue): InlineValueFixture {
  return new InlineValueFixture(value);
}

export function createMockPatchWithIO(options: MockPatchWithIoOptions, oidGenerator: () => string): MockPatchFixture {
  return new MockPatchFixture(
    options.sha,
    oidGenerator(),
    options.graphName,
    options.writerId,
    options.lamport,
    options.ops,
    options.reads,
    options.writes,
    options.parentSha ?? null,
  );
}

export function createMockPatch({
  sha,
  patchOid,
  graphName,
  writerId,
  lamport,
  ops = [],
  parentSha = null,
}: MockPatchOptions): MockPatchFixture {
  return new MockPatchFixture(sha, patchOid, graphName, writerId, lamport, ops, undefined, undefined, parentSha);
}

export function createNodeAddV2(node: string, dot: Dot): NodeAdd {
  return new NodeAdd(node, dot);
}

export function createNodeRemoveV2(observedDots: readonly string[]): { readonly type: 'NodeRemove'; readonly observedDots: readonly string[] } {
  return Object.freeze({ type: 'NodeRemove', observedDots: Object.freeze([...observedDots]) });
}

export function createNodeTombstoneV2(
  node: string,
  observedDots: readonly string[],
): { readonly type: 'NodeTombstone'; readonly node: string; readonly observedDots: readonly string[] } {
  return Object.freeze({ type: 'NodeTombstone', node, observedDots: Object.freeze([...observedDots]) });
}

export function createEdgeAddV2(from: string, to: string, label: string, dot: Dot): EdgeAdd {
  return new EdgeAdd({ from, to, label, dot });
}

export function createEdgeTombstoneV2(
  from: string,
  to: string,
  label: string,
  observedDots: readonly string[],
): { readonly type: 'EdgeTombstone'; readonly from: string; readonly to: string; readonly label: string; readonly observedDots: readonly string[] } {
  return Object.freeze({ type: 'EdgeTombstone', from, to, label, observedDots: Object.freeze([...observedDots]) });
}

export function createPropSetV2(node: string, key: string, value: InlineFixtureValue | InlineValueFixture): PropSet {
  return new PropSet(node, key, value);
}

export function createPatch({ writer, lamport, ops, context = VersionVector.empty() }: {
  readonly writer: string;
  readonly lamport: number;
  readonly ops: readonly PatchInputOperation[];
  readonly context?: PatchContext;
}): Patch {
  return new Patch({ schema: 2, writer, lamport, ops: normalizePatchInputOps(ops), context });
}

export function createSamplePatches(): {
  readonly patchA: { readonly patch: Patch; readonly sha: string };
  readonly patchB: { readonly patch: Patch; readonly sha: string };
  readonly patchC: { readonly patch: Patch; readonly sha: string };
} {
  return Object.freeze({
    patchA: Object.freeze({
      patch: createPatch({
        writer: 'A',
        lamport: 1,
        ops: [createNodeAddV2('node-a', Dot.create('A', 1))],
      }),
      sha: generateOidFromNumber(0xaaaa1111),
    }),
    patchB: Object.freeze({
      patch: createPatch({
        writer: 'B',
        lamport: 2,
        ops: [createNodeAddV2('node-b', Dot.create('B', 1))],
      }),
      sha: generateOidFromNumber(0xbbbb2222),
    }),
    patchC: Object.freeze({
      patch: createPatch({
        writer: 'C',
        lamport: 3,
        ops: [
          createEdgeAddV2('node-a', 'node-b', 'connects', Dot.create('C', 1)),
          createPropSetV2('node-a', 'name', createInlineValue('Alice')),
        ],
      }),
      sha: generateOidFromNumber(0xcccc3333),
    }),
  });
}
