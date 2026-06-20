import SyncError from '../../errors/SyncError.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import type { DecodedPatch } from './syncPatchLoader.ts';

/** Page request for bounded sync responses. */
export interface SyncRequestPage {
  maxPatches: number;
  cursor?: string | null;
}

/** Page metadata returned with a sync response. */
export interface SyncResponsePage {
  maxPatches: number | null;
  cursor: string | null;
  hasMore: boolean;
  returnedPatches: number;
}

/** Deterministic response-shaping metrics for sync operators. */
export interface SyncResponseMetrics {
  patchCount: number;
  skippedWriterCount: number;
  estimatedPayloadBytes: number;
  latencyMs: number | null;
}

export interface CreateSyncRequestOptions {
  page?: SyncRequestPage;
}

export interface NormalizedSyncPageRequest {
  maxPatches: number | null;
  cursorOffset: number;
}

export interface SyncPagePatchEntry {
  writerId: string;
  sha: string;
  patch: DecodedPatch;
}

export interface SyncPageSkippedWriterEntry {
  writerId: string;
  reason: string;
  localSha: string;
  remoteSha: string | null;
}

interface PageAppendOptions {
  patches: SyncPagePatchEntry[];
  entry: SyncPagePatchEntry;
  page: NormalizedSyncPageRequest;
  seenPatches: number;
}

export interface PageAppendResult {
  seenPatches: number;
  hasMore: boolean;
  cursor: string | null;
}

export interface SyncResponsePayloadEstimateInput {
  frontier: Record<string, string>;
  patches: readonly SyncPagePatchEntry[];
  skippedWriters: readonly SyncPageSkippedWriterEntry[];
  page: SyncResponsePage;
}

export interface SyncResponseMetricsLogInput {
  logger: LoggerPort;
  graphName: string;
  page: SyncResponsePage;
  metrics: SyncResponseMetrics;
}

export function normalizeSyncPageRequest(page: SyncRequestPage | undefined): NormalizedSyncPageRequest {
  if (page === undefined) {
    return { maxPatches: null, cursorOffset: 0 };
  }
  return {
    maxPatches: requirePositiveMaxPatches(page.maxPatches),
    cursorOffset: cursorOffsetFor(page.cursor ?? null),
  };
}

export function appendPatchForPage(options: PageAppendOptions): PageAppendResult {
  if (options.seenPatches < options.page.cursorOffset) {
    return { seenPatches: options.seenPatches + 1, hasMore: false, cursor: null };
  }
  if (options.page.maxPatches !== null && options.patches.length >= options.page.maxPatches) {
    return { seenPatches: options.seenPatches, hasMore: true, cursor: options.seenPatches.toString() };
  }
  options.patches.push(options.entry);
  return { seenPatches: options.seenPatches + 1, hasMore: false, cursor: null };
}

export function normalizeObservedLatencyMs(value: number | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  if (Number.isFinite(value) && value >= 0) {
    return value;
  }
  throw new SyncError('Sync response observed latency must be non-negative when provided', {
    code: 'E_SYNC_METRICS_INVALID',
    context: { field: 'observedLatencyMs', value },
  });
}

export function estimateResponsePayloadBytes(input: SyncResponsePayloadEstimateInput): number {
  let bytes = 'sync-response'.length + estimateFrontierBytes(input.frontier);
  for (const entry of input.patches) {
    bytes += entry.writerId.length + entry.sha.length + estimatePatchBytes(entry.patch);
  }
  bytes += estimateSkippedWriterBytes(input.skippedWriters);
  bytes += (input.page.cursor ?? '').length + String(input.page.maxPatches ?? '').length;
  bytes += String(input.page.hasMore).length + input.page.returnedPatches.toString().length;
  return bytes;
}

export function logResponseMetrics(input: SyncResponseMetricsLogInput): void {
  input.logger.info('Sync response metrics', {
    code: 'SYNC_RESPONSE_METRICS',
    graphName: input.graphName,
    patchCount: input.metrics.patchCount,
    skippedWriterCount: input.metrics.skippedWriterCount,
    estimatedPayloadBytes: input.metrics.estimatedPayloadBytes,
    latencyMs: input.metrics.latencyMs,
    syncResponseCursor: input.page.cursor,
    syncResponseHasMore: input.page.hasMore,
    syncResponseMaxPatches: input.page.maxPatches,
  });
}

function requirePositiveMaxPatches(value: number): number {
  if (Number.isInteger(value) && value > 0) {
    return value;
  }
  throw new SyncError('Sync response page maxPatches must be a positive integer', {
    code: 'E_SYNC_PAGING_INVALID',
    context: { field: 'maxPatches', value },
  });
}

function cursorOffsetFor(cursor: string | null): number {
  if (cursor === null) {
    return 0;
  }
  const cursorOffset = Number.parseInt(cursor, 10);
  if (Number.isInteger(cursorOffset) && cursorOffset >= 0 && cursorOffset.toString() === cursor) {
    return cursorOffset;
  }
  throw new SyncError('Sync response page cursor must be a non-negative integer string', {
    code: 'E_SYNC_PAGING_INVALID',
    context: { field: 'cursor', value: cursor },
  });
}

function estimateFrontierBytes(frontier: Record<string, string>): number {
  let bytes = 0;
  for (const [writerId, sha] of Object.entries(frontier)) {
    bytes += writerId.length + sha.length;
  }
  return bytes;
}

function estimateStringArrayBytes(values: readonly string[] | undefined): number {
  if (values === undefined) {
    return 0;
  }
  return values.reduce((total, value) => total + value.length, 0);
}

function estimatePatchBytes(patch: DecodedPatch): number {
  let bytes = patch.writer.length + patch.lamport.toString().length + patch.ops.length;
  if (patch.schema !== undefined) {
    bytes += patch.schema.toString().length;
  }
  for (const op of patch.ops) {
    bytes += op.type.length;
  }
  bytes += estimateStringArrayBytes(patch.reads);
  bytes += estimateStringArrayBytes(patch.writes);
  return bytes;
}

function estimateSkippedWriterBytes(skippedWriters: readonly SyncPageSkippedWriterEntry[]): number {
  let bytes = 0;
  for (const skipped of skippedWriters) {
    bytes += skipped.writerId.length + skipped.reason.length + skipped.localSha.length;
    bytes += skipped.remoteSha === null ? 0 : skipped.remoteSha.length;
  }
  return bytes;
}
