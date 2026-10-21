/**
 * StrandDescriptorStore — boundary over strand refs and descriptor blobs.
 *
 * Responsible for reading, writing, normalizing, and hydrating strand
 * descriptors. Braid-ref synchronization lives here too.
 *
 * @module domain/services/strand/StrandDescriptorStore
 */

import StrandError from '../../errors/StrandError.ts';
import {
  buildStrandBraidRef,
  buildStrandBraidsPrefix,
  buildStrandPrefix,
  buildStrandRef,
  buildStrandWriterRef,
  buildStrandWritersPrefix,
} from '../../utils/RefLayout.ts';
import MintId from '../../crdt/MintId.ts';
import { isStrandId } from '../../crdt/StrandId.ts';
import { parseStrandBlob, type StrandDescriptor as ParsedStrandDescriptor } from '../../utils/parseStrandBlob.ts';
import { textEncode } from '../../utils/bytes.ts';
import AssetHandle from '../../storage/AssetHandle.ts';
import {
  isRawBag,
  normalizeReadOverlays,
  normalizeIntentQueue,
  normalizeEvolution,
  normalizeLastTick,
  normalizeQueuedIntents,
  normalizeQueuedIntentEntry,
  normalizeRejectedCounterfactuals,
  resolveQueuedIntentIdentity,
  type RawBag,
  type RawValue,
  type StrandReadOverlayDescriptor,
  type StrandIntentQueue,
  type StrandEvolution,
  type StrandQueuedIntent,
  type StrandRejectedCounterfactual,
} from './descriptorNormalization.ts';
import type { StrandWriterChain } from './strandTypes.ts';

import type GraphPersistencePort from '../../../ports/GraphPersistencePort.ts';
import type StrandStorePort from '../../../ports/StrandStorePort.ts';
import type Patch from '../../types/Patch.ts';

// ── Types ────────────────────────────────────────────────────────────────────

/** Full runtime strand descriptor (overlay + braid + intentQueue + evolution). */
export type StrandDescriptor = ParsedStrandDescriptor & {
  name: string;
  overlay: ParsedStrandDescriptor['overlay'] & { writable: boolean };
  braid: { readOverlays: StrandReadOverlayDescriptor[] };
  intentQueue: StrandIntentQueue;
  evolution: StrandEvolution;
  writers: StrandWriterChain[];
};

type BaseObservation = ParsedStrandDescriptor['baseObservation'];

/**
 * Structural description of the graph-runtime surface the store
 * reaches into. Narrow by design — the store is boundary code, not a
 * handle onto the whole runtime. The patch-chain return type is
 * parameterized over the runtime's Patch carrier shape; the store
 * only takes the length so the detailed carrier is irrelevant.
 */
type StrandDescriptorStoreGraph = {
  _graphName: string;
  _writerId: string;
  _persistence: GraphPersistencePort;
  _strandStore: StrandStorePort;
  _loadPatchChainFromSha: (sha: string) => Promise<readonly PatchChainEntry[]>;
};

/**
 * Opaque placeholder for a patch-chain entry. The store treats the
 * chain as length-only; any deeper access lives upstream in the
 * materializer. Kept as an object so the structural check holds
 * without tripping the anti-sludge `unknown`/`Record<string, // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
 * unknown>` rules. // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
 */
type PatchChainEntry = object;

type StoreOptions = {
  graph: StrandDescriptorStoreGraph;
  loadStrandOrThrow: (strandId: string) => Promise<StrandDescriptor>;
  baseObservationsEqual: (left: BaseObservation, right: BaseObservation) => boolean;
};

// ── Class ────────────────────────────────────────────────────────────────────

export default class StrandDescriptorStore {
  private readonly _graph: StrandDescriptorStoreGraph;
  private readonly _loadStrandOrThrow: (strandId: string) => Promise<StrandDescriptor>;
  private readonly _baseObservationsEqual: (
    left: BaseObservation,
    right: BaseObservation,
  ) => boolean;

  constructor({ graph, loadStrandOrThrow, baseObservationsEqual }: StoreOptions) {
    this._graph = graph;
    this._loadStrandOrThrow = loadStrandOrThrow;
    this._baseObservationsEqual = baseObservationsEqual;
  }

  // ── Ref building ─────────────────────────────────────────────────────────

  buildRef(strandId: string): string {
    return this._strandRef(strandId, buildStrandRef);
  }

  /** Every ref that belongs to the strand: descriptor, writer chains and braids. */
  buildStrandPrefix(strandId: string): string {
    return this._strandRef(strandId, buildStrandPrefix);
  }

  /** This runtime writer's own patch chain on the strand (#1014). */
  buildOverlayRef(strandId: string): string {
    return this.buildWriterRef(strandId, this._graph._writerId);
  }

  buildWriterRef(strandId: string, writerId: string): string {
    return this._strandRef(strandId, (graphName, id) => buildStrandWriterRef(graphName, id, writerId));
  }

  buildBraidPrefix(strandId: string): string {
    return this._strandRef(strandId, buildStrandBraidsPrefix);
  }

  buildBraidRef(strandId: string, braidedStrandId: string, writerId: string): string {
    return this._strandRef(strandId, (graphName, id) => buildStrandBraidRef(graphName, id, { braidedStrandId, writerId }));
  }

  private _strandRef(strandId: string, build: (graphName: string, strandId: string) => string): string {
    try {
      return build(this._graph._graphName, strandId);
    } catch (err) {
      throw new StrandError(`Invalid strand id: ${(err as Error).message}`, {
        code: 'E_STRAND_ID_INVALID',
        context: { strandId },
      });
    }
  }

  /**
   * Resolves an immutable strand id, or a friendly name that exactly one
   * strand in this clone carries, to the strand id. Returns null when
   * neither matches; refuses a name that several strands share.
   */
  async resolveStrandId(strandRef: string): Promise<string | null> {
    requireStrandRef(strandRef);
    if (isStrandId(strandRef) && await this._graph._strandStore.hasDescriptor(this._graph._graphName, strandRef)) {
      return strandRef;
    }
    const matches = await this._idsNamed(strandRef);
    if (matches.length > 1) {
      throw new StrandError(`Strand name '${strandRef}' is shared by ${matches.length} strands; use a strand id`, {
        code: 'E_STRAND_NAME_AMBIGUOUS',
        context: { graphName: this._graph._graphName, name: strandRef, strandIds: matches },
      });
    }
    return matches[0] ?? null;
  }

  private async _idsNamed(name: string): Promise<string[]> {
    const matches: string[] = [];
    for (const id of await this.listStrandIds()) {
      const descriptor = await this._readById(id);
      if (descriptor !== null && descriptor.name === name) { matches.push(id); }
    }
    return matches;
  }

  // ── Descriptor I/O ───────────────────────────────────────────────────────

  async readDescriptor(strandRef: string): Promise<ParsedStrandDescriptor | null> {
    const strandId = await this.resolveStrandId(strandRef);
    return strandId === null ? null : await this._readById(strandId);
  }

  private async _readById(strandId: string): Promise<ParsedStrandDescriptor | null> {
    this.buildRef(strandId);
    const buf = await this.readDescriptorBytes(strandId);
    return buf === null ? null : this.parseDescriptor(strandId, buf);
  }

  private async readDescriptorBytes(strandId: string): Promise<Uint8Array | null> {
    try {
      return await this._graph._strandStore.readDescriptor(
        this._graph._graphName,
        strandId,
      );
    } catch (err) {
      throw new StrandError(`Strand '${strandId}' descriptor could not be read`, {
        code: 'E_STRAND_MISSING_OBJECT',
        context: {
          graphName: this._graph._graphName,
          strandId,
          cause: (err as Error).message,
        },
      });
    }
  }

  private parseDescriptor(strandId: string, buf: Uint8Array): ParsedStrandDescriptor {
    try {
      const descriptor = parseStrandBlob(buf, `strand '${strandId}'`);
      if (descriptor.graphName !== this._graph._graphName) {
        throw new StrandError('descriptor graphName does not match the current graph', {
          code: 'E_STRAND_GRAPH_MISMATCH',
        });
      }
      return descriptor;
    } catch (err) {
      throw new StrandError(`Strand '${strandId}' is corrupt`, {
        code: 'E_STRAND_CORRUPT',
        context: {
          graphName: this._graph._graphName,
          strandId,
          cause: (err as Error).message,
        },
      });
    }
  }

  async writeDescriptor(descriptor: StrandDescriptor): Promise<void> {
    const attachments = descriptor.intentQueue.intents.flatMap((intent) =>
      intent.contentAssetHandles.map((handle) => new AssetHandle(handle))
    );
    await this._graph._strandStore.publishDescriptor({
      graphName: this._graph._graphName,
      strandId: descriptor.strandId,
      descriptor: textEncode(JSON.stringify(persistedDescriptor(descriptor))), // nosemgrep: ts-no-json-stringify-in-core -- 0025B
      attachments,
    });
  }

  async listStrandIds(): Promise<string[]> {
    return await this._graph._strandStore.listStrandIds(this._graph._graphName);
  }

  async hasDescriptor(strandId: string): Promise<boolean> {
    this.buildRef(strandId);
    return await this._graph._strandStore.hasDescriptor(this._graph._graphName, strandId);
  }

  async deleteDescriptor(strandId: string): Promise<boolean> {
    this.buildRef(strandId);
    return await this._graph._strandStore.deleteDescriptor(this._graph._graphName, strandId);
  }

  // ── Overlay helpers ──────────────────────────────────────────────────────

  async loadBraidedReadOverlays(
    target: StrandDescriptor,
    braidedStrandIds: string[],
  ): Promise<StrandReadOverlayDescriptor[]> {
    const readOverlays: StrandReadOverlayDescriptor[] = [];
    for (const braidedStrandId of braidedStrandIds) {
      const braided = await this._loadStrandOrThrow(braidedStrandId);
      if (!this._baseObservationsEqual(braided.baseObservation, target.baseObservation)) {
        throw new StrandError(
          `Strand '${braidedStrandId}' cannot be braided onto '${target.strandId}' because their pinned base observations differ`,
          {
            code: 'E_STRAND_COORDINATE_INVALID',
            context: {
              strandId: target.strandId,
              braidedStrandId,
              targetBaseObservation: target.baseObservation,
              braidedBaseObservation: braided.baseObservation,
            },
          },
        );
      }
      readOverlays.push(...this.buildReadOverlayMetadata(braided));
    }
    return readOverlays;
  }

  /** One pinned read overlay per writer chain of `descriptor`; one empty pin when it has none. */
  buildReadOverlayMetadata(descriptor: StrandDescriptor): StrandReadOverlayDescriptor[] {
    if (descriptor.writers.length === 0) {
      return [{
        strandId: descriptor.strandId,
        overlayId: descriptor.overlay.overlayId,
        kind: descriptor.overlay.kind,
        headPatchSha: null,
        patchCount: 0,
      }];
    }
    return descriptor.writers.map((chain) => ({
      strandId: descriptor.strandId,
      overlayId: chain.overlayId,
      kind: descriptor.overlay.kind,
      headPatchSha: chain.headPatchSha,
      patchCount: chain.patchCount,
    }));
  }

  /** This runtime writer's chain on the strand. */
  async readOverlayMetadata(
    strandId: string,
  ): Promise<{ headPatchSha: string | null; patchCount: number }> {
    return await this._readChain(this.buildOverlayRef(strandId));
  }

  /** Every writer chain on the strand that has at least one patch, by writer id. */
  async listWriterChains(strandId: string): Promise<StrandWriterChain[]> {
    const prefix = this._strandRef(strandId, buildStrandWritersPrefix);
    const refs = (await this._graph._persistence.listRefs(prefix)).filter((ref) => ref.startsWith(prefix)).sort();
    const chains: StrandWriterChain[] = [];
    for (const ref of refs) {
      const writerId = ref.slice(prefix.length);
      const { headPatchSha, patchCount } = await this._readChain(ref);
      if (headPatchSha !== null) {
        chains.push({ writerId, overlayId: MintId.strand(writerId, strandId).encode(), headPatchSha, patchCount });
      }
    }
    return chains;
  }

  private async _readChain(ref: string): Promise<{ headPatchSha: string | null; patchCount: number }> {
    const headPatchSha = await this._graph._persistence.readRef(ref);
    if (headPatchSha === null || headPatchSha === undefined) {
      return { headPatchSha: null, patchCount: 0 };
    }
    const patches = await this._graph._loadPatchChainFromSha(headPatchSha);
    return { headPatchSha, patchCount: patches.length };
  }

  /**
   * Hydrates a stored descriptor for this runtime: `overlay` is this
   * writer's own chain (its mint id, head and length), and `writers` lists
   * every writer chain the strand view reads (#1014).
   */
  async hydrateDescriptor(descriptor: ParsedStrandDescriptor): Promise<StrandDescriptor> {
    const normalized = this._buildNormalizedDescriptor(descriptor, normalizeReadOverlays(descriptor.braid?.readOverlays));
    const overlay = await this.readOverlayMetadata(descriptor.strandId);
    return {
      ...normalized,
      overlay: {
        ...normalized.overlay,
        overlayId: MintId.strand(this._graph._writerId, descriptor.strandId).encode(),
        headPatchSha: overlay.headPatchSha,
        patchCount: overlay.patchCount,
      },
      writers: await this.listWriterChains(descriptor.strandId),
    };
  }

  private _buildNormalizedDescriptor(
    descriptor: ParsedStrandDescriptor,
    braidedReadOverlays: StrandReadOverlayDescriptor[],
  ): StrandDescriptor {
    const intentQueueRaw: RawValue = isRawBag(descriptor['intentQueue'])
      ? descriptor['intentQueue']
      : null;
    const evolutionRaw: RawValue = isRawBag(descriptor['evolution'])
      ? descriptor['evolution']
      : null;
    return {
      ...descriptor,
      name: descriptor.name,
      overlay: {
        ...descriptor.overlay,
        writable: descriptor.overlay.writable ?? true,
      },
      braid: {
        readOverlays: braidedReadOverlays,
      },
      intentQueue: this.normalizeIntentQueue(intentQueueRaw),
      evolution: this.normalizeEvolution(evolutionRaw),
      writers: [],
    };
  }

  // ── Normalization (delegates to descriptorNormalization.ts) ──────────────

  normalizeIntentQueue(value: RawValue): StrandIntentQueue {
    return normalizeIntentQueue(value, (intents) => normalizeQueuedIntents(intents));
  }

  normalizeEvolution(value: RawValue): StrandEvolution {
    return normalizeEvolution(value, (lastTick) => normalizeLastTick(lastTick));
  }

  // ── Braid ref sync ───────────────────────────────────────────────────────

  async syncBraidRefs(
    strandId: string,
    readOverlays: StrandReadOverlayDescriptor[],
  ): Promise<void> {
    const prefix = this.buildBraidPrefix(strandId);
    const existingRefs = await this._graph._persistence.listRefs(prefix);
    const nextRefs = new Set<string>();

    for (const readOverlay of readOverlays) {
      await this._syncOneBraidRef(strandId, readOverlay, nextRefs);
    }

    for (const existingRef of existingRefs) {
      if (!nextRefs.has(existingRef)) {
        await this._graph._persistence.deleteRef(existingRef);
      }
    }
  }

  private async _syncOneBraidRef(
    strandId: string,
    readOverlay: StrandReadOverlayDescriptor,
    nextRefs: Set<string>,
  ): Promise<void> {
    const { writerId } = MintId.decode(readOverlay.overlayId);
    const ref = this.buildBraidRef(strandId, readOverlay.strandId, writerId);
    nextRefs.add(ref);
    if (readOverlay.headPatchSha !== null && readOverlay.headPatchSha.length > 0) {
      await this._graph._persistence.updateRef(ref, readOverlay.headPatchSha);
      return;
    }
    if ((await this._graph._persistence.readRef(ref)) !== null) {
      await this._graph._persistence.deleteRef(ref);
    }
  }

  // ── Test-seam private wrappers ───────────────────────────────────────────

  /** @internal for test seam access */
  _normalizeQueuedIntentEntry(rawEntry: RawValue): StrandQueuedIntent[] {
    return normalizeQueuedIntentEntry(rawEntry);
  }

  /** @internal for test seam access */
  _resolveQueuedIntentIdentity(candidate: RawBag): { patch: Patch; intentId: string; enqueuedAt: string } | null {
    return resolveQueuedIntentIdentity(candidate);
  }

  /** @internal for test seam access */
  _normalizeQueuedIntents(value: RawValue): StrandQueuedIntent[] {
    return normalizeQueuedIntents(value);
  }

  /** @internal for test seam access */
  _normalizeRejectedCounterfactuals(value: RawValue): StrandRejectedCounterfactual[] {
    return normalizeRejectedCounterfactuals(value);
  }
}

/**
 * The stored form of a descriptor. Writer chains and this runtime's own
 * chain head are read from refs on every load, so they are not stored.
 */
function persistedDescriptor(descriptor: StrandDescriptor): Omit<StrandDescriptor, 'writers'> {
  const { writers, ...stored } = descriptor;
  void writers;
  return { ...stored, overlay: { ...stored.overlay, headPatchSha: null, patchCount: 0 } };
}

function requireStrandRef(strandRef: string): void {
  if (typeof strandRef !== 'string' || strandRef.length === 0) {
    throw new StrandError('Strand id or name must be a non-empty string', {
      code: 'E_STRAND_ID_INVALID',
      context: { strandId: strandRef },
    });
  }
}
