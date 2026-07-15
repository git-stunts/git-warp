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
  buildStrandRef,
  buildStrandOverlayRef,
  validateWriterId,
} from '../../utils/RefLayout.ts';
import { parseStrandBlob, type StrandDescriptor as ParsedStrandDescriptor } from '../../utils/parseStrandBlob.ts';
import { textEncode } from '../../utils/bytes.ts';
import AssetHandle from '../../storage/AssetHandle.ts';
import {
  isRawBag,
  normalizeReadOverlays,
  readOverlaysEqual,
  overlayMetadataMatches,
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

import type GraphPersistencePort from '../../../ports/GraphPersistencePort.ts';
import type StrandStorePort from '../../../ports/StrandStorePort.ts';
import type Patch from '../../types/Patch.ts';

// ── Types ────────────────────────────────────────────────────────────────────

/** Full runtime strand descriptor (overlay + braid + intentQueue + evolution). */
export type StrandDescriptor = ParsedStrandDescriptor & {
  overlay: ParsedStrandDescriptor['overlay'] & { writable: boolean };
  braid: { readOverlays: StrandReadOverlayDescriptor[] };
  intentQueue: StrandIntentQueue;
  evolution: StrandEvolution;
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
    try {
      validateWriterId(strandId);
    } catch (err) {
      throw new StrandError(`Invalid strand id: ${(err as Error).message}`, {
        code: 'E_STRAND_ID_INVALID',
        context: { strandId },
      });
    }
    return buildStrandRef(this._graph._graphName, strandId);
  }

  buildOverlayRef(strandId: string): string {
    try {
      validateWriterId(strandId);
    } catch (err) {
      throw new StrandError(`Invalid strand id: ${(err as Error).message}`, {
        code: 'E_STRAND_ID_INVALID',
        context: { strandId },
      });
    }
    return buildStrandOverlayRef(this._graph._graphName, strandId);
  }

  buildBraidPrefix(strandId: string): string {
    try {
      validateWriterId(strandId);
    } catch (err) {
      throw new StrandError(`Invalid strand id: ${(err as Error).message}`, {
        code: 'E_STRAND_ID_INVALID',
        context: { strandId },
      });
    }
    return buildStrandBraidsPrefix(this._graph._graphName, strandId);
  }

  buildBraidRef(strandId: string, braidedStrandId: string): string {
    try {
      validateWriterId(strandId);
      validateWriterId(braidedStrandId);
    } catch (err) {
      throw new StrandError(`Invalid strand braid id: ${(err as Error).message}`, {
        code: 'E_STRAND_ID_INVALID',
        context: { strandId, braidedStrandId },
      });
    }
    return buildStrandBraidRef(this._graph._graphName, strandId, braidedStrandId);
  }

  // ── Descriptor I/O ───────────────────────────────────────────────────────

  async readDescriptor(strandId: string): Promise<ParsedStrandDescriptor | null> {
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
      descriptor: textEncode(JSON.stringify(descriptor)), // nosemgrep: ts-no-json-stringify-in-core -- 0025B
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
      readOverlays.push(this.buildReadOverlayMetadata(braided));
    }
    return readOverlays;
  }

  buildReadOverlayMetadata(descriptor: StrandDescriptor): StrandReadOverlayDescriptor {
    return {
      strandId: descriptor.strandId,
      overlayId: descriptor.overlay.overlayId,
      kind: descriptor.overlay.kind,
      headPatchSha: descriptor.overlay.headPatchSha,
      patchCount: descriptor.overlay.patchCount,
    };
  }

  async readOverlayMetadata(
    strandId: string,
  ): Promise<{ headPatchSha: string | null; patchCount: number }> {
    const overlayRef = this.buildOverlayRef(strandId);
    const headPatchSha = await this._graph._persistence.readRef(overlayRef);
    if (headPatchSha === null || headPatchSha === undefined) {
      return { headPatchSha: null, patchCount: 0 };
    }
    const overlayPatches = await this._graph._loadPatchChainFromSha(headPatchSha);
    return {
      headPatchSha,
      patchCount: overlayPatches.length,
    };
  }

  // ── Hydration ────────────────────────────────────────────────────────────

  async hydrateDescriptor(descriptor: ParsedStrandDescriptor): Promise<StrandDescriptor> {
    const braidedReadOverlays = normalizeReadOverlays(descriptor.braid?.readOverlays);
    const normalizedDescriptor = this._buildNormalizedDescriptor(descriptor, braidedReadOverlays);
    const overlay = await this.readOverlayMetadata(descriptor.strandId);
    if (this._matchesHydratedDescriptor(normalizedDescriptor, braidedReadOverlays, overlay)) {
      return normalizedDescriptor;
    }
    return this._withOverlayMetadata(normalizedDescriptor, overlay);
  }

  private _buildNormalizedDescriptor(
    descriptor: ParsedStrandDescriptor,
    braidedReadOverlays: StrandReadOverlayDescriptor[],
  ): StrandDescriptor {
    // Narrow the trailing unvalidated blob fields via the type-guard
    // predicate so `unknown` stays inside legitimate x-is-Foo form. // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
    const intentQueueRaw: RawValue = isRawBag(descriptor['intentQueue'])
      ? descriptor['intentQueue']
      : null;
    const evolutionRaw: RawValue = isRawBag(descriptor['evolution'])
      ? descriptor['evolution']
      : null;
    return {
      ...descriptor,
      overlay: {
        ...descriptor.overlay,
        writable: descriptor.overlay.writable ?? true,
      },
      braid: {
        readOverlays: braidedReadOverlays,
      },
      intentQueue: this.normalizeIntentQueue(intentQueueRaw),
      evolution: this.normalizeEvolution(evolutionRaw),
    };
  }

  private _matchesHydratedDescriptor(
    descriptor: StrandDescriptor,
    braidedReadOverlays: StrandReadOverlayDescriptor[],
    overlay: { headPatchSha: string | null; patchCount: number },
  ): boolean {
    return (
      overlayMetadataMatches(descriptor, {
        headPatchSha: overlay.headPatchSha,
        patchCount: overlay.patchCount,
        writable: descriptor.overlay.writable,
      }) &&
      readOverlaysEqual(descriptor.braid.readOverlays, braidedReadOverlays)
    );
  }

  private _withOverlayMetadata(
    descriptor: StrandDescriptor,
    overlay: { headPatchSha: string | null; patchCount: number },
  ): StrandDescriptor {
    return {
      ...descriptor,
      overlay: {
        ...descriptor.overlay,
        headPatchSha: overlay.headPatchSha,
        patchCount: overlay.patchCount,
      },
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
    const ref = this.buildBraidRef(strandId, readOverlay.strandId);
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
