import { TrailerCodec, TrailerCodecService } from '@git-stunts/trailer-codec';

const OID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
const codec = new TrailerCodec({ service: new TrailerCodecService() });

export type V17PatchCommitIdentity = Readonly<{
  graph: string;
  writer: string;
}>;

/**
 * Decodes only the retired v17 patch envelope needed by the one-shot graph
 * model migration. Production v19 codecs intentionally do not accept it.
 */
export function decodeV17PatchCommitMessage(message: string): V17PatchCommitIdentity {
  const trailers = codec.decode(message).trailers;
  if (trailers['eg-kind'] !== 'patch') {
    throw new Error("eg-kind must be 'patch'");
  }
  const graph = requireTrailer(trailers, 'eg-graph');
  const writer = requireTrailer(trailers, 'eg-writer');
  requirePositiveInteger(trailers, 'eg-lamport');
  requirePositiveInteger(trailers, 'eg-schema');
  const patchOid = requireTrailer(trailers, 'eg-patch-oid');
  if (!OID_PATTERN.test(patchOid)) {
    throw new Error('eg-patch-oid must be a Git object ID');
  }
  return Object.freeze({ graph, writer });
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
