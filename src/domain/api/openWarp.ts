import type RuntimeStorageCapabilityPort from '../../ports/RuntimeStorageCapabilityPort.ts';
import type { CorePersistence } from '../types/WarpPersistence.ts';
import { openWarpWorldline } from '../WarpWorldline.ts';
import Warp from './Warp.ts';
import { assertIdentity } from './assertIdentity.ts';
import { createTimeline } from './TimelineRuntime.ts';
import WarpError from '../errors/WarpError.ts';
import { OPEN_WARP_IDENTITY_FAILURE } from './OpenWarpIdentityFailure.ts';

export type WarpStorage = CorePersistence & Partial<RuntimeStorageCapabilityPort>;

export type OpenWarpOptions = {
  readonly storage: WarpStorage;
  readonly writer: string;
};

export function openWarp(options: OpenWarpOptions): Promise<Warp> {
  return Promise.resolve().then(() => {
    assertOpenWarpOptions(options);
    const { storage, writer } = options;

    return new Warp({
      writer,
      openTimeline: async (name) => createTimeline(
        await openWarpWorldline({
          persistence: storage,
          worldlineName: name,
          writerId: writer,
        }),
      ),
    });
  });
}

function assertOpenWarpOptions(options: OpenWarpOptions | null | undefined): void {
  if (options === null || options === undefined) {
    throw new WarpError('openWarp options are required', 'E_OPEN_WARP_OPTIONS');
  }
  if (options.storage === null || options.storage === undefined) {
    throw new WarpError('openWarp requires storage', 'E_OPEN_WARP_STORAGE');
  }
  assertIdentity(options.writer, 'writer', OPEN_WARP_IDENTITY_FAILURE);
}
