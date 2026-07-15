import { openRuntimeHostProduct as openProductionRuntimeHostProduct } from '../../src/domain/warp/RuntimeHostProduct.ts';
import WarpApp from '../../src/domain/WarpApp.ts';
import WarpCore from '../../src/domain/WarpCore.ts';
import { openWarpGraph as openProductionWarpGraph } from '../../src/domain/WarpGraph.ts';
import { openWarpWorldline as openProductionWarpWorldline } from '../../src/domain/WarpWorldline.ts';
import MemoryRuntimeStorageAdapter from '../../test/helpers/MemoryRuntimeStorageAdapter.ts';

import type { CorePersistence } from '../../src/domain/types/WarpPersistence.ts';
import type RuntimeStorageProviderPort from '../../src/ports/RuntimeStorageProviderPort.ts';
import type InMemoryGraphAdapter from './InMemoryGraphAdapter.ts';

type RuntimeHostOpenInput = Parameters<typeof openProductionRuntimeHostProduct>[0];

const STORAGE_BY_HISTORY = new WeakMap<object, RuntimeStorageProviderPort>();

function withMemoryRuntimeStorage<TOptions extends {
  readonly persistence: CorePersistence;
  readonly runtimeStorage?: RuntimeStorageProviderPort;
}>(
  options: TOptions,
): TOptions & { readonly runtimeStorage: RuntimeStorageProviderPort } {
  return {
    ...options,
    runtimeStorage: options.runtimeStorage ?? createMemoryRuntimeStorage(options.persistence),
  };
}

export function createMemoryRuntimeStorage(
  history: CorePersistence,
): RuntimeStorageProviderPort {
  if ((typeof history !== 'object' && typeof history !== 'function') || history === null) {
    throw new Error('persistence is required');
  }
  const cached = STORAGE_BY_HISTORY.get(history);
  if (cached !== undefined) {
    return cached;
  }
  const storage = new MemoryRuntimeStorageAdapter({ history: history as InMemoryGraphAdapter });
  STORAGE_BY_HISTORY.set(history, storage);
  return storage;
}

export async function openMemoryRuntimeHostProduct(
  options: RuntimeHostOpenInput,
): ReturnType<typeof openProductionRuntimeHostProduct> {
  return await openProductionRuntimeHostProduct(withMemoryRuntimeStorage(options));
}

export async function openMemoryWarpApp(
  options: Parameters<typeof WarpApp.open>[0],
): ReturnType<typeof WarpApp.open> {
  return await WarpApp.open(withMemoryRuntimeStorage(options));
}

export async function openMemoryWarpCore(
  options: Parameters<typeof WarpCore.open>[0],
): ReturnType<typeof WarpCore.open> {
  return await WarpCore.open(withMemoryRuntimeStorage(options));
}

export async function openMemoryWarpGraph(
  options: Parameters<typeof openProductionWarpGraph>[0],
): ReturnType<typeof openProductionWarpGraph> {
  return await openProductionWarpGraph(withMemoryRuntimeStorage(options));
}

export async function openMemoryWarpWorldline(
  options: Parameters<typeof openProductionWarpWorldline>[0],
): ReturnType<typeof openProductionWarpWorldline> {
  return await openProductionWarpWorldline(withMemoryRuntimeStorage(options));
}
