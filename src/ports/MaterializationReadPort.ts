import type BundleHandle from '../domain/storage/BundleHandle.ts';

/** Bounded reads over independently retained materialization roots. */
export default abstract class MaterializationReadPort {
  abstract hasNode(_nodeAliveRoot: BundleHandle, _nodeId: string): Promise<boolean>;
}
