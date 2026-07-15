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
import AssetHandle from '../../storage/AssetHandle.ts';
import { collectAsyncIterable } from '../../utils/streamUtils.ts';

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
    handle: record.payload.handle.toString(),
    mime: record.payload.mime?.toString() ?? null,
    size: record.payload.size?.toNumber() ?? null,
  };
}

function contentHandleFromRecord(record: ContentAttachmentRecord): string {
  return record.payload.handle.toString();
}

function nodeContentAttachment(state: WarpState, nodeId: string): ContentAttachmentRecord | null {
  return ContentAttachmentProjection.forNode(state, nodeId);
}

function edgeContentAttachment(state: WarpState, edge: EdgeId): ContentAttachmentRecord | null {
  return ContentAttachmentProjection.forEdge(state, edge);
}

// ── Blob resolution ─────────────────────────────────────────────────

async function resolveAsset(host: QueryContentHost, handle: string): Promise<Uint8Array> {
  return await collectAsyncIterable(resolveAssetStream(host, handle));
}

function resolveAssetStream(host: QueryContentHost, handle: string): AsyncIterable<Uint8Array> {
  if (host._assetStorage === null) {
    throw new QueryError('Content asset storage is unavailable', { code: 'E_CONTENT_STORAGE' });
  }
  return host._assetStorage.open(new AssetHandle(handle));
}

// ── Host-dependent node content ─────────────────────────────────────

async function ensureAndGetState(host: QueryContentHost): Promise<WarpState> {
  await host._ensureFreshState();
  if (host._cachedState === null) {
    throw new QueryError('host state is null after _ensureFreshState', { code: 'E_NO_STATE' });
  }
  return host._cachedState;
}

export async function getContentHandleImpl(host: QueryContentHost, nodeId: string): Promise<string | null> {
  const state = await ensureAndGetState(host);
  const record = nodeContentAttachment(state, nodeId);
  return record === null ? null : contentHandleFromRecord(record);
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
  return await resolveAsset(host, contentHandleFromRecord(record));
}

export async function getContentStreamImpl(host: QueryContentHost, nodeId: string): Promise<AsyncIterable<Uint8Array> | null> {
  const state = await ensureAndGetState(host);
  const record = nodeContentAttachment(state, nodeId);
  if (record === null) { return null; }
  return resolveAssetStream(host, contentHandleFromRecord(record));
}

// ── Host-dependent edge content ─────────────────────────────────────

export async function getEdgeContentHandleImpl(host: QueryContentHost, edge: EdgeId): Promise<string | null> {
  const state = await ensureAndGetState(host);
  const record = edgeContentAttachment(state, edge);
  return record === null ? null : contentHandleFromRecord(record);
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
  return await resolveAsset(host, contentHandleFromRecord(record));
}

export async function getEdgeContentStreamImpl(host: QueryContentHost, edge: EdgeId): Promise<AsyncIterable<Uint8Array> | null> {
  const state = await ensureAndGetState(host);
  const record = edgeContentAttachment(state, edge);
  if (record === null) { return null; }
  return resolveAssetStream(host, contentHandleFromRecord(record));
}
