/**
 * Strand methods for WarpRuntime.
 *
 * @module domain/warp/strand.methods
 */

import StrandService from '../services/StrandService.js';

/**
 * Creates a new strand with the given options.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {import('../services/StrandService.js').StrandCreateOptions} [options]
 * @returns {Promise<import('../services/StrandService.js').StrandDescriptor>}
 */
export async function createStrand(options) {
  const service = new StrandService({ graph: this });
  return await service.create(options);
}

/**
 * Braids a strand, merging its overlay back into the base graph.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {string} strandId
 * @param {import('../services/StrandService.js').StrandBraidOptions} [options]
 * @returns {Promise<import('../services/StrandService.js').StrandDescriptor>}
 */
export async function braidStrand(strandId, options) {
  const service = new StrandService({ graph: this });
  return await service.braid(strandId, options);
}

/**
 * Retrieves the descriptor for a strand by its identifier.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {string} strandId
 * @returns {Promise<import('../services/StrandService.js').StrandDescriptor|null>}
 */
export async function getStrand(strandId) {
  const service = new StrandService({ graph: this });
  return await service.get(strandId);
}

/**
 * Lists all strand descriptors in the current graph.
 *
 * @this {import('../WarpRuntime.js').default}
 * @returns {Promise<import('../services/StrandService.js').StrandDescriptor[]>}
 */
export async function listStrands() {
  const service = new StrandService({ graph: this });
  return await service.list();
}

/**
 * Drops (deletes) a strand, removing its refs and overlay data.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {string} strandId
 * @returns {Promise<boolean>}
 */
export async function dropStrand(strandId) {
  const service = new StrandService({ graph: this });
  return await service.drop(strandId);
}

/**
 * Materializes the graph state scoped to a single strand.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {string} strandId
 * @param {{ receipts?: boolean, ceiling?: number|null }} [options]
 * @returns {Promise<import('../services/JoinReducer.js').WarpStateV5|{state: import('../services/JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[]}>}
 */
export async function materializeStrand(strandId, options) {
  const service = new StrandService({ graph: this });
  return await service.materialize(strandId, options);
}

/**
 * Retrieves all patch entries belonging to a strand.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {string} strandId
 * @param {{ ceiling?: number|null }} [options]
 * @returns {Promise<Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>>}
 */
export async function getStrandPatches(strandId, options) {
  const service = new StrandService({ graph: this });
  return await service.getPatchEntries(strandId, options);
}

/**
 * Returns the patch SHAs that touched a given entity within a strand.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {string} strandId
 * @param {string} entityId
 * @param {{ ceiling?: number|null }} [options]
 * @returns {Promise<string[]>}
 */
export async function patchesForStrand(strandId, entityId, options) {
  const service = new StrandService({ graph: this });
  return await service.patchesFor(strandId, entityId, options);
}

/**
 * Creates a PatchBuilderV2 scoped to a strand for manual patch construction.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {string} strandId
 * @returns {Promise<import('../services/PatchBuilderV2.js').PatchBuilderV2>}
 */
export async function createStrandPatch(strandId) {
  const service = new StrandService({ graph: this });
  return await service.createPatchBuilder(strandId);
}

/**
 * Applies a patch to a strand using a builder callback and commits it.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {string} strandId
 * @param {(p: import('../services/PatchBuilderV2.js').PatchBuilderV2) => void | Promise<void>} build
 * @returns {Promise<string>}
 */
export async function patchStrand(strandId, build) {
  const service = new StrandService({ graph: this });
  return await service.patch(strandId, build);
}

/**
 * Queues a speculative intent on a strand without committing it.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {string} strandId
 * @param {(p: import('../services/PatchBuilderV2.js').PatchBuilderV2) => void | Promise<void>} build
 * @returns {Promise<{
 *   intentId: string,
 *   enqueuedAt: string,
 *   patch: import('../types/WarpTypesV2.js').PatchV2,
 *   reads: string[],
 *   writes: string[],
 *   contentBlobOids: string[]
 * }>}
 */
export async function queueStrandIntent(strandId, build) {
  const service = new StrandService({ graph: this });
  return await service.queueIntent(strandId, build);
}

/**
 * Lists all pending intents queued on a strand.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {string} strandId
 * @returns {Promise<Array<{
 *   intentId: string,
 *   enqueuedAt: string,
 *   patch: import('../types/WarpTypesV2.js').PatchV2,
 *   reads: string[],
 *   writes: string[],
 *   contentBlobOids: string[]
 * }>>}
 */
export async function listStrandIntents(strandId) {
  const service = new StrandService({ graph: this });
  return await service.listIntents(strandId);
}

/**
 * Advances a strand by one tick, draining queued intents with conflict detection.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {string} strandId
 * @returns {Promise<{
 *   tickId: string,
 *   strandId: string,
 *   tickIndex: number,
 *   createdAt: string,
 *   drainedIntentCount: number,
 *   admittedIntentIds: string[],
 *   rejected: Array<{
 *     intentId: string,
 *     reason: string,
 *     conflictsWith: string[],
 *     reads: string[],
 *     writes: string[]
 *   }>,
 *   baseOverlayHeadPatchSha: string|null,
 *   overlayHeadPatchSha: string|null,
 *   overlayPatchShas: string[]
 * }>}
 */
export async function tickStrand(strandId) {
  const service = new StrandService({ graph: this });
  return await service.tick(strandId);
}
