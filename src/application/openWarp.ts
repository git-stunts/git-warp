import Warp from '../domain/api/Warp.ts';
import { assertWriterIdentity } from '../domain/api/assertIdentity.ts';
import { OPEN_WARP_IDENTITY_FAILURE } from '../domain/api/OpenWarpIdentityFailure.ts';
import { createTimeline } from '../domain/api/TimelineRuntime.ts';
import WarpError from '../domain/errors/WarpError.ts';
import { openWarpWorldline } from '../domain/WarpWorldline.ts';
import { installDefaultRuntimeHostNodePorts } from './RuntimeHostNodeDefaults.ts';
import WarpStorage from './WarpStorage.ts';
import { resolveWarpStorage } from './WarpStorageRegistry.ts';

export type OpenWarpOptions = {
  readonly storage: WarpStorage;
  readonly writer: string;
};

export function openWarp(options: OpenWarpOptions): Promise<Warp> {
  return Promise.resolve().then(() => {
    assertOpenWarpOptions(options);
    installDefaultRuntimeHostNodePorts();
    const binding = resolveWarpStorage(options.storage);

    return new Warp({
      writer: options.writer,
      openTimeline: async (name) =>
        createTimeline(
          await openWarpWorldline({
            persistence: binding.history,
            runtimeStorage: binding.runtimeStorage,
            worldlineName: name,
            writerId: options.writer,
          }),
        ),
    });
  });
}

function assertOpenWarpOptions(options: OpenWarpOptions | null | undefined): void {
  if (options === null || options === undefined) {
    throw new WarpError('openWarp options are required', 'E_OPEN_WARP_OPTIONS');
  }
  if (!(options.storage instanceof WarpStorage)) {
    throw new WarpError(
      'openWarp requires a WarpStorage handle',
      'E_OPEN_WARP_STORAGE',
    );
  }
  assertWriterIdentity(options.writer, 'writer', OPEN_WARP_IDENTITY_FAILURE);
}
