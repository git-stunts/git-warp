import BundleHandle from '../../domain/storage/BundleHandle.ts';
import MessageCodecError from '../../domain/errors/MessageCodecError.ts';
import type { CheckpointCommitMessage } from '../../ports/CommitMessageCodecPort.ts';

export type EncodedCheckpointCommitMessage = Omit<CheckpointCommitMessage, 'bundleHandle'> & {
  readonly bundleHandle: string | null;
};

/** Lowers a storage-neutral checkpoint message into trailer-safe scalar fields. */
export function encodeCheckpointBundleHandle(
  message: CheckpointCommitMessage,
  checkpointVersion: string,
): EncodedCheckpointCommitMessage {
  const encoded = {
    ...message,
    checkpointVersion: message.checkpointVersion ?? checkpointVersion,
    bundleHandle: message.bundleHandle?.toString() ?? null,
  };
  requireCheckpointBundleBinding(encoded, checkpointVersion);
  return encoded;
}

/** Adds the optional bundle locator without emitting an empty trailer. */
export function checkpointBundleTrailer(
  key: string,
  handle: string | null,
): Readonly<Record<string, string>> {
  return handle === null ? Object.freeze({}) : Object.freeze({ [key]: handle });
}

/** Restores the opaque bundle handle after scalar trailer validation. */
export function decodeCheckpointBundleHandle(
  message: EncodedCheckpointCommitMessage,
): CheckpointCommitMessage {
  return {
    ...message,
    bundleHandle: message.bundleHandle === null ? null : new BundleHandle(message.bundleHandle),
  };
}

function requireCheckpointBundleBinding(
  message: EncodedCheckpointCommitMessage,
  currentVersion: string,
): void {
  if (message.checkpointVersion === currentVersion && message.bundleHandle === null) {
    throw invalidBinding(`${currentVersion} checkpoint storage requires a bundle handle`);
  }
  if (message.bundleHandle !== null && message.checkpointVersion !== currentVersion) {
    throw invalidBinding('Checkpoint bundle handles require the current storage version');
  }
}

function invalidBinding(message: string): MessageCodecError {
  return new MessageCodecError(message, { code: 'E_MESSAGE_CODEC' });
}
