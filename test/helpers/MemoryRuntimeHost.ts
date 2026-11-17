import { openRuntimeHostProduct as openProductionRuntimeHostProduct } from '../../src/domain/warp/RuntimeHostProduct.ts';
import WarpApp from '../../src/domain/WarpApp.ts';
import WarpCore from '../../src/domain/WarpCore.ts';
import { openWarpGraph as openProductionWarpGraph } from '../../src/domain/WarpGraph.ts';
import { openWarpWorldline as openProductionWarpWorldline } from '../../src/domain/WarpWorldline.ts';
import MemoryRuntimeStorageAdapter from '../../test/helpers/MemoryRuntimeStorageAdapter.ts';

import { resolveConfiguredClock } from '../../src/domain/warp/RuntimeHostPortResolvers.ts';
import type { CorePersistence } from '../../src/domain/types/WarpPersistence.ts';
import type ClockPort from '../../src/ports/ClockPort.ts';
import type RuntimeStorageProviderPort from '../../src/ports/RuntimeStorageProviderPort.ts';
import type InMemoryGraphAdapter from './InMemoryGraphAdapter.ts';

type RuntimeHostOpenInput = Parameters<typeof openProductionRuntimeHostProduct>[0];

type MemoryStorageEntry = {
  readonly storage: RuntimeStorageProviderPort;
  readonly clock: ClockPort;
};

// One storage per history, so a reopen sees the same content and replay store.
const STORAGE_BY_HISTORY = new WeakMap<object, MemoryStorageEntry>();

/**
 * Gives a runtime memory storage when it has none. The runtime and its replay
 * store share one clock: the configured clock, or the runtime's default clock.
 */
async function withMemoryRuntimeStorage<TOptions extends {
  readonly persistence: CorePersistence;
  readonly runtimeStorage?: RuntimeStorageProviderPort;
  readonly clock?: ClockPort;
}>(
  options: TOptions,
): Promise<TOptions & { readonly runtimeStorage: RuntimeStorageProviderPort }> {
  if (options.runtimeStorage !== undefined) {
    return { ...options, runtimeStorage: options.runtimeStorage };
  }
  assertPersistence(options.persistence);
  const clock = await resolveConfiguredClock(options.clock);
  return {
    ...options,
    clock,
    runtimeStorage: createMemoryRuntimeStorage(options.persistence, clock),
  };
}

export function createMemoryRuntimeStorage(
  history: CorePersistence,
  clock: ClockPort,
): RuntimeStorageProviderPort {
  assertPersistence(history);
  const cached = STORAGE_BY_HISTORY.get(history);
  if (cached !== undefined) {
    if (cached.clock !== clock) {
      throw new Error('this history already has memory storage on another clock: reopen it with the same clock');
    }
    return cached.storage;
  }
  const storage = new MemoryRuntimeStorageAdapter({ history: history as InMemoryGraphAdapter, clock });
  STORAGE_BY_HISTORY.set(history, Object.freeze({ storage, clock }));
  return storage;
}

function assertPersistence(history: CorePersistence): void {
  if ((typeof history !== 'object' && typeof history !== 'function') || history === null) {
    throw new Error('persistence is required');
  }
}

export async function openMemoryRuntimeHostProduct(
  options: RuntimeHostOpenInput,
): ReturnType<typeof openProductionRuntimeHostProduct> {
  return await openProductionRuntimeHostProduct(await withMemoryRuntimeStorage(options));
}

export async function openMemoryWarpApp(
  options: Parameters<typeof WarpApp.open>[0],
): ReturnType<typeof WarpApp.open> {
  return await WarpApp.open(await withMemoryRuntimeStorage(options));
}

export async function openMemoryWarpCore(
  options: Parameters<typeof WarpCore.open>[0],
): ReturnType<typeof WarpCore.open> {
  return await WarpCore.open(await withMemoryRuntimeStorage(options));
}

export async function openMemoryWarpGraph(
  options: Parameters<typeof openProductionWarpGraph>[0],
): ReturnType<typeof openProductionWarpGraph> {
  return await openProductionWarpGraph(await withMemoryRuntimeStorage(options));
}

export async function openMemoryWarpWorldline(
  options: Parameters<typeof openProductionWarpWorldline>[0],
): ReturnType<typeof openProductionWarpWorldline> {
  return await openProductionWarpWorldline(await withMemoryRuntimeStorage(options));
}
