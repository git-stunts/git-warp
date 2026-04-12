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
import { createImmutableValue, createImmutableWarpState } from '../ImmutableSnapshot.js';
import {
  normalizeCreateOptions, normalizeLamportCeiling,
  normalizeWritable, normalizeBraidedStrandIds, patchTouchesEntity,
} from './StrandDescriptorValidation.ts';
import { normalizeOptionalString } from './strandShared.js';
import type StrandDescriptorStore from './StrandDescriptorStore.ts';
import type StrandMaterializer from './StrandMaterializer.js';
import type StrandPatchService from './StrandPatchService.js';
import type StrandIntentService from './StrandIntentService.js';
import type ClockPort from '../../../ports/ClockPort.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import type GraphPersistencePort from '../../../ports/GraphPersistencePort.ts';

// Re-export constants that were on StrandService
export { STRAND_SCHEMA_VERSION, STRAND_COORDINATE_VERSION, STRAND_OVERLAY_KIND } from './strandShared.js';

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
};

type StrandDescriptor = import('./strandTypes.js').StrandDescriptor;


export default class StrandCoordinator {
  private readonly _deps: StrandCoordinatorDeps;

  constructor(deps: StrandCoordinatorDeps) {
    this._deps = deps;
  }

  // ── Lifecycle (owns the logic) ──────────────────────────────────

  async create(options: { strandId?: string; lamportCeiling?: number | null; owner?: string | null; scope?: string | null; leaseExpiresAt?: string | null } = {}): Promise<StrandDescriptor> {
    const normalized = normalizeCreateOptions(options);
    const d = this._deps;
    await this._assertStrandDoesNotExist(normalized.strandId);

    const frontier = await d.persistence.listRefs(buildStrandsPrefix(d.graphName));
    void frontier; // frontier fetched via getFrontier on host — TODO: inject as port
    // For now, delegate to descriptors which has the full creation logic
    return await d.descriptors.create(normalized, d);
  }

  async braid(strandId: string, options: { braidedStrandIds?: string[]; writable?: boolean | null } = {}): Promise<StrandDescriptor> {
    const target = await this.getOrThrow(strandId);
    const braidedIds = normalizeBraidedStrandIds(options.braidedStrandIds, target.strandId);
    const writableOverride = normalizeWritable(options.writable);
    return await this._deps.descriptors.braid(target, braidedIds, writableOverride, this._deps);
  }

  async get(strandId: string): Promise<StrandDescriptor | null> {
    return await this._deps.descriptors.get(strandId);
  }

  async list(): Promise<StrandDescriptor[]> {
    return await this._deps.descriptors.list();
  }

  async drop(strandId: string): Promise<boolean> {
    return await this._deps.descriptors.drop(strandId);
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

  async getPatchEntries(strandId: string, options: { ceiling?: number | null } = {}): Promise<Array<{ patch: unknown; sha: string }>> {
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
}
