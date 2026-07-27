/**
 * Operator-facing inspection helpers for the v19 application API.
 */

import { resolveReceiptProvenance } from './src/application/ReceiptProvenanceRegistry.ts';
import WarpError from './src/domain/errors/WarpError.ts';
import type ReadIdentity from './src/domain/services/optic/ReadIdentity.ts';
import type { Receipt } from './src/domain/api/Receipt.ts';

export type ReceiptSubstrateInspection =
  | {
      readonly operation: 'write';
      readonly patchSha: string | undefined;
    }
  | {
      readonly operation: 'read';
      readonly identity: ReadIdentity | undefined;
    }
  | {
      readonly operation: 'join';
      readonly patchShas: readonly string[];
    };

export type ReceiptInspection = {
  readonly operation: Receipt['operation'];
  readonly outcome: Receipt['outcome'];
  readonly lane: string;
  readonly writer: string;
  readonly reason: string | undefined;
  readonly evidence: 'present' | 'absent';
  readonly objectIds: readonly string[];
  readonly substrate: ReceiptSubstrateInspection;
};

export function inspectReceipt(receipt: Receipt): ReceiptInspection {
  const provenance = resolveReceiptProvenance(receipt);
  if (provenance.operation !== receipt.operation) {
    throw new WarpError(
      'Receipt provenance operation does not match the receipt',
      'E_RECEIPT_PROVENANCE_MISMATCH'
    );
  }
  return Object.freeze({
    operation: receipt.operation,
    outcome: receipt.outcome,
    lane: receipt.operation === 'write' ? receipt.lane : receipt.timeline,
    writer: receipt.writer,
    reason: receipt.reason,
    evidence: receipt.evidence === undefined ? 'absent' : 'present',
    objectIds: Object.freeze(receiptObjectIds(provenance)),
    substrate: provenance,
  });
}

function receiptObjectIds(provenance: ReceiptSubstrateInspection): string[] {
  if (provenance.operation === 'write') {
    return provenance.patchSha === undefined ? [] : [provenance.patchSha];
  }
  if (provenance.operation === 'join') {
    return [...provenance.patchShas];
  }
  if (provenance.identity === undefined) {
    return [];
  }
  return [
    ...new Set([
      provenance.identity.checkpointSha,
      ...provenance.identity.checkpointFrontier.map((entry) => entry.patchSha),
      ...provenance.identity.checkpointIndexShards.map((shard) => shard.oid),
      ...provenance.identity.tailWitnesses.map((witness) => witness.sha),
    ]),
  ];
}
