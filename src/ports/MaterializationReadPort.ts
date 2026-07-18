import type BundleHandle from '../domain/storage/BundleHandle.ts';
import type { PropValue } from '../domain/types/PropValue.ts';

/** Bounded reads over independently retained materialization roots. */
export default abstract class MaterializationReadPort {
  abstract hasNode(_nodeAliveRoot: BundleHandle, _nodeId: string): Promise<boolean>;

  getNodeProperties(
    _propertiesRoot: BundleHandle,
    _nodeId: string,
  ): Promise<Readonly<Record<string, PropValue>> | null | undefined> {
    return Promise.resolve(undefined);
  }
}
