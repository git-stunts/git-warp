import AssetHandle from '../../src/domain/storage/AssetHandle.ts';
import AuditLogPort, {
  type AppendAuditRecordRequest,
  type AuditLogEntry,
  type PublishedAuditRecord,
} from '../../src/ports/AuditLogPort.ts';
import { testRetentionWitness } from './storageRetention.ts';

type AuditHeadKey = `${string}\0${string}`;

/** Semantic append-only audit log used by audit service tests. */
export default class InMemoryAuditLogAdapter extends AuditLogPort {
  readonly #heads = new Map<AuditHeadKey, string>();
  readonly #entries = new Map<string, AuditLogEntry>();
  #sequence = 0;
  #readFailure: Error | null = null;
  #appendFailure: Error | null = null;

  failReadsWith(error: Error | null): void {
    this.#readFailure = error;
  }

  failAppendsWith(error: Error | null): void {
    this.#appendFailure = error;
  }

  forceHead(graphName: string, writerId: string, sha: string): void {
    this.#heads.set(key(graphName, writerId), sha);
  }

  replaceEntry(sha: string, entry: AuditLogEntry): void {
    if (!this.#entries.has(sha)) {
      throw new Error(`Audit entry not found: ${sha}`);
    }
    this.#entries.set(sha, Object.freeze({
      ...entry,
      parents: Object.freeze([...entry.parents]),
      receipt: entry.receipt.slice(),
    }));
  }

  removeEntry(sha: string): void {
    this.#entries.delete(sha);
  }

  override async readHead(graphName: string, writerId: string): Promise<string | null> {
    if (this.#readFailure !== null) {
      throw this.#readFailure;
    }
    return this.#heads.get(key(graphName, writerId)) ?? null;
  }

  override async listWriterIds(graphName: string): Promise<string[]> {
    const prefix = `${graphName}\0`;
    return [...this.#heads.keys()]
      .filter((entry) => entry.startsWith(prefix))
      .map((entry) => entry.slice(prefix.length))
      .sort();
  }

  override async append(request: AppendAuditRecordRequest): Promise<PublishedAuditRecord> {
    if (this.#appendFailure !== null) {
      throw this.#appendFailure;
    }
    const headKey = key(request.graphName, request.writerId);
    const current = this.#heads.get(headKey) ?? null;
    if (current !== request.expectedHead) {
      throw publicationConflict(current, request.expectedHead);
    }
    const sha = (++this.#sequence).toString(16).padStart(40, '0');
    this.#entries.set(sha, Object.freeze({
      sha,
      message: request.message,
      parents: Object.freeze(request.parent === null ? [] : [request.parent]),
      receipt: request.receipt.slice(),
    }));
    this.#heads.set(headKey, sha);
    const retention = testRetentionWitness(sha);
    return Object.freeze({
      sha,
      stagedReceipt: Object.freeze({
        handle: new AssetHandle(retention.handle.toString()),
        size: request.receipt.byteLength,
        observedAt: retention.observedAt,
        retention: Object.freeze({
          reachability: 'unanchored',
          protection: 'not-established',
        }),
      }),
      retention,
    });
  }

  override async readEntry(sha: string): Promise<AuditLogEntry> {
    const entry = this.#entries.get(sha);
    if (entry === undefined) {
      throw new Error(`Audit entry not found: ${sha}`);
    }
    return entry;
  }
}

function key(graphName: string, writerId: string): AuditHeadKey {
  return `${graphName}\0${writerId}`;
}

function publicationConflict(actual: string | null, expected: string | null): Error {
  return Object.assign(
    new Error(`Publication conflict: expected ${String(expected)}, got ${String(actual)}`),
    { code: 'PUBLICATION_CONFLICT' },
  );
}
