import WarpError from '../domain/errors/WarpError.ts';
import type { CorePersistence } from '../domain/types/WarpPersistence.ts';
import type CryptoPort from '../ports/CryptoPort.ts';
import type RuntimeStorageProviderPort from '../ports/RuntimeStorageProviderPort.ts';
import type TrustChainPort from '../ports/TrustChainPort.ts';
import type HookPathPort from '../ports/HookPathPort.ts';
import type WarpStorage from './WarpStorage.ts';

export type WarpStorageBinding = {
  readonly history: CorePersistence;
  readonly runtimeStorage: RuntimeStorageProviderPort;
  readonly createTrustChain?: (crypto: CryptoPort) => TrustChainPort;
  readonly hookPaths?: HookPathPort;
};

const STORAGE_BINDINGS = new WeakMap<WarpStorage, WarpStorageBinding>();

export function bindWarpStorage(storage: WarpStorage, binding: WarpStorageBinding): void {
  if (STORAGE_BINDINGS.has(storage)) {
    throw new WarpError('WarpStorage is already bound', 'E_WARP_STORAGE_BOUND');
  }
  STORAGE_BINDINGS.set(storage, Object.freeze({ ...binding }));
}

export function resolveWarpStorage(storage: WarpStorage): WarpStorageBinding {
  const binding = STORAGE_BINDINGS.get(storage);
  if (binding === undefined) {
    throw new WarpError(
      'WarpStorage was not created by a supported storage constructor',
      'E_WARP_STORAGE_UNBOUND'
    );
  }
  return binding;
}
