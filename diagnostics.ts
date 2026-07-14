/**
 * Operator-facing inspection helpers for the v19 application API.
 */

import { resolveReceiptProvenance } from './src/application/ReceiptProvenanceRegistry.ts';
import type WarpStorage from './src/application/WarpStorage.ts';
import WarpError from './src/domain/errors/WarpError.ts';
import type ReadIdentity from './src/domain/services/optic/ReadIdentity.ts';
import type { Receipt } from './src/domain/api/Receipt.ts';

export type InspectReceiptOptions = {
  readonly storage: WarpStorage;
};

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
  readonly timeline: string;
  readonly writer: string;
  readonly reason: string | undefined;
  readonly evidence: 'present' | 'absent';
  readonly objectIds: readonly string[];
  readonly substrate: ReceiptSubstrateInspection;
};

export function inspectReceipt(
  receipt: Receipt,
  options: InspectReceiptOptions
): ReceiptInspection {
  const provenance = resolveReceiptProvenance(receipt, requireInspectStorage(options));
  if (provenance.operation !== receipt.operation) {
    throw new WarpError(
      'Receipt provenance operation does not match the receipt',
      'E_RECEIPT_PROVENANCE_MISMATCH'
    );
  }
  return Object.freeze({
    operation: receipt.operation,
    outcome: receipt.outcome,
    timeline: receipt.timeline,
    writer: receipt.writer,
    reason: receipt.reason,
    evidence: receipt.evidence === undefined ? 'absent' : 'present',
    objectIds: Object.freeze(receiptObjectIds(provenance)),
    substrate: provenance,
  });
}

function requireInspectStorage(options: InspectReceiptOptions): WarpStorage {
  if (typeof options !== 'object' || options === null || !('storage' in options)) {
    throw new WarpError(
      'Receipt inspection requires an explicit storage context',
      'E_RECEIPT_INSPECTION_OPTIONS'
    );
  }
  return options.storage;
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
