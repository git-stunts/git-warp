/**
 * Canonical strand model typedefs shared by the strand collaborators.
 *
 * This centralizes the strand shape corridor so the extracted services
 * stop re-declaring the same descriptor, queue, and tick record forms.
 * These are still typedef-backed concepts, not runtime-backed classes.
 *
 * @module domain/services/strand/strandTypes
 */

/** @import { PatchV2 } from '../../types/WarpTypesV2.js' */
/** @import { parseStrandBlob as parseStrandBlobFn } from '../../utils/parseStrandBlob.js' */

/**
 * @typedef {ReturnType<typeof parseStrandBlobFn>} ParsedStrandBlob
 */

/**
 * @typedef {{
 *   strandId: string,
 *   overlayId: string,
 *   kind: string,
 *   headPatchSha: string|null,
 *   patchCount: number
 * }} StrandReadOverlayDescriptor
 */

/**
 * @typedef {{
 *   intentId: string,
 *   enqueuedAt: string,
 *   patch: PatchV2,
 *   reads: string[],
 *   writes: string[],
 *   contentBlobOids: string[]
 * }} StrandQueuedIntent
 */

/**
 * @typedef {{
 *   intentId: string,
 *   reason: string,
 *   conflictsWith: string[],
 *   reads: string[],
 *   writes: string[]
 * }} StrandRejectedCounterfactual
 */

/**
 * @typedef {{
 *   tickId: string,
 *   strandId: string,
 *   tickIndex: number,
 *   createdAt: string,
 *   drainedIntentCount: number,
 *   admittedIntentIds: string[],
 *   rejected: StrandRejectedCounterfactual[],
 *   baseOverlayHeadPatchSha: string|null,
 *   overlayHeadPatchSha: string|null,
 *   overlayPatchShas: string[]
 * }} StrandTickRecord
 */

/**
 * @typedef {{
 *   nextIntentSeq: number,
 *   intents: StrandQueuedIntent[]
 * }} StrandIntentQueue
 */

/**
 * @typedef {{
 *   tickCount: number,
 *   lastTick: StrandTickRecord|null
 * }} StrandEvolution
 */

/**
 * @typedef {ParsedStrandBlob & {
 *   overlay: ParsedStrandBlob['overlay'] & { writable: boolean },
 *   braid: { readOverlays: StrandReadOverlayDescriptor[] },
 *   intentQueue: StrandIntentQueue,
 *   evolution: StrandEvolution
 * }} StrandDescriptor
 */

// Export nothing at runtime — types only
export {};
