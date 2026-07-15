/**
 * Role-specific persistence port types.
 *
 * Instead of casting to `any` when accessing persistence methods,
 * use these narrow types to document which port methods are actually needed.
 *
 * Payload and cache storage is intentionally absent. Domain services use
 * AssetStoragePort, CheckpointStorePort, and IndexStorePort for those roles.
 *
 * @module domain/types/WarpPersistence
 */

import type WarpKernelPort from '../../ports/WarpKernelPort.ts';

/**
 * Standard WARP causal history surface — commit and ref operations only.
 */
export type CorePersistence = WarpKernelPort;
