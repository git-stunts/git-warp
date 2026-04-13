/**
 * StrandCoordinator — thin coordinator implementing StrandCapability.
 *
 * Composes StrandDescriptorStore, StrandMaterializer, StrandPatchService,
 * and StrandIntentService. Owns lifecycle orchestration (create, braid,
 * get, list, drop) and delegates everything else to the sub-services.
 *
 * Replaces StrandService.js (dissolved, not split).
 */

import StrandError from '../../errors/StrandError.ts';
import { createImmutableValue, createImmutableWarpState } from '../ImmutableSnapshot.ts';
import {
  normalizeCreateOptions, normalizeLamportCeiling,
  normalizeWritable, normalizeBraidedStrandIds, patchTouchesEntity,
  frontierToRecord,
  type NormalizedCreateOptions,
} from './StrandDescriptorValidation.ts';
import {
  STRAND_SCHEMA_VERSION,
  STRAND_COORDINATE_VERSION,
  STRAND_OVERLAY_KIND,
  normalizeOptionalString,
} from './strandShared.ts';
import { buildStrandsPrefix } from '../../utils/RefLayout.ts';
import { computeChecksum } from '../../utils/checksumUtils.ts';
import type StrandDescriptorStore from './StrandDescriptorStore.ts';
import type StrandMaterializer from './StrandMaterializer.ts';
import type StrandPatchService from './StrandPatchService.ts';
import type StrandIntentService from './StrandIntentService.ts';
import type ClockPort from '../../../ports/ClockPort.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import type GraphPersistencePort from '../../../ports/GraphPersistencePort.ts';
import type { StrandDescriptor as ParsedStrandDescriptor } from '../../utils/parseStrandBlob.ts';
import type Patch from '../../types/Patch.ts';

// Re-export constants that were on StrandService
export { STRAND_SCHEMA_VERSION, STRAND_COORDINATE_VERSION, STRAND_OVERLAY_KIND };

/** Dependencies for StrandCoordinator. */
export type StrandCoordinatorDeps = {
  graphName: string;
  clock: ClockPort;
  crypto: CryptoPort;
  persistence: GraphPersistencePort;
  descriptors: StrandDescriptorStore;
  materializer: StrandMaterializer;
  patches: StrandPatchService;
  intents: StrandIntentService;
  /** The full graph runtime, stored for test-seam access and forward compatibility. */
  graph?: Record<string, unknown>;
};

type StrandDescriptor = import('./strandTypes.ts').StrandDescriptor;

function buildStrandDescriptor({
  graphName,
  now,
  frontierRecord,
  frontierDigest,
  normalized,
}: {
  graphName: string;
  now: string;
  frontierRecord: Record<string, string>;
  frontierDigest: string;
  normalized: NormalizedCreateOptions;
}): StrandDescriptor {
  return {
    schemaVersion: STRAND_SCHEMA_VERSION,
    strandId: normalized.strandId,
    graphName,
    createdAt: now,
    updatedAt: now,
    owner: normalized.owner,
    scope: normalized.scope,
    lease: {
      expiresAt: normalized.leaseExpiresAt,
    },
    baseObservation: {
      coordinateVersion: STRAND_COORDINATE_VERSION,
      frontier: frontierRecord,
      frontierDigest,
      lamportCeiling: normalized.lamportCeiling,
    },
    overlay: {
      overlayId: normalized.strandId,
      kind: STRAND_OVERLAY_KIND,
      headPatchSha: null,
      patchCount: 0,
      writable: true,
    },
    braid: {
      readOverlays: [],
    },
    intentQueue: {
      nextIntentSeq: 1,
      intents: [],
    },
    evolution: {
      tickCount: 0,
      lastTick: null,
    },
    materialization: {
      cacheAuthority: 'derived' as const,
    },
  };
}

export default class StrandCoordinator {
  private readonly _deps: StrandCoordinatorDeps;

  constructor(deps: StrandCoordinatorDeps) {
    this._deps = deps;
  }

  // ── Test seam accessors (private-by-convention) ─────────────────
  get _graph(): Record<string, unknown> | undefined { return this._deps.graph; }
  get _descriptorStore(): StrandDescriptorStore { return this._deps.descriptors; }
  get _materializer(): StrandMaterializer { return this._deps.materializer; }
  get _patchService(): StrandPatchService { return this._deps.patches; }
  get _intentService(): StrandIntentService { return this._deps.intents; }

  // ── Test seam delegation methods ─────────────────────────────────
  _buildRef(strandId: string): string { return this._deps.descriptors.buildRef(strandId); }
  _buildOverlayRef(strandId: string): string { return this._deps.descriptors.buildOverlayRef(strandId); }
  _buildBraidPrefix(strandId: string): string { return this._deps.descriptors.buildBraidPrefix(strandId); }
  _writeDescriptor(descriptor: StrandDescriptor): Promise<void> { return this._deps.descriptors.writeDescriptor(descriptor); }
  _hydrateOverlayMetadata(descriptor: ParsedStrandDescriptor): Promise<StrandDescriptor> {
    return this._deps.descriptors.hydrateDescriptor(descriptor);
  }
  _collectPatchEntries(descriptor: StrandDescriptor, options: { ceiling: number | null }): Promise<Array<{ patch: unknown; sha: string }>> {
    return this._deps.materializer.collectPatchEntries(descriptor, options);
  }
  _materializeDescriptor(descriptor: StrandDescriptor, options: { collectReceipts: boolean; ceiling: number | null }): ReturnType<StrandMaterializer['materializeDescriptor']> {
    return this._deps.materializer.materializeDescriptor(descriptor, options);
  }
  _commitQueuedPatch(params: Parameters<StrandPatchService['commitQueuedPatch']>[0]): ReturnType<StrandPatchService['commitQueuedPatch']> {
    return this._deps.patches.commitQueuedPatch(params);
  }

  // ── Lifecycle (owns the logic) ──────────────────────────────────

  async create(options: { strandId?: string; lamportCeiling?: number | null; owner?: string | null; scope?: string | null; leaseExpiresAt?: string | null } = {}): Promise<StrandDescriptor> {
    const normalized = normalizeCreateOptions(options);
    await this._assertStrandDoesNotExist(normalized.strandId);

    const frontier = await this._getFrontier();
    const frontierRecord = frontierToRecord(frontier);
    const frontierDigest = await computeChecksum(frontierRecord as Record<string, unknown>, this._deps.crypto);
    const now = this._deps.clock.timestamp();
    const descriptor = buildStrandDescriptor({
      graphName: this._deps.graphName,
      now,
      frontierRecord,
      frontierDigest,
      normalized,
    });

    await this._deps.descriptors.writeDescriptor(descriptor);
    return descriptor;
  }

  async braid(strandId: string, options: { braidedStrandIds?: string[]; writable?: boolean | null } = {}): Promise<StrandDescriptor> {
    const target = await this.getOrThrow(strandId);
    const braidedIds = normalizeBraidedStrandIds(options.braidedStrandIds, target.strandId);
    const writableOverride = normalizeWritable(options.writable);
    const readOverlays = await this._deps.descriptors.loadBraidedReadOverlays(target, braidedIds);

    await this._deps.descriptors.syncBraidRefs(target.strandId, readOverlays);

    const nextDescriptor: StrandDescriptor = {
      ...target,
      updatedAt: this._deps.clock.timestamp(),
      overlay: {
        ...target.overlay,
        writable: writableOverride !== null ? writableOverride : target.overlay.writable,
      },
      braid: {
        readOverlays,
      },
    };

    await this._deps.descriptors.writeDescriptor(nextDescriptor);
    return nextDescriptor;
  }

  async get(strandId: string): Promise<StrandDescriptor | null> {
    const ref = this._deps.descriptors.buildRef(strandId);
    const oid = await this._deps.persistence.readRef(ref);
    if (oid === null || oid === undefined) {
      return null;
    }
    const descriptor = await this._deps.descriptors.readDescriptorByOid(oid, strandId);
    return await this._deps.descriptors.hydrateDescriptor(descriptor);
  }

  async list(): Promise<StrandDescriptor[]> {
    const prefix = buildStrandsPrefix(this._deps.graphName);
    const refs = await this._deps.persistence.listRefs(prefix);
    const ids = refs
      .map((ref) => ref.slice(prefix.length))
      .filter(Boolean)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    const descriptors: StrandDescriptor[] = [];
    for (const id of ids) {
      const descriptor = await this.get(id);
      if (descriptor) {
        descriptors.push(descriptor);
      }
    }
    return descriptors;
  }

  async drop(strandId: string): Promise<boolean> {
    const ref = this._deps.descriptors.buildRef(strandId);
    const overlayRef = this._deps.descriptors.buildOverlayRef(strandId);
    const braidPrefix = this._deps.descriptors.buildBraidPrefix(strandId);
    const oid = await this._deps.persistence.readRef(ref);
    const overlayHeadSha = await this._deps.persistence.readRef(overlayRef);
    const braidRefs = await this._deps.persistence.listRefs(braidPrefix);
    const hasOid = oid !== null && oid !== undefined;
    const hasOverlaySha = overlayHeadSha !== null && overlayHeadSha !== undefined;
    if (!hasOid && !hasOverlaySha && braidRefs.length === 0) {
      return false;
    }
    for (const braidRef of braidRefs) {
      await this._deps.persistence.deleteRef(braidRef);
    }
    if (hasOverlaySha) {
      await this._deps.persistence.deleteRef(overlayRef);
    }
    if (hasOid) {
      await this._deps.persistence.deleteRef(ref);
    }
    return true;
  }

  async getOrThrow(strandId: string): Promise<StrandDescriptor> {
    const descriptor = await this.get(strandId);
    if (!descriptor) {
      throw new StrandError(`Strand '${strandId}' not found`, {
        code: 'E_STRAND_NOT_FOUND',
        context: { graphName: this._deps.graphName, strandId },
      });
    }
    return descriptor;
  }

  // ── Materialization (delegates) ─────────────────────────────────

  async materialize(strandId: string, options: { receipts?: boolean; ceiling?: number | null } = {}): Promise<unknown> {
    const descriptor = await this.getOrThrow(strandId);
    const ceiling = normalizeLamportCeiling(options.ceiling);
    const { state, receipts } = await this._deps.materializer.materializeDescriptor(descriptor, {
      collectReceipts: options.receipts === true,
      ceiling,
    });
    if (options.receipts === true) {
      return Object.freeze({ state: createImmutableWarpState(state), receipts: createImmutableValue(receipts) });
    }
    return createImmutableWarpState(state);
  }

  // ── Patching (delegates) ────────────────────────────────────────

  async createPatchBuilder(strandId: string): Promise<unknown> {
    return await this._deps.patches.createPatchBuilder(strandId);
  }

  async patch(strandId: string, build: (p: unknown) => void | Promise<void>): Promise<string> {
    return await this._deps.patches.patch(strandId, build);
  }

  async getPatchEntries(strandId: string, options: { ceiling?: number | null } = {}): Promise<Array<{ patch: Patch; sha: string }>> {
    const descriptor = await this.getOrThrow(strandId);
    const ceiling = normalizeLamportCeiling(options.ceiling);
    return await this._deps.materializer.collectPatchEntries(descriptor, { ceiling });
  }

  async patchesFor(strandId: string, entityId: string, options: { ceiling?: number | null } = {}): Promise<string[]> {
    const id = normalizeOptionalString(entityId, 'entityId');
    if (id === null) {
      throw new StrandError('entityId must not be empty', {
        code: 'E_STRAND_INVALID_ARGS',
        context: { field: 'entityId' },
      });
    }
    const entries = await this.getPatchEntries(strandId, options);
    const shas = new Set<string>();
    for (const { patch, sha } of entries) {
      if (patchTouchesEntity(patch as { reads?: string[]; writes?: string[] }, id)) {
        shas.add(sha);
      }
    }
    return [...shas].sort();
  }

  // ── Intents (delegates) ─────────────────────────────────────────

  async queueIntent(strandId: string, build: (p: unknown) => void | Promise<void>): Promise<unknown> {
    return await this._deps.intents.queueIntent(strandId, build);
  }

  async listIntents(strandId: string): Promise<unknown> {
    return await this._deps.intents.listIntents(strandId);
  }

  async tick(strandId: string): Promise<unknown> {
    return await this._deps.intents.tick(strandId);
  }

  // ── Private ─────────────────────────────────────────────────────

  private async _assertStrandDoesNotExist(strandId: string): Promise<void> {
    const ref = this._deps.descriptors.buildRef(strandId);
    const existing = await this._deps.persistence.readRef(ref);
    if (existing !== null && existing !== undefined) {
      throw new StrandError(`Strand '${strandId}' already exists`, {
        code: 'E_STRAND_ALREADY_EXISTS',
        context: { graphName: this._deps.graphName, strandId },
      });
    }
  }

  private async _getFrontier(): Promise<Map<string, string>> {
    // Fetch the current frontier via persistence refs
    const prefix = buildStrandsPrefix(this._deps.graphName);
    // Use the graph's getFrontier if available (test seam)
    if (this._deps.graph && typeof this._deps.graph['getFrontier'] === 'function') {
      return await (this._deps.graph as Record<string, unknown> & { getFrontier(): Promise<Map<string, string>> }).getFrontier();
    }
    // Fallback: return empty frontier
    void prefix;
    return new Map();
  }
}
