import assert from 'node:assert/strict';

import ContinuumArtifactDescriptor from '../../src/domain/continuum/ContinuumArtifactDescriptor.ts';
import ContinuumEvidenceClaim from '../../src/domain/continuum/ContinuumEvidenceClaim.ts';
import ContinuumReceiptFamilyProjection from '../../src/domain/continuum/ContinuumReceiptFamilyProjection.ts';
import GitWarpReceiptSourceFacts from '../../src/domain/continuum/GitWarpReceiptSourceFacts.ts';
import { DeliveryObservation } from '../../src/domain/types/DeliveryObservation.ts';
import { TickReceipt } from '../../src/domain/types/TickReceipt.ts';
import { GitWarpAdapter } from '../../../../warp-ttd/src/adapters/gitWarpAdapter.ts';
import type { ContinuumReceiptFact, ContinuumReceiptOpFact } from '../../src/domain/continuum/ContinuumReceiptFamilyProjection.ts';

const RECEIPT_SCHEMA_PATH = 'schemas/continuum-receipt-family.graphql';
const PATCH_SHA = '0123456789abcdef0123456789abcdef01234567';
const TRANSLATED_POSTURE = 'translated-git-warp-evidence';

type SmokeGraph = {
  materialize(options: { receipts: true; ceiling?: number | null }): Promise<{
    state: null;
    receipts: SmokeTickReceipt[];
  }>;
  materialize(options?: { receipts?: false; ceiling?: number | null }): Promise<null>;
  discoverWriters(): Promise<string[]>;
  listStrands(): Promise<[]>;
  getNodes(): Promise<[]>;
  getEdges(): Promise<[]>;
  getNodeProps(_nodeId: string): Promise<Record<string, string> | null>;
};

type SmokeTickReceipt = {
  readonly patchSha: string;
  readonly writer: string;
  readonly lamport: number;
  readonly ops: SmokeTickReceiptOp[];
};

type SmokeTickReceiptOp = {
  readonly op: string;
  readonly target: string;
  readonly result: ContinuumReceiptOpFact['result'];
  readonly reason?: string;
};

function makeProjection(): ContinuumReceiptFamilyProjection {
  const descriptor = new ContinuumArtifactDescriptor({
    familyId: 'receipt-family',
    sourceSchemaPath: RECEIPT_SCHEMA_PATH,
    generatedBy: 'wesley witness-continuum --scope receipt-family',
    artifactKind: 'continuum.family.fixture',
    authority: 'generated-fixture',
    targets: ['warp-ttd'],
    witnessScope: 'receipt-family',
  });
  const evidence = new ContinuumEvidenceClaim({
    descriptor,
    posture: TRANSLATED_POSTURE,
  });
  const sourceFacts = new GitWarpReceiptSourceFacts({
    tickReceipt: new TickReceipt({
      patchSha: PATCH_SHA,
      writer: 'writer-a',
      lamport: 3,
      ops: [
        { op: 'NodeAdd', target: 'node:a', result: 'applied' },
        { op: 'PropSet', target: 'node:a\u0000name', result: 'superseded', reason: 'lww-lost' },
        { op: 'NodeAdd', target: 'node:a', result: 'redundant', reason: 'already-present' },
      ],
    }),
    deliveryObservations: [
      new DeliveryObservation({
        emissionId: 'effect:1',
        sinkId: 'sink:warp-ttd-smoke',
        outcome: 'delivered',
        timestamp: 1,
        lens: { mode: 'live', suppressExternal: false },
      }),
    ],
  });

  return new ContinuumReceiptFamilyProjection({ evidence, sourceFacts });
}

function requireGeneratedProjection(value: object): ContinuumReceiptFamilyProjection {
  if (!(value instanceof ContinuumReceiptFamilyProjection)) {
    throw new TypeError('warp-ttd smoke requires generated-family git-warp projection output');
  }
  const witness = value.witnesses[0];
  if (witness === undefined || witness.evidencePosture !== TRANSLATED_POSTURE) {
    throw new TypeError('warp-ttd smoke requires translated git-warp evidence posture');
  }
  return value;
}

function makeGraph(projection: ContinuumReceiptFamilyProjection): SmokeGraph {
  const receipts = projection.receipts.map(toSmokeTickReceipt);
  function materialize(options: { receipts: true; ceiling?: number | null }): Promise<{
    state: null;
    receipts: SmokeTickReceipt[];
  }>;
  // eslint-disable-next-line no-redeclare -- overload signature for warp-ttd adapter contract
  function materialize(options?: { receipts?: false; ceiling?: number | null }): Promise<null>;
  // eslint-disable-next-line no-redeclare -- implementation for the overload signatures above
  function materialize(options?: { receipts?: boolean; ceiling?: number | null }): Promise<{
    state: null;
    receipts: SmokeTickReceipt[];
  } | null> {
    if (options?.receipts === true) {
      return Promise.resolve({ state: null, receipts });
    }
    return Promise.resolve(null);
  }

  return {
    materialize,
    discoverWriters() {
      return Promise.resolve(['writer-a']);
    },
    listStrands() {
      return Promise.resolve([]);
    },
    getNodes() {
      return Promise.resolve([]);
    },
    getEdges() {
      return Promise.resolve([]);
    },
    getNodeProps(_nodeId: string) {
      return Promise.resolve(null);
    },
  };
}

function toSmokeTickReceipt(receipt: Readonly<ContinuumReceiptFact>): SmokeTickReceipt {
  return {
    patchSha: receipt.patchSha,
    writer: receipt.writer,
    lamport: receipt.lamport,
    ops: receipt.ops.map(toSmokeTickReceiptOp),
  };
}

function toSmokeTickReceiptOp(op: Readonly<ContinuumReceiptOpFact>): SmokeTickReceiptOp {
  if (op.reason !== undefined) {
    return {
      op: op.op,
      target: op.target,
      result: op.result,
      reason: op.reason,
    };
  }
  return {
    op: op.op,
    target: op.target,
    result: op.result,
  };
}

const projection = makeProjection();

assert.throws(
  () => requireGeneratedProjection({
    receipts: projection.receipts,
  }),
  /generated-family git-warp projection/,
);

assert.equal(projection.witnesses[0]?.evidencePosture, TRANSLATED_POSTURE);

const acceptedProjection = requireGeneratedProjection(projection);
const adapter = await GitWarpAdapter.create(makeGraph(acceptedProjection));
const receiptSummaries = await adapter.receipts('head:default', 1);
const receipt = receiptSummaries[0];

assert.ok(receipt !== undefined, 'warp-ttd should surface one receipt summary');
assert.equal(receipt.digest, PATCH_SHA);
assert.equal(receipt.writer?.writerId, 'writer-a');
assert.equal(receipt.outputTick, 3);
assert.equal(receipt.admittedRewriteCount, 1);
assert.equal(receipt.rejectedRewriteCount, 1);
assert.equal(receipt.counterfactualCount, 1);

console.log('warp-ttd receipt-family projection smoke passed');
