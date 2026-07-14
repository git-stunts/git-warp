import WarpStorage from '../../src/application/WarpStorage.ts';
import { bindWarpStorage } from '../../src/application/WarpStorageRegistry.ts';
import InMemoryGraphAdapter from './InMemoryGraphAdapter.ts';
import MemoryRuntimeStorageAdapter from './MemoryRuntimeStorageAdapter.ts';

/** Test-only storage composition; production applications use GitStorage. */
export default class MemoryStorage extends WarpStorage {
  private constructor() {
    super();
  }

  static create(): MemoryStorage {
    const history = new InMemoryGraphAdapter();
    const runtimeStorage = new MemoryRuntimeStorageAdapter({ history });
    const storage = new MemoryStorage();
    bindWarpStorage(storage, { history, runtimeStorage });
    return storage;
  }
}
