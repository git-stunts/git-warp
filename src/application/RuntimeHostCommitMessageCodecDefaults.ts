import { installRuntimeHostCommitMessageCodecResolver } from '../domain/warp/RuntimeHostBoot.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';

export function installDefaultRuntimeHostCommitMessageCodec(): void {
  installRuntimeHostCommitMessageCodecResolver(() => DEFAULT_COMMIT_MESSAGE_CODEC);
}
