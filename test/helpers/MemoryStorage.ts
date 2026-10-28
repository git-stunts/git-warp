import WarpStorage from '../../src/application/WarpStorage.ts';
import { bindWarpStorage } from '../../src/application/WarpStorageRegistry.ts';
import ConeBasis from '../../src/domain/services/cone/ConeBasis.ts';
import ConeBasisHead from '../../src/domain/services/cone/ConeBasisHead.ts';
import ConeFrontier from '../../src/domain/services/cone/ConeFrontier.ts';
import ConeRoot from '../../src/domain/services/cone/ConeRoot.ts';
import ConeWriterPosition from '../../src/domain/services/cone/ConeWriterPosition.ts';
import InMemoryGraphAdapter from './InMemoryGraphAdapter.ts';
import type InMemoryConeRecordStore from './InMemoryConeRecordStore.ts';
import MemoryRuntimeStorageAdapter from './MemoryRuntimeStorageAdapter.ts';

/** The cone record trie and basis heads every lane of one storage reads (#1039); storage handles are frozen. */
const CONE_RECORDS = new WeakMap<MemoryStorage, InMemoryConeRecordStore>();

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
    CONE_RECORDS.set(storage, runtimeStorage.coneRecords);
    return storage;
  }

  /**
   * Publishes a lane basis that claims `writerId` folded a patch its chain
   * does not hold, as a rewritten writer chain would leave it: the next
   * advance of that lane is obstructed as diverged.
   */
  divergeLaneBasis(lane: string, writerId: string): void {
    const frontier = ConeFrontier.empty().advanced(writerId, new ConeWriterPosition('f'.repeat(40), 1));
    CONE_RECORDS.get(this)?.forceHead(ConeBasisHead.forLane(lane), new ConeBasis(ConeRoot.empty(), frontier));
  }

  /** Deletes a lane's published basis, so its next advance refolds the writer chains from the start. */
  async clearLaneBasis(lane: string): Promise<void> {
    await CONE_RECORDS.get(this)?.dropBasis(ConeBasisHead.forLane(lane));
  }
}
