import type BlobStoragePort from './BlobStoragePort.ts';
import type { PatchStorageRoute } from './CommitMessageCodecPort.ts';

/**
 * Optional composition capability exposed by persistence adapters that
 * know how to provision runtime storage services for their backend.
 */
export default interface RuntimeStorageCapabilityPort {
  createRuntimeBlobStorage(): Promise<BlobStoragePort>;
  defaultPatchWriteStorage(): PatchStorageRoute;
}
