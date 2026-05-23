/**
 * QueryContent — content register lookup and blob access.
 *
 * Pure functions for reading content attachments from materialized
 * CRDT state and resolving blob bytes from storage.
 */

import ContentAttachmentProjection from '../ContentAttachmentProjection.ts';
import QueryError from '../../errors/QueryError.ts';
import type ContentAttachmentRecord from '../../graph/ContentAttachmentRecord.ts';
import type { ContentMeta } from '../../types/ContentMeta.ts';
import type WarpState from '../state/WarpState.ts';
import type { QueryContentHost } from './ReadGraphHost.ts';

// ── Types ───────────────────────────────────────────────────────────

export type { ContentMeta };

/** Identifies an edge by its three-part key. */
export type EdgeId = {
  from: string;
  to: string;
  label: string;
};

// ── Content attachment projection ───────────────────────────────────

function contentMetaFromRecord(record: ContentAttachmentRecord): ContentMeta {
  return {
    oid: record.payload.oid.toString(),
    mime: record.payload.mime?.toString() ?? null,
    size: record.payload.size?.toNumber() ?? null,
  };
}

function contentOidFromRecord(record: ContentAttachmentRecord): string {
  return record.payload.oid.toString();
}

function nodeContentAttachment(state: WarpState, nodeId: string): ContentAttachmentRecord | null {
  return ContentAttachmentProjection.forNode(state, nodeId);
}

function edgeContentAttachment(state: WarpState, edge: EdgeId): ContentAttachmentRecord | null {
  return ContentAttachmentProjection.forEdge(state, edge);
}

// ── Blob resolution ─────────────────────────────────────────────────

async function resolveBlob(host: QueryContentHost, oid: string): Promise<Uint8Array> {
  if (host._blobStorage) {
    return await host._blobStorage.retrieve(oid);
  }
  return await host._persistence.readBlob(oid);
}

function resolveBlobStream(host: QueryContentHost, oid: string): AsyncIterable<Uint8Array> | null {
  if (host._blobStorage && typeof host._blobStorage.retrieveStream === 'function') {
    return host._blobStorage.retrieveStream(oid);
  }
  return null;
}

export function singleChunkIterable(buf: Uint8Array): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
      let done = false;
      return {
        next(): Promise<IteratorResult<Uint8Array>> {
          if (done) { return Promise.resolve({ value: undefined, done: true }); }
          done = true;
          return Promise.resolve({ value: buf, done: false });
        },
      };
    },
  };
}

// ── Host-dependent node content ─────────────────────────────────────

async function ensureAndGetState(host: QueryContentHost): Promise<WarpState> {
  await host._ensureFreshState();
  if (host._cachedState === null) {
    throw new QueryError('host state is null after _ensureFreshState', { code: 'E_NO_STATE' });
  }
  return host._cachedState;
}

export async function getContentOidImpl(host: QueryContentHost, nodeId: string): Promise<string | null> {
  const state = await ensureAndGetState(host);
  const record = nodeContentAttachment(state, nodeId);
  return record === null ? null : contentOidFromRecord(record);
}

export async function getContentMetaImpl(host: QueryContentHost, nodeId: string): Promise<ContentMeta | null> {
  const state = await ensureAndGetState(host);
  const record = nodeContentAttachment(state, nodeId);
  return record === null ? null : contentMetaFromRecord(record);
}

export async function getContentImpl(host: QueryContentHost, nodeId: string): Promise<Uint8Array | null> {
  const state = await ensureAndGetState(host);
  const record = nodeContentAttachment(state, nodeId);
  if (record === null) { return null; }
  return await resolveBlob(host, contentOidFromRecord(record));
}

export async function getContentStreamImpl(host: QueryContentHost, nodeId: string): Promise<AsyncIterable<Uint8Array> | null> {
  const state = await ensureAndGetState(host);
  const record = nodeContentAttachment(state, nodeId);
  if (record === null) { return null; }
  const oid = contentOidFromRecord(record);
  const stream = resolveBlobStream(host, oid);
  if (stream) { return stream; }
  return singleChunkIterable(await resolveBlob(host, oid));
}

// ── Host-dependent edge content ─────────────────────────────────────

export async function getEdgeContentOidImpl(host: QueryContentHost, edge: EdgeId): Promise<string | null> {
  const state = await ensureAndGetState(host);
  const record = edgeContentAttachment(state, edge);
  return record === null ? null : contentOidFromRecord(record);
}

export async function getEdgeContentMetaImpl(host: QueryContentHost, edge: EdgeId): Promise<ContentMeta | null> {
  const state = await ensureAndGetState(host);
  const record = edgeContentAttachment(state, edge);
  return record === null ? null : contentMetaFromRecord(record);
}

export async function getEdgeContentImpl(host: QueryContentHost, edge: EdgeId): Promise<Uint8Array | null> {
  const state = await ensureAndGetState(host);
  const record = edgeContentAttachment(state, edge);
  if (record === null) { return null; }
  return await resolveBlob(host, contentOidFromRecord(record));
}

export async function getEdgeContentStreamImpl(host: QueryContentHost, edge: EdgeId): Promise<AsyncIterable<Uint8Array> | null> {
  const state = await ensureAndGetState(host);
  const record = edgeContentAttachment(state, edge);
  if (record === null) { return null; }
  const oid = contentOidFromRecord(record);
  const stream = resolveBlobStream(host, oid);
  if (stream) { return stream; }
  return singleChunkIterable(await resolveBlob(host, oid));
}
