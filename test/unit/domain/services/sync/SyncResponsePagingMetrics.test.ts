import { describe, expect, it } from 'vitest';

import PatchEntry from '../../../../../src/domain/artifacts/PatchEntry.ts';
import VersionVector from '../../../../../src/domain/crdt/VersionVector.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import type LogFields from '../../../../../src/domain/types/log/LogFields.ts';
import WarpStream from '../../../../../src/domain/stream/WarpStream.ts';
import {
  createSyncRequest,
  processSyncRequest,
} from '../../../../../src/domain/services/sync/SyncProtocol.ts';
import {
  validateSyncRequest,
  validateSyncResponse,
} from '../../../../../src/domain/services/sync/SyncPayloadSchema.ts';
import CommitPort from '../../../../../src/ports/CommitPort.ts';
import type {
  CommitNodeOptions,
  CommitLogChunk,
  LogNodesOptions,
  NodeInfo,
  PingResult,
} from '../../../../../src/ports/CommitPort.ts';
import LoggerPort from '../../../../../src/ports/LoggerPort.ts';
import PatchJournalPort from '../../../../../src/ports/PatchJournalPort.ts';
import type {
  AppendPatchRequest,
  PublishedPatch,
} from '../../../../../src/ports/PatchJournalPort.ts';
import type { PatchCommitMessage } from '../../../../../src/ports/CommitMessageCodecPort.ts';

const SHA_1 = '1'.repeat(40);
const SHA_2 = '2'.repeat(40);
const SHA_3 = '3'.repeat(40);
const STRICT_SYNC_LIMITS = Object.freeze({
  maxWritersInFrontier: 10,
  maxPatches: 2,
  maxOpsPerPatch: 10,
  maxStringBytes: 256,
  maxBlobBytes: 1024,
});

describe('Sync response paging and metrics', () => {
  it('pages broad sync responses and emits deterministic response metrics', async () => {
    const logger = new RecordingLogger();
    const patchJournal = new StreamingPatchJournal([
      patchEntry('writer-a', SHA_1, 1),
      patchEntry('writer-a', SHA_2, 2),
      patchEntry('writer-a', SHA_3, 3),
    ]);
    const localFrontier = new Map([['writer-a', SHA_3]]);

    const firstRequest = createSyncRequest(new Map(), {
      page: { maxPatches: 2 },
    });
    const first = await processSyncRequest(
      firstRequest,
      localFrontier,
      new UnusedPersistence(),
      'events',
      { patchJournal, logger, observedLatencyMs: 17 },
    );

    expect(first.patches.map((entry) => entry.sha)).toEqual([SHA_1, SHA_2]);
    expect(first.page).toEqual({
      maxPatches: 2,
      cursor: '2',
      hasMore: true,
      returnedPatches: 2,
    });
    expect(first.metrics).toMatchObject({
      patchCount: 2,
      skippedWriterCount: 0,
      latencyMs: 17,
    });
    expect(first.metrics?.estimatedPayloadBytes).toBeGreaterThan(0);

    const secondRequest = createSyncRequest(new Map(), {
      page: { maxPatches: 2, cursor: first.page?.cursor ?? null },
    });
    const second = await processSyncRequest(
      secondRequest,
      localFrontier,
      new UnusedPersistence(),
      'events',
      { patchJournal, logger },
    );

    expect(second.patches.map((entry) => entry.sha)).toEqual([SHA_3]);
    expect(second.page).toEqual({
      maxPatches: 2,
      cursor: null,
      hasMore: false,
      returnedPatches: 1,
    });
    expect(second.metrics?.latencyMs).toBeNull();

    expect(logger.infoCalls).toHaveLength(2);
    expect(logger.infoCalls[0]).toEqual({
      message: 'Sync response metrics',
      context: {
        code: 'SYNC_RESPONSE_METRICS',
        graphName: 'events',
        patchCount: 2,
        skippedWriterCount: 0,
        estimatedPayloadBytes: first.metrics?.estimatedPayloadBytes,
        latencyMs: 17,
        syncResponseCursor: '2',
        syncResponseHasMore: true,
        syncResponseMaxPatches: 2,
      },
    });
  });

  it('validates paged sync request and response payloads at the boundary', () => {
    expect(validateSyncRequest({
      type: 'sync-request',
      frontier: {},
      page: { maxPatches: 2, cursor: '2' },
    }).ok).toBe(true);

    expect(validateSyncRequest({
      type: 'sync-request',
      frontier: {},
      page: { maxPatches: 0 },
    }).ok).toBe(false);

    expect(validateSyncRequest({
      type: 'sync-request',
      frontier: {},
      page: { maxPatches: 3 },
    }, STRICT_SYNC_LIMITS).ok).toBe(false);

    expect(validateSyncResponse({
      type: 'sync-response',
      frontier: {},
      patches: [],
      page: {
        maxPatches: 2,
        cursor: null,
        hasMore: false,
        returnedPatches: 0,
      },
      metrics: {
        patchCount: 0,
        skippedWriterCount: 0,
        estimatedPayloadBytes: 42,
        latencyMs: null,
      },
    }).ok).toBe(true);
  });
});

type LogCall = {
  readonly message: string;
  readonly context: LogFields | undefined;
};

class RecordingLogger extends LoggerPort {
  readonly infoCalls: LogCall[] = [];

  debug(_message: string, _context?: LogFields): void {}

  info(message: string, context?: LogFields): void {
    this.infoCalls.push({ message, context });
  }

  warn(_message: string, _context?: LogFields): void {}

  error(_message: string, _context?: LogFields): void {}

  child(_context: LogFields): LoggerPort {
    return this;
  }
}

class StreamingPatchJournal extends PatchJournalPort {
  private readonly _entries: readonly PatchEntry[];

  constructor(entries: readonly PatchEntry[]) {
    super();
    this._entries = Object.freeze([...entries]);
  }

  async appendPatch(_request: AppendPatchRequest): Promise<PublishedPatch> {
    throw unusedMethod('appendPatch');
  }

  async readPatch(_message: PatchCommitMessage): Promise<Patch> {
    throw unusedMethod('readPatch');
  }

  scanPatchRange(writerId: string, _fromSha: string | null, _toSha: string): WarpStream<PatchEntry> {
    return WarpStream.from(this._entries.filter((entry) => entry.patch.writer === writerId));
  }
}

class UnusedPersistence extends CommitPort {
  async commitNode(_options: CommitNodeOptions): Promise<string> {
    throw unusedMethod('commitNode');
  }

  async showNode(_sha: string): Promise<string> {
    throw unusedMethod('showNode');
  }

  async getNodeInfo(_sha: string): Promise<NodeInfo> {
    throw unusedMethod('getNodeInfo');
  }

  async logNodes(_options: LogNodesOptions): Promise<string> {
    throw unusedMethod('logNodes');
  }

  async logNodesStream(_options: LogNodesOptions): Promise<WarpStream<CommitLogChunk>> {
    throw unusedMethod('logNodesStream');
  }

  async countNodes(_ref: string): Promise<number> {
    throw unusedMethod('countNodes');
  }

  async nodeExists(_sha: string): Promise<boolean> {
    throw unusedMethod('nodeExists');
  }

  async ping(): Promise<PingResult> {
    throw unusedMethod('ping');
  }

}

function patchEntry(writer: string, sha: string, lamport: number): PatchEntry {
  return new PatchEntry({
    sha,
    patch: new Patch({
      writer,
      lamport,
      context: VersionVector.empty(),
      ops: [],
    }),
  });
}

function unusedMethod(methodName: string): Error {
  return new Error(`Unexpected ${methodName} call`);
}
