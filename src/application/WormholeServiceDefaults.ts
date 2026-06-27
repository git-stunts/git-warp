import {
  createWormhole as createWormholeWithCodec,
  composeWormholes,
  deserializeWormhole,
  replayWormhole,
  serializeWormhole,
} from '../domain/services/WormholeService.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';

type CreateWormholeOptions = Parameters<typeof createWormholeWithCodec>[0];
type RootCreateWormholeOptions =
  Omit<CreateWormholeOptions, 'commitMessageCodec'> &
  Partial<Pick<CreateWormholeOptions, 'commitMessageCodec'>>;

export async function createWormhole(
  options: RootCreateWormholeOptions,
): ReturnType<typeof createWormholeWithCodec> {
  return await createWormholeWithCodec({
    ...options,
    commitMessageCodec: options.commitMessageCodec ?? DEFAULT_COMMIT_MESSAGE_CODEC,
  });
}

export {
  composeWormholes,
  deserializeWormhole,
  replayWormhole,
  serializeWormhole,
};
