import { resolveWarpStorage } from '../../src/application/WarpStorageRegistry.ts';
import type MemoryStorage from './MemoryStorage.ts';
import { openMemoryRuntimeHostProduct } from './MemoryRuntimeHost.ts';

export async function createBoundedReadBasis(
  storage: MemoryStorage,
  graphName: string
): Promise<void> {
  const binding = resolveWarpStorage(storage);
  const runtime = await openMemoryRuntimeHostProduct({
    persistence: binding.history,
    runtimeStorage: binding.runtimeStorage,
    graphName,
    writerId: 'agent-1',
  });
  await runtime.materialize();
  await runtime.createCheckpoint();
}
