/**
 * Working-set methods for WarpGraph.
 *
 * @module domain/warp/workingSet.methods
 */

import WorkingSetService from '../services/WorkingSetService.js';

/**
 * @this {import('../WarpGraph.js').default}
 * @param {import('../../../index.js').WorkingSetCreateOptions} [options]
 * @returns {Promise<import('../../../index.js').WorkingSetDescriptor>}
 */
export async function createWorkingSet(options) {
  const service = new WorkingSetService({ graph: this });
  return await service.create(options);
}

/**
 * @this {import('../WarpGraph.js').default}
 * @param {string} workingSetId
 * @returns {Promise<import('../../../index.js').WorkingSetDescriptor|null>}
 */
export async function getWorkingSet(workingSetId) {
  const service = new WorkingSetService({ graph: this });
  return await service.get(workingSetId);
}

/**
 * @this {import('../WarpGraph.js').default}
 * @returns {Promise<import('../../../index.js').WorkingSetDescriptor[]>}
 */
export async function listWorkingSets() {
  const service = new WorkingSetService({ graph: this });
  return await service.list();
}

/**
 * @this {import('../WarpGraph.js').default}
 * @param {string} workingSetId
 * @returns {Promise<boolean>}
 */
export async function dropWorkingSet(workingSetId) {
  const service = new WorkingSetService({ graph: this });
  return await service.drop(workingSetId);
}

/**
 * @this {import('../WarpGraph.js').default}
 * @param {string} workingSetId
 * @param {{ receipts?: boolean, ceiling?: number|null }} [options]
 * @returns {Promise<import('../services/JoinReducer.js').WarpStateV5|{state: import('../services/JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[]}>}
 */
export async function materializeWorkingSet(workingSetId, options) {
  const service = new WorkingSetService({ graph: this });
  return await service.materialize(workingSetId, options);
}

/**
 * @this {import('../WarpGraph.js').default}
 * @param {string} workingSetId
 * @param {{ ceiling?: number|null }} [options]
 * @returns {Promise<Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>>}
 */
export async function getWorkingSetPatches(workingSetId, options) {
  const service = new WorkingSetService({ graph: this });
  return await service.getPatchEntries(workingSetId, options);
}

/**
 * @this {import('../WarpGraph.js').default}
 * @param {string} workingSetId
 * @param {string} entityId
 * @param {{ ceiling?: number|null }} [options]
 * @returns {Promise<string[]>}
 */
export async function patchesForWorkingSet(workingSetId, entityId, options) {
  const service = new WorkingSetService({ graph: this });
  return await service.patchesFor(workingSetId, entityId, options);
}

/**
 * @this {import('../WarpGraph.js').default}
 * @param {string} workingSetId
 * @returns {Promise<import('../services/PatchBuilderV2.js').PatchBuilderV2>}
 */
export async function createWorkingSetPatch(workingSetId) {
  const service = new WorkingSetService({ graph: this });
  return await service.createPatchBuilder(workingSetId);
}

/**
 * @this {import('../WarpGraph.js').default}
 * @param {string} workingSetId
 * @param {(p: import('../services/PatchBuilderV2.js').PatchBuilderV2) => void | Promise<void>} build
 * @returns {Promise<string>}
 */
export async function patchWorkingSet(workingSetId, build) {
  const service = new WorkingSetService({ graph: this });
  return await service.patch(workingSetId, build);
}
