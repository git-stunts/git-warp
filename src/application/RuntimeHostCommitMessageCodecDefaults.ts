import { installRuntimeHostCommitMessageCodecResolver } from '../domain/warp/RuntimeHostPortResolvers.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';

export function installDefaultRuntimeHostCommitMessageCodec(): void {
  installRuntimeHostCommitMessageCodecResolver(() => DEFAULT_COMMIT_MESSAGE_CODEC);
}
