/**
 * Role-specific persistence port types.
 *
 * Instead of casting to `any` when accessing persistence methods,
 * use these narrow types to document which port methods are actually needed.
 *
 * NOTE: CommitPort, BlobPort, TreePort, and RefPort each contain both
 * read and write methods. True read/write separation would require
 * splitting each port, which is deferred. For now, the role-named
 * aliases below are identical — they exist to document *intent* at
 * each call site, not to enforce access restrictions.
 *
 * @module domain/types/WarpPersistence
 */

import type BlobPort from '../../ports/BlobPort.ts';
import type TreePort from '../../ports/TreePort.ts';
import type RefPort from '../../ports/RefPort.ts';
import type WarpKernelPort from '../../ports/WarpKernelPort.ts';

/**
 * Standard WARP kernel persistence surface — commit + blob + tree + ref.
 * Used by sync readers, checkpoint creators, patch writers, and
 * materialize paths. Identical to CheckpointPersistence by design
 * (see module-level note).
 */
export type CorePersistence = WarpKernelPort;

/**
 * Index storage — blob reads/writes, tree reads/writes, ref reads/writes.
 * Matches the dynamically-composed IndexStoragePort interface.
 */
export type IndexStorage = BlobPort & TreePort & RefPort;
