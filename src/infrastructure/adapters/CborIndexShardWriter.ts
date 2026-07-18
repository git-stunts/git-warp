import type { BundleCapability, PageCapability } from '@git-stunts/git-cas';
import type { IndexShard } from '../../domain/artifacts/IndexShard.ts';
import IndexError from '../../domain/errors/IndexError.ts';
import BundleHandle from '../../domain/storage/BundleHandle.ts';
import WarpStream from '../../domain/stream/WarpStream.ts';
import type AssetStoragePort from '../../ports/AssetStoragePort.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type { IndexShardWriteOptions } from '../../ports/IndexStorePort.ts';
import type { CborStructureLimits } from './BoundedCborValidation.ts';
import { IndexShardEncodeTransform } from './IndexShardEncodeTransform.ts';
import {
  optionalCborStructureLimits,
  optionalNonNegativeInteger,
  optionalPositiveInteger,
} from './IndexShardLimitValidation.ts';

type IndexWriteFacade = Readonly<{
  bundles: Pick<BundleCapability, 'putOrdered'>;
  pages: Pick<PageCapability, 'put'>;
}>;

type ValidatedWriteLimits = Readonly<{
  expectedShardCount: number | undefined;
  memberStorage: 'asset' | 'page';
  maxShardBytes: number | undefined;
  maxShardCount: number | undefined;
  staging: IndexShardWriteOptions['staging'];
  structureLimits: CborStructureLimits | undefined;
}>;

export async function writeCborIndexShards(args: {
  shardStream: WarpStream<IndexShard>;
  options: IndexShardWriteOptions;
  codec: CodecPort;
  assets: AssetStoragePort;
  cas: IndexWriteFacade;
}): Promise<BundleHandle> {
  const limits = validatedWriteLimits(args.options);
  requireExpectedShardCountWithinLimit(limits.expectedShardCount, limits.maxShardCount);
  const members = await collectEncodedShardMembers({ ...args, limits });
  requireExpectedShardCount(members.length, limits.expectedShardCount);
  members.sort(([left], [right]) => compareStrings(left, right));
  return await putShardBundle(args.cas, members, limits);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function collectEncodedShardMembers(args: {
  shardStream: WarpStream<IndexShard>;
  codec: CodecPort;
  assets: AssetStoragePort;
  cas: IndexWriteFacade;
  limits: ValidatedWriteLimits;
}): Promise<Array<[string, string]>> {
  const members: Array<[string, string]> = [];
  const encoder = new IndexShardEncodeTransform(args.codec, {
    ...(args.limits.maxShardBytes === undefined
      ? {}
      : { maxBytes: args.limits.maxShardBytes }),
    ...(args.limits.structureLimits === undefined
      ? {}
      : { structureLimits: args.limits.structureLimits }),
  });
  for await (const [path, bytes] of args.shardStream.pipe(encoder)) {
    requireShardCountWithinLimit(members.length + 1, args.limits.maxShardCount);
    requireShardSize(path, bytes.byteLength, args.limits.maxShardBytes);
    members.push([path, await stageEncodedShard(path, bytes, args)]);
  }
  return members;
}

async function stageEncodedShard(
  path: string,
  bytes: Uint8Array,
  args: {
    assets: AssetStoragePort;
    cas: IndexWriteFacade;
    limits: ValidatedWriteLimits;
  },
): Promise<string> {
  if (args.limits.memberStorage === 'page') {
    const maxBytes = requirePageShardLimit(args.limits.maxShardBytes);
    return args.limits.staging === undefined
      ? (await args.cas.pages.put({ source: bytes, maxBytes })).handle.toString()
      : await args.limits.staging.stagePage(bytes, { maxBytes });
  }
  const staged = await args.assets.stage(WarpStream.from([bytes]), {
    slug: `index-shard-${path}`,
    filename: path,
    expectedSize: bytes.byteLength,
  });
  return staged.handle.toString();
}

async function putShardBundle(
  cas: IndexWriteFacade,
  members: Array<[string, string]>,
  limits: ValidatedWriteLimits,
): Promise<BundleHandle> {
  if (limits.staging !== undefined) {
    return await limits.staging.stageOrderedBundle(
      members,
      limits.maxShardCount === undefined ? {} : { maxMembers: limits.maxShardCount },
    );
  }
  const bundle = await cas.bundles.putOrdered({
    members,
    ...(limits.maxShardCount === undefined
      ? {}
      : { limits: { maxMembers: limits.maxShardCount } }),
  });
  return new BundleHandle(bundle.handle.toString());
}

function validatedWriteLimits(options: IndexShardWriteOptions): ValidatedWriteLimits {
  const limits = Object.freeze({
    expectedShardCount: optionalNonNegativeInteger(
      options.expectedShardCount,
      'expectedShardCount',
    ),
    memberStorage: validatedMemberStorage(options.memberStorage),
    maxShardCount: optionalNonNegativeInteger(options.maxShardCount, 'maxShardCount'),
    maxShardBytes: optionalPositiveInteger(options.maxShardBytes, 'maxShardBytes'),
    staging: validatedStaging(options.staging),
    structureLimits: optionalCborStructureLimits(options),
  });
  if (limits.memberStorage === 'page') {
    requirePageShardLimit(limits.maxShardBytes);
  }
  return limits;
}

function validatedStaging(
  value: IndexShardWriteOptions['staging'],
): IndexShardWriteOptions['staging'] {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value.stagePage !== 'function' || typeof value.stageOrderedBundle !== 'function') {
    throw new IndexError('Index shard staging must provide page and bundle operations', {
      code: 'E_INDEX_INVALID_STORAGE',
    });
  }
  return value;
}

function validatedMemberStorage(value: IndexShardWriteOptions['memberStorage']): 'asset' | 'page' {
  if (value === undefined || value === 'asset') {
    return 'asset';
  }
  if (value === 'page') {
    return value;
  }
  throw new IndexError('Index shard memberStorage must be asset or page', {
    code: 'E_INDEX_INVALID_STORAGE',
    context: { value },
  });
}

function requirePageShardLimit(value: number | undefined): number {
  if (value === undefined) {
    throw new IndexError('Page-backed index shards require maxShardBytes', {
      code: 'E_INDEX_INVALID_LIMIT',
      context: { name: 'maxShardBytes' },
    });
  }
  return value;
}

function requireShardSize(path: string, actual: number, maximum: number | undefined): void {
  if (maximum !== undefined && actual > maximum) {
    throw new IndexError(`Index shard exceeds the configured maximum: ${path}`, {
      code: 'E_INDEX_SHARD_TOO_LARGE',
      context: { path, actual, maximum },
    });
  }
}

function requireExpectedShardCountWithinLimit(
  expected: number | undefined,
  maximum: number | undefined,
): void {
  if (expected !== undefined) {
    requireShardCountWithinLimit(expected, maximum);
  }
}

function requireShardCountWithinLimit(actual: number, maximum: number | undefined): void {
  if (maximum !== undefined && actual > maximum) {
    throw shardCountError(actual, maximum, 'exceeds the configured maximum');
  }
}

function requireExpectedShardCount(actual: number, expected: number | undefined): void {
  if (expected !== undefined && actual !== expected) {
    throw shardCountError(actual, expected, 'does not match the expected count');
  }
}

function shardCountError(actual: number, maximum: number, reason: string): IndexError {
  return new IndexError(`Index shard count ${reason}`, {
    code: 'E_INDEX_SHARD_COUNT_LIMIT',
    context: { actual, maximum },
  });
}
