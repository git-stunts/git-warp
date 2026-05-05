/**
 * Mock TrustChainPort for testing.
 *
 * Backed by an in-memory array of TrustRecord instances.
 * readRecords() yields them as an async iterable.
 */

import TrustChainPort from '../../src/ports/TrustChainPort.ts';
import type { TrustChainTip } from '../../src/ports/TrustChainPort.ts';
import { TrustRecord } from '../../src/domain/trust/TrustRecord.ts';

class MockTrustChainPort extends TrustChainPort {
  private _records: TrustRecord[] = [];
  private _shouldThrow: Error | null = null;

  /** Seed with records (oldest first). */
  seed(records: TrustRecord[]): void {
    this._records = [...records];
  }

  /** Make readRecords throw on next call. */
  failWith(err: Error): void {
    this._shouldThrow = err;
  }

  async readTip(): Promise<TrustChainTip | null> {
    if (this._records.length === 0) {
      return null;
    }
    const last = this._records[this._records.length - 1]!;
    return { tipSha: `mock-sha-${last.recordId.slice(0, 8)}`, recordId: last.recordId };
  }

  async *readRecords(): AsyncIterable<TrustRecord> {
    if (this._shouldThrow) {
      const err = this._shouldThrow;
      this._shouldThrow = null;
      throw err;
    }
    for (const record of this._records) {
      yield record;
    }
  }

  async persistRecord(
    _graphName: string,
    record: TrustRecord,
    _parentTipSha: string | null,
  ): Promise<string> {
    this._records.push(record);
    return `mock-sha-${record.recordId.slice(0, 8)}`;
  }
}

export { MockTrustChainPort };
