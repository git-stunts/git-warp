import type CommitPort from './CommitPort.ts';
import type BlobPort from './BlobPort.ts';
import type TreePort from './TreePort.ts';
import type RefPort from './RefPort.ts';

/**
 * Cohesive kernel persistence surface for the WARP runtime.
 *
 * `WarpKernelPort` names the four focused Git persistence ports required by
 * graph mutation, materialization, and sync orchestration. It is a type-only
 * port so adapters can keep extending `GraphPersistencePort` for runtime
 * conformance while domain services depend on the explicit kernel contract.
 */
export default interface WarpKernelPort extends CommitPort, BlobPort, TreePort, RefPort {}
