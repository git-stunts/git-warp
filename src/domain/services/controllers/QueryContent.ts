/**
 * QueryContent — content register lookup and blob access.
 *
 * Pure functions for reading content attachments from materialized
 * CRDT state and resolving blob bytes from storage.
 */

import {
  encodePropKey,
  encodeEdgePropKey,
  encodeEdgeKey,
  CONTENT_PROPERTY_KEY,
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_SIZE_PROPERTY_KEY,
} from '../KeyCodec.ts';
import { compareEventIds, type EventId } from '../../utils/EventId.ts';
import type WarpState from '../state/WarpState.ts';
import type { WarpGraphWithMixins } from '../../warp/_internal.ts';
import type { PropValue } from '../../types/PropValue.ts';

// ── Types ───────────────────────────────────────────────────────────

type Register = {
  eventId: EventId | null;
  value: PropValue;
};

type ContentRegister = {
  eventId: EventId | null;
  value: string;
};

type ContentRegisters = {
  contentRegister: ContentRegister;
  mimeRegister: Register | null;
  sizeRegister: Register | null;
};

/** Identifies an edge by its three-part key. */
export type EdgeId = {
  from: string;
  to: string;
  label: string;
};

/** Content metadata for a node or edge attachment. */
export type ContentMeta = {
  oid: string;
  mime: string | null;
  size: number | null;
};

// ── Lineage check ───────────────────────────────────────────────────

function isSameLineage(a: EventId | null | undefined, b: EventId | null | undefined): boolean {
  if (!a || !b) { return false; }
  return a.lamport === b.lamport && a.writerId === b.writerId && a.patchSha === b.patchSha;
}

// ── Edge register visibility ────────────────────────────────────────

function visibleRegister(register: Register | undefined, birthEvent: EventId | undefined): Register | null {
  if (!register) { return null; }
  if (birthEvent && register.eventId && compareEventIds(register.eventId, birthEvent) < 0) {
    return null;
  }
  return register;
}

// ── Node content registers ──────────────────────────────────────────

function nodeContentRegister(state: WarpState, nodeId: string): ContentRegister | null {
  if (!state.nodeAlive.contains(nodeId)) { return null; }
  const reg = state.prop.get(encodePropKey(nodeId, CONTENT_PROPERTY_KEY));
  if (!reg || typeof reg.value !== 'string') { return null; }
  return reg as ContentRegister;
}

export function getNodeContentRegisters(state: WarpState, nodeId: string): ContentRegisters | null {
  const content = nodeContentRegister(state, nodeId);
  if (!content) { return null; }
  return {
    contentRegister: content,
    mimeRegister: state.prop.get(encodePropKey(nodeId, CONTENT_MIME_PROPERTY_KEY)) ?? null,
    sizeRegister: state.prop.get(encodePropKey(nodeId, CONTENT_SIZE_PROPERTY_KEY)) ?? null,
  };
}

// ── Edge content registers ──────────────────────────────────────────

function edgeAliveWithEndpoints(state: WarpState, edge: EdgeId): string | null {
  const edgeKey = encodeEdgeKey(edge.from, edge.to, edge.label);
  if (!state.edgeAlive.contains(edgeKey)) { return null; }
  if (!state.nodeAlive.contains(edge.from)) { return null; }
  if (!state.nodeAlive.contains(edge.to)) { return null; }
  return edgeKey;
}

function edgeContentRegister(state: WarpState, edge: EdgeId, edgeKey: string): ContentRegister | null {
  const birthEvent = state.edgeBirthEvent?.get(edgeKey);
  const reg = visibleRegister(
    state.prop.get(encodeEdgePropKey(edge.from, edge.to, edge.label, CONTENT_PROPERTY_KEY)),
    birthEvent,
  );
  if (!reg || typeof reg.value !== 'string') { return null; }
  return reg as ContentRegister;
}

function edgeSiblingRegisters(state: WarpState, edge: EdgeId, edgeKey: string): { mime: Register | null; size: Register | null } {
  const birthEvent = state.edgeBirthEvent?.get(edgeKey);
  return {
    mime: visibleRegister(state.prop.get(encodeEdgePropKey(edge.from, edge.to, edge.label, CONTENT_MIME_PROPERTY_KEY)), birthEvent),
    size: visibleRegister(state.prop.get(encodeEdgePropKey(edge.from, edge.to, edge.label, CONTENT_SIZE_PROPERTY_KEY)), birthEvent),
  };
}

export function getEdgeContentRegisters(state: WarpState, edge: EdgeId): ContentRegisters | null {
  const edgeKey = edgeAliveWithEndpoints(state, edge);
  if (edgeKey === null) { return null; }
  const content = edgeContentRegister(state, edge, edgeKey);
  if (!content) { return null; }
  const siblings = edgeSiblingRegisters(state, edge, edgeKey);
  return { contentRegister: content, mimeRegister: siblings.mime, sizeRegister: siblings.size };
}

// ── Metadata extraction ─────────────────────────────────────────────

function isValidSize(v: PropValue | undefined): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function extractSize(contentReg: ContentRegister, sizeReg: Register | null): number | null {
  if (!isSameLineage(contentReg.eventId, sizeReg?.eventId)) { return null; }
  return isValidSize(sizeReg?.value) ? sizeReg.value : null;
}

function extractMime(contentReg: ContentRegister, mimeReg: Register | null): string | null {
  if (!isSameLineage(contentReg.eventId, mimeReg?.eventId)) { return null; }
  const v = mimeReg?.value;
  return typeof v === 'string' ? v : null;
}

export function extractContentMeta(regs: ContentRegisters): ContentMeta {
  return {
    oid: regs.contentRegister.value,
    mime: extractMime(regs.contentRegister, regs.mimeRegister),
    size: extractSize(regs.contentRegister, regs.sizeRegister),
  };
}

// ── Blob resolution ─────────────────────────────────────────────────

async function resolveBlob(host: WarpGraphWithMixins, oid: string): Promise<Uint8Array> {
  if (host._blobStorage) {
    return await host._blobStorage.retrieve(oid);
  }
  return await host._persistence.readBlob(oid);
}

function resolveBlobStream(host: WarpGraphWithMixins, oid: string): AsyncIterable<Uint8Array> | null {
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

async function ensureAndGetState(host: WarpGraphWithMixins): Promise<WarpState> {
  await host._ensureFreshState();
  return host._cachedState as WarpState;
}

export async function getContentOidImpl(host: WarpGraphWithMixins, nodeId: string): Promise<string | null> {
  const state = await ensureAndGetState(host);
  const regs = getNodeContentRegisters(state, nodeId);
  return regs?.contentRegister.value ?? null;
}

export async function getContentMetaImpl(host: WarpGraphWithMixins, nodeId: string): Promise<ContentMeta | null> {
  const state = await ensureAndGetState(host);
  const regs = getNodeContentRegisters(state, nodeId);
  return regs ? extractContentMeta(regs) : null;
}

export async function getContentImpl(host: WarpGraphWithMixins, nodeId: string): Promise<Uint8Array | null> {
  const state = await ensureAndGetState(host);
  const regs = getNodeContentRegisters(state, nodeId);
  if (!regs) { return null; }
  return await resolveBlob(host, regs.contentRegister.value);
}

export async function getContentStreamImpl(host: WarpGraphWithMixins, nodeId: string): Promise<AsyncIterable<Uint8Array> | null> {
  const state = await ensureAndGetState(host);
  const regs = getNodeContentRegisters(state, nodeId);
  if (!regs) { return null; }
  const stream = resolveBlobStream(host, regs.contentRegister.value);
  if (stream) { return stream; }
  return singleChunkIterable(await resolveBlob(host, regs.contentRegister.value));
}

// ── Host-dependent edge content ─────────────────────────────────────

export async function getEdgeContentOidImpl(host: WarpGraphWithMixins, edge: EdgeId): Promise<string | null> {
  const state = await ensureAndGetState(host);
  const regs = getEdgeContentRegisters(state, edge);
  return regs?.contentRegister.value ?? null;
}

export async function getEdgeContentMetaImpl(host: WarpGraphWithMixins, edge: EdgeId): Promise<ContentMeta | null> {
  const state = await ensureAndGetState(host);
  const regs = getEdgeContentRegisters(state, edge);
  return regs ? extractContentMeta(regs) : null;
}

export async function getEdgeContentImpl(host: WarpGraphWithMixins, edge: EdgeId): Promise<Uint8Array | null> {
  const state = await ensureAndGetState(host);
  const regs = getEdgeContentRegisters(state, edge);
  if (!regs) { return null; }
  return await resolveBlob(host, regs.contentRegister.value);
}

export async function getEdgeContentStreamImpl(host: WarpGraphWithMixins, edge: EdgeId): Promise<AsyncIterable<Uint8Array> | null> {
  const state = await ensureAndGetState(host);
  const regs = getEdgeContentRegisters(state, edge);
  if (!regs) { return null; }
  const stream = resolveBlobStream(host, regs.contentRegister.value);
  if (stream) { return stream; }
  return singleChunkIterable(await resolveBlob(host, regs.contentRegister.value));
}
