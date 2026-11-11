import WarpStorage from '../../src/application/WarpStorage.ts';
import { bindWarpStorage } from '../../src/application/WarpStorageRegistry.ts';
import { getDefaultRuntimeHostNodePorts } from '../../src/application/RuntimeHostNodeDefaults.ts';
import InMemoryGraphAdapter from './InMemoryGraphAdapter.ts';
import MemoryRuntimeStorageAdapter from './MemoryRuntimeStorageAdapter.ts';

/** Test-only storage composition; production applications use GitStorage. */
export default class MemoryStorage extends WarpStorage {
  private constructor() {
    super();
  }

  static create(): MemoryStorage {
    const history = new InMemoryGraphAdapter();
    // openWarp runs its timelines on the default runtime clock; the replay store shares it.
    const runtimeStorage = new MemoryRuntimeStorageAdapter({
      history,
      clock: getDefaultRuntimeHostNodePorts().clock,
    });
    const storage = new MemoryStorage();
    bindWarpStorage(storage, { history, runtimeStorage });
    return storage;
  }
}
