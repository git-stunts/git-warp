import type CommitPort from './CommitPort.ts';
import type RefPort from './RefPort.ts';

/**
 * Cohesive kernel persistence surface for the WARP runtime.
 *
 * `WarpKernelPort` names causal commit and ref history. Immutable payloads,
 * checkpoints, and indexes use separate semantic storage ports.
 */
export default interface WarpKernelPort extends CommitPort, RefPort {}
