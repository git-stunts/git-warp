import type CommitMessageCodecPort from '../../../ports/CommitMessageCodecPort.ts';
import MessageCodecError from '../../errors/MessageCodecError.ts';

export function requireCommitMessageCodec(
  commitMessageCodec: CommitMessageCodecPort | null | undefined,
): CommitMessageCodecPort {
  if (commitMessageCodec === null || commitMessageCodec === undefined) {
    throw new MessageCodecError('commitMessageCodec is required at the runtime boundary', {
      code: 'E_MESSAGE_CODEC_REQUIRED',
    });
  }
  return commitMessageCodec;
}
