/**
 * Strand methods for WarpRuntime.
 *
 * @module domain/warp/strand.methods
 */

import StrandService from '../services/StrandService.js';

/**
 * @this {import('../WarpRuntime.js').default}
 * @param {import('../services/StrandService.js').StrandCreateOptions} [options]
 * @returns {Promise<import('../services/StrandService.js').StrandDescriptor>}
 */
export async function createStrand(options) {
  const service = new StrandService({ graph: this });
  return await service.create(options);
}

/**
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
 * @this {import('../WarpRuntime.js').default}
 * @param {string} strandId
 * @returns {Promise<import('../services/StrandService.js').StrandDescriptor|null>}
 */
export async function getStrand(strandId) {
  const service = new StrandService({ graph: this });
  return await service.get(strandId);
}

/**
 * @this {import('../WarpRuntime.js').default}
 * @returns {Promise<import('../services/StrandService.js').StrandDescriptor[]>}
 */
export async function listStrands() {
  const service = new StrandService({ graph: this });
  return await service.list();
}

/**
 * @this {import('../WarpRuntime.js').default}
 * @param {string} strandId
 * @returns {Promise<boolean>}
 */
export async function dropStrand(strandId) {
  const service = new StrandService({ graph: this });
  return await service.drop(strandId);
}

/**
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
 * @this {import('../WarpRuntime.js').default}
 * @param {string} strandId
 * @returns {Promise<import('../services/PatchBuilderV2.js').PatchBuilderV2>}
 */
export async function createStrandPatch(strandId) {
  const service = new StrandService({ graph: this });
  return await service.createPatchBuilder(strandId);
}

/**
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
