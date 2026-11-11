import MessageCodecError from '../../domain/errors/MessageCodecError.ts';

/** git-cas resolves the `subManifests` of a decoded manifest only when its `version` is this value. */
const MERKLE_ROOT_VERSION = 2;

/** git-cas 7.2.0 `ManifestSchema` admits at most this many `subManifests` references. */
const MAX_SUB_MANIFEST_REFERENCES = 10_000;

/**
 * The most chunks one sub-manifest reference may declare: git-cas's default `merkleThreshold`, which
 * git-warp does not change. git-cas writes groups of exactly this many chunks, and a smaller last group.
 */
const MAX_SUB_MANIFEST_CHUNKS = 1_000;

/** git-cas `ManifestSchema` accepts only lowercase 40- or 64-character hex object ids. */
const GIT_OBJECT_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;

const MALFORMED_REFERENCE = 'a sub-manifest reference is malformed';

/**
 * Checks the `subManifests` references of a decoded git-cas Merkle root manifest before git-cas reads
 * any sub-manifest.
 *
 * git-cas reads and merges every referenced sub-manifest before its schema runs. This guard admits a
 * root manifest only when its references are at most {@link MAX_SUB_MANIFEST_REFERENCES}, each has a
 * distinct object id and declares 1 to {@link MAX_SUB_MANIFEST_CHUNKS} chunks, their ranges cover the
 * chunks contiguously from index zero. Together these bound a root manifest at 10,000 references of
 * at most 1,000 chunks each, git-cas's reference limit times its write threshold, with no repeated
 * sub-manifest. Other
 * decoded values (flat manifests, sub-manifests, bundle descriptors, trust records) have no
 * `subManifests` that git-cas resolves and pass unchanged.
 */
export default class GitCasManifestShapeGuard {
  constructor() {
    Object.freeze(this);
  }

  /** Throws `E_CAS_MANIFEST_SHAPE` when `decoded` is a Merkle root manifest outside the limits. */
  check(decoded: unknown): void {
    const references = merkleRootReferences(decoded);
    if (references === undefined || references === null) {
      return;
    }
    if (!Array.isArray(references)) {
      throw manifestShapeError('sub-manifest references are not an array');
    }
    if (references.length > MAX_SUB_MANIFEST_REFERENCES) {
      throw manifestShapeError('sub-manifest reference count exceeds the maximum');
    }
    checkReferences(references);
  }
}

/** A sub-manifest reference whose fields have the types and ranges git-cas's schema requires. */
type SubManifestReference = { readonly oid: string; readonly chunkCount: number; readonly startIndex: number };

/** The `subManifests` value git-cas would resolve from `decoded`, or `undefined` when it resolves none. */
function merkleRootReferences(decoded: unknown): unknown {
  if (typeof decoded !== 'object' || decoded === null) {
    return undefined;
  }
  return Reflect.get(decoded, 'version') === MERKLE_ROOT_VERSION ? Reflect.get(decoded, 'subManifests') : undefined;
}

function checkReferences(references: readonly unknown[]): void {
  const objectIds = new Set<string>();
  let nextIndex = 0;
  for (const value of references) {
    const reference = readReference(value);
    checkRange(reference, nextIndex);
    if (objectIds.has(reference.oid)) {
      throw manifestShapeError('a sub-manifest reference repeats an object id');
    }
    objectIds.add(reference.oid);
    nextIndex += reference.chunkCount;
  }
}

function readReference(value: unknown): SubManifestReference {
  const fields = requireMap(value);
  const oid: unknown = Reflect.get(fields, 'oid');
  const chunkCount: unknown = Reflect.get(fields, 'chunkCount');
  const startIndex: unknown = Reflect.get(fields, 'startIndex');
  if (!isObjectId(oid) || !isChunkCount(chunkCount) || !isStartIndex(startIndex)) {
    throw manifestShapeError(MALFORMED_REFERENCE);
  }
  return { oid, chunkCount, startIndex };
}

function requireMap(value: unknown): object {
  if (typeof value !== 'object' || value === null) {
    throw manifestShapeError(MALFORMED_REFERENCE);
  }
  return value;
}

function checkRange(reference: SubManifestReference, nextIndex: number): void {
  if (reference.chunkCount > MAX_SUB_MANIFEST_CHUNKS) {
    throw manifestShapeError('a sub-manifest reference declares more chunks than the maximum');
  }
  if (reference.startIndex !== nextIndex) {
    throw manifestShapeError('sub-manifest references do not cover the chunks contiguously from zero');
  }
}

function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && GIT_OBJECT_ID.test(value);
}

function isChunkCount(value: unknown): value is number {
  return isStartIndex(value) && value >= 1;
}

function isStartIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function manifestShapeError(reason: string): MessageCodecError {
  return new MessageCodecError(`git-cas manifest rejected: ${reason}`, {
    code: 'E_CAS_MANIFEST_SHAPE',
    context: { reason },
  });
}
