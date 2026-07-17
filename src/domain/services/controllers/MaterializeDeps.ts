import type CheckpointStorePort from '../../../ports/CheckpointStorePort.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import type MaterializationReadPort from '../../../ports/MaterializationReadPort.ts';
import type MaterializationStorePort from '../../../ports/MaterializationStorePort.ts';
import type WarpStateCachePort from '../../../ports/WarpStateCachePort.ts';
import type DetachedGraphFactory from '../../capabilities/DetachedGraphFactory.ts';
import type PatchCollector from '../../capabilities/PatchCollector.ts';
import type { MaterializeSessionOpener } from './MaterializeSessionBridge.ts';

export type MaterializePersistence = {
  readRef(ref: string): Promise<string | null>;
};

/** Constructor dependencies for retained-handle materialization operations. */
export type MaterializeDeps = {
  logger: LoggerPort;
  codec: CodecPort;
  crypto: CryptoPort;
  persistence: MaterializePersistence;
  checkpointStore: CheckpointStorePort;
  materializations: MaterializationStorePort;
  materializationRead?: MaterializationReadPort;
  getStateCache?: () => WarpStateCachePort | null;
  openStateSession?: MaterializeSessionOpener;
  patches: PatchCollector;
  graphCloner: DetachedGraphFactory;
  graphName: string;
};
