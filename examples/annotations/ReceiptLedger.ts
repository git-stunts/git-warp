import type { ObservationReceipt, WriteReceipt, WriteIntentInput } from '@git-stunts/git-warp';

/** One retained receipt, reduced to what an application audit trail needs. */
export type LedgerEntry = Readonly<{
  operation: string;
  kind: 'write' | 'observe';
  /** `derived`/`plural`/`conflict`/`obstruction` for writes; the Observation status for reads. */
  result: string;
  reason: string | null;
  /** Opaque causal basis the receipt cites; compare it, never parse it. */
  basis: string | null;
  support: number;
}>;

/**
 * Keep receipts.
 *
 * Every `lane.write` returns a WriteReceipt and every Observation settles a
 * receipt. They are the application's record of what was admitted, what was
 * read, and on which causal basis. This ledger keeps them in memory; a real
 * application would append them to its own log or audit store.
 */
export default class ReceiptLedger {
  readonly #entries: LedgerEntry[] = [];

  recordWrite(operation: string, receipt: WriteReceipt<WriteIntentInput>): void {
    this.#entries.push(Object.freeze({
      operation,
      kind: 'write',
      result: receipt.outcome.kind,
      reason: receipt.reason ?? null,
      basis: receipt.evidence.basis.id,
      support: receipt.evidence.support.length,
    }));
  }

  recordObservation(operation: string, receipt: ObservationReceipt): void {
    this.#entries.push(Object.freeze({
      operation,
      kind: 'observe',
      result: receipt.status,
      reason: receipt.reason ?? null,
      basis: receipt.evidence?.basis.id ?? null,
      support: receipt.evidence?.support.length ?? 0,
    }));
  }

  get entries(): readonly LedgerEntry[] {
    return Object.freeze([...this.#entries]);
  }

  /** Receipts that did not settle cleanly: obstructed writes and incomplete reads. */
  get unsettled(): readonly LedgerEntry[] {
    return this.entries.filter((entry) => entry.result !== 'derived' && entry.result !== 'completed');
  }
}
