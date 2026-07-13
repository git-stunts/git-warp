/**
 * Operator-facing inspection helpers for the v19 application API.
 */

import type { Receipt } from './src/domain/api/Receipt.ts';

export type ReceiptInspection = {
  readonly operation: Receipt['operation'];
  readonly outcome: Receipt['outcome'];
  readonly timeline: string;
  readonly writer: string;
  readonly reason: string | undefined;
  readonly evidence: 'present' | 'absent';
  readonly objectIds: readonly string[];
};

export function inspectReceipt(receipt: Receipt): ReceiptInspection {
  const objectIds = receiptObjectIds(receipt);
  return Object.freeze({
    operation: receipt.operation,
    outcome: receipt.outcome,
    timeline: receipt.timeline,
    writer: receipt.writer,
    reason: receipt.reason,
    evidence: receipt.operation === 'read' && receipt.evidence !== undefined ? 'present' : 'absent',
    objectIds: Object.freeze(objectIds),
  });
}

function receiptObjectIds(receipt: Receipt): string[] {
  if (receipt.operation === 'write') {
    return receipt.patchSha === undefined ? [] : [receipt.patchSha];
  }
  if (receipt.operation === 'join') {
    return [...receipt.patchShas];
  }
  if (receipt.evidence === undefined) {
    return [];
  }
  return [
    receipt.evidence.checkpointSha,
    ...receipt.evidence.tailWitnesses.map((witness) => witness.sha),
  ];
}
