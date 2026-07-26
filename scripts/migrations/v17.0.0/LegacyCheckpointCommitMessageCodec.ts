import { TrailerCodec, TrailerCodecService } from '@git-stunts/trailer-codec';
import BundleHandle from '../../../src/domain/storage/BundleHandle.ts';
import type { CheckpointCommitMessage } from '../../../src/ports/CommitMessageCodecPort.ts';
import { LEGACY_CHECKPOINT_STORAGE_FORMAT } from './LegacyCheckpointFormat.ts';

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const codec = new TrailerCodec({ service: new TrailerCodecService() });

/** Decodes checkpoint envelopes needed only by the retired v17 migration. */
export function decodeCheckpointMigrationMessage(
  message: string,
): CheckpointCommitMessage {
  const trailers = codec.decode(message).trailers;
  if (trailers['eg-kind'] !== 'checkpoint') {
    throw new Error("eg-kind must be 'checkpoint'");
  }
  const stateHash = requireTrailer(trailers, 'eg-state-hash');
  if (!SHA256_PATTERN.test(stateHash)) {
    throw new Error('eg-state-hash must be a SHA-256 value');
  }
  const bundleToken = trailers['eg-checkpoint-handle'];
  return {
    kind: 'checkpoint',
    graph: requireTrailer(trailers, 'eg-graph'),
    stateHash,
    schema: requirePositiveInteger(trailers, 'eg-schema'),
    checkpointVersion: trailers['eg-checkpoint'] ?? null,
    bundleHandle: bundleToken === undefined ? null : new BundleHandle(bundleToken),
  };
}

/** Produces an authentic legacy checkpoint envelope for migration tests. */
export function encodeLegacyCheckpointMessage(options: Readonly<{
  graph: string;
  schema: number;
  stateHash: string;
}>): string {
  return codec.encode({
    title: 'warp:checkpoint',
    trailers: {
      'eg-kind': 'checkpoint',
      'eg-graph': options.graph,
      'eg-state-hash': options.stateHash,
      'eg-schema': String(options.schema),
      'eg-checkpoint': LEGACY_CHECKPOINT_STORAGE_FORMAT,
    },
  });
}

function requireTrailer(trailers: Record<string, string>, key: string): string {
  const value = trailers[key];
  if (value === undefined || value.length === 0) {
    throw new Error(`missing required trailer ${key}`);
  }
  return value;
}

function requirePositiveInteger(
  trailers: Record<string, string>,
  key: string,
): number {
  const value = requireTrailer(trailers, key);
  if (!/^[1-9][0-9]*$/u.test(value)) {
    throw new Error(`${key} must be a positive integer`);
  }
  return Number(value);
}
