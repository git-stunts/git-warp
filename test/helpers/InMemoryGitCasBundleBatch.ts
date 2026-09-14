import {
  CasError,
  type BundleCapability,
  type BundleLimits,
} from '@git-stunts/git-cas';

const BUNDLE_LIMITS: Readonly<BundleLimits> = Object.freeze({
  maxMembers: 100_000,
  maxMemberPathBytes: 4_096,
  maxDescriptorBytes: 16_777_216,
  maxFanoutEntries: 1_024,
  maxFanoutDepth: 16,
});
const DEFAULT_BATCH_BUNDLES = 64;
const DEFAULT_BATCH_MEMBERS = 8_192;
const DEFAULT_BATCH_OBJECTS = 256;
const DEFAULT_BATCH_BYTES = 64 * 1024 * 1024;
const MAX_BATCH_BUNDLES = 256;
const MAX_BATCH_MEMBERS = 100_000;
const CONSERVATIVE_OID = '0'.repeat(64);
const BUNDLE_TREE_LINE = `100644 blob ${CONSERVATIVE_OID}\tbundle.members`;

type BundleMembers = Parameters<BundleCapability['putOrdered']>[0]['members'];
type BundleLimitOverrides = Parameters<BundleCapability['putOrdered']>[0]['limits'];
type BundleBatchRequest = Parameters<BundleCapability['putOrderedBatch']>[0];

type BundleBatchBounds = Readonly<{
  maxBatchBundles: number;
  maxBatchMembers: number;
  maxBatchObjects: number;
  maxBatchBytes: number;
}>;

export type InMemoryBundlePlan = Readonly<{
  descriptor: string;
  descriptorBytes: number;
  indexDepth: number;
  limits: Readonly<BundleLimits>;
  members: readonly [string, string][];
  objectCount: number;
  writeBytes: number;
}>;

/** Collects one repeatable bundle plan without performing storage writes. */
export async function planInMemoryBundle(
  members: BundleMembers,
  overrides?: BundleLimitOverrides,
): Promise<InMemoryBundlePlan> {
  const limits = lowerBundleLimits(overrides);
  const lines: string[] = [];
  const recordedMembers: Array<[string, string]> = [];
  for await (const [path, member] of members) {
    requireBundlePath(path, limits.maxMemberPathBytes);
    requireBundleMemberCount(recordedMembers.length + 1, limits.maxMembers);
    const token = String(member);
    lines.push(`${path}\0${token}`);
    recordedMembers.push([path, token]);
  }
  const descriptor = lines.join('\n');
  const shape = bundleShape(recordedMembers.length, limits.maxFanoutEntries);
  const descriptorBytes = utf8ByteLength(descriptor);
  requireDescriptorBytes(descriptorBytes, limits.maxDescriptorBytes);
  requireFanoutDepth(shape.indexDepth, limits.maxFanoutDepth);
  return Object.freeze({
    descriptor,
    descriptorBytes,
    indexDepth: 1,
    limits,
    members: Object.freeze(recordedMembers),
    objectCount: shape.objectCount,
    writeBytes: descriptorBytes + utf8ByteLength(BUNDLE_TREE_LINE),
  });
}

/** Fully admits a bounded group before the caller performs its first write. */
export async function planInMemoryBundleBatch(
  request: BundleBatchRequest,
): Promise<readonly InMemoryBundlePlan[]> {
  const bounds = bundleBatchBounds(request);
  requireBundleCount(request.bundles.length, bounds.maxBatchBundles);
  const plans: InMemoryBundlePlan[] = [];
  let aggregateMembers = 0;
  for (const bundle of request.bundles) {
    const plan = await planInMemoryBundle(bundle.members, bundle.limits);
    aggregateMembers += plan.members.length;
    requireBatchMemberCount(aggregateMembers, bounds.maxBatchMembers);
    plans.push(plan);
  }
  requireBatchObjectCount(
    plans.reduce((total, plan) => total + plan.objectCount, 0),
    bounds.maxBatchObjects,
  );
  requireBatchWriteBytes(
    plans.reduce((total, plan) => total + plan.writeBytes, 0),
    bounds.maxBatchBytes,
  );
  return Object.freeze(plans);
}

function bundleBatchBounds(request: BundleBatchRequest): BundleBatchBounds {
  return Object.freeze({
    maxBatchBundles: requireBatchLimit({
      label: 'bundle count',
      value: request.maxBatchBundles ?? DEFAULT_BATCH_BUNDLES,
      maximum: MAX_BATCH_BUNDLES,
    }),
    maxBatchMembers: requireBatchLimit({
      label: 'member count',
      value: request.maxBatchMembers ?? DEFAULT_BATCH_MEMBERS,
      maximum: MAX_BATCH_MEMBERS,
    }),
    maxBatchObjects: requireBatchLimit({
      label: 'object count',
      value: request.maxBatchObjects ?? DEFAULT_BATCH_OBJECTS,
      maximum: DEFAULT_BATCH_OBJECTS,
    }),
    maxBatchBytes: requireBatchLimit({
      label: 'byte count',
      value: request.maxBatchBytes ?? DEFAULT_BATCH_BYTES,
      maximum: DEFAULT_BATCH_BYTES,
    }),
  });
}

function requireBatchLimit(options: Readonly<{
  label: string;
  value: number;
  maximum: number;
}>): number {
  if (!Number.isSafeInteger(options.value) || options.value < 1 || options.value > options.maximum) {
    throw new CasError(
      `Bundle batch ${options.label} must be a positive safe integer within its supported maximum`,
      'INVALID_OPTIONS',
      options,
    );
  }
  return options.value;
}

function lowerBundleLimits(overrides: BundleLimitOverrides): Readonly<BundleLimits> {
  return Object.freeze({
    maxMembers: lowerBundleLimit({
      field: 'maxMembers',
      value: overrides?.maxMembers ?? BUNDLE_LIMITS.maxMembers,
      minimum: 0,
      configured: BUNDLE_LIMITS.maxMembers,
    }),
    maxMemberPathBytes: lowerBundleLimit({
      field: 'maxMemberPathBytes',
      value: overrides?.maxMemberPathBytes ?? BUNDLE_LIMITS.maxMemberPathBytes,
      minimum: 1,
      configured: BUNDLE_LIMITS.maxMemberPathBytes,
    }),
    maxDescriptorBytes: lowerBundleLimit({
      field: 'maxDescriptorBytes',
      value: overrides?.maxDescriptorBytes ?? BUNDLE_LIMITS.maxDescriptorBytes,
      minimum: 1,
      configured: BUNDLE_LIMITS.maxDescriptorBytes,
    }),
    maxFanoutEntries: lowerBundleLimit({
      field: 'maxFanoutEntries',
      value: overrides?.maxFanoutEntries ?? BUNDLE_LIMITS.maxFanoutEntries,
      minimum: 3,
      configured: BUNDLE_LIMITS.maxFanoutEntries,
    }),
    maxFanoutDepth: lowerBundleLimit({
      field: 'maxFanoutDepth',
      value: overrides?.maxFanoutDepth ?? BUNDLE_LIMITS.maxFanoutDepth,
      minimum: 1,
      configured: BUNDLE_LIMITS.maxFanoutDepth,
    }),
  });
}

function lowerBundleLimit(options: Readonly<{
  field: keyof BundleLimits;
  value: number;
  minimum: number;
  configured: number;
}>): number {
  if (
    !Number.isSafeInteger(options.value)
    || options.value < options.minimum
    || options.value > options.configured
  ) {
    throw new CasError('Bundle limit is outside its supported range', 'BUNDLE_LIMIT_INVALID', {
      field: options.field,
      value: options.value,
      min: options.minimum,
      max: options.configured,
    });
  }
  return options.value;
}

function requireBundleMemberCount(observedMembers: number, maxMembers: number): void {
  if (observedMembers > maxMembers) {
    throw new CasError('Bundle exceeds its member limit', 'BUNDLE_MEMBER_LIMIT', {
      observedMembers,
      maxMembers,
    });
  }
}

function requireBundlePath(path: string, maxMemberPathBytes: number): void {
  const pathBytes = utf8ByteLength(path);
  if (pathBytes > maxMemberPathBytes) {
    throw new CasError('Bundle member path exceeds its byte limit', 'BUNDLE_PATH_LIMIT', {
      path,
      pathBytes,
      maxMemberPathBytes,
    });
  }
}

function requireDescriptorBytes(descriptorBytes: number, maxDescriptorBytes: number): void {
  if (descriptorBytes > maxDescriptorBytes) {
    throw new CasError(
      'Bundle descriptors exceed their configured byte limit',
      'BUNDLE_DESCRIPTOR_LIMIT',
      { descriptorBytes, maxDescriptorBytes },
    );
  }
}

function requireFanoutDepth(attemptedDepth: number, maxFanoutDepth: number): void {
  if (attemptedDepth > maxFanoutDepth) {
    throw new CasError('Bundle fanout exceeds its configured depth', 'BUNDLE_FANOUT_LIMIT', {
      attemptedDepth,
      maxFanoutDepth,
    });
  }
}

function requireBundleCount(observedBundles: number, maxBatchBundles: number): void {
  if (observedBundles > maxBatchBundles) {
    throw new CasError('Bundle batch exceeds its configured bundle limit', 'INVALID_OPTIONS', {
      observedBundles,
      maxBatchBundles,
    });
  }
}

function requireBatchMemberCount(observedMembers: number, maxBatchMembers: number): void {
  if (observedMembers > maxBatchMembers) {
    throw new CasError('Bundle batch exceeds its member limit', 'BUNDLE_MEMBER_LIMIT', {
      observedMembers,
      maxBatchMembers,
    });
  }
}

function requireBatchObjectCount(observedObjects: number, maxBatchObjects: number): void {
  if (observedObjects > maxBatchObjects) {
    throw new CasError('Bundle batch exceeds its configured object limit', 'INVALID_OPTIONS', {
      observedObjects,
      maxBatchObjects,
    });
  }
}

function requireBatchWriteBytes(observed: number, maximum: number): void {
  if (observed > maximum) {
    throw new CasError('Bundle batch exceeds its configured bytes limit', 'INVALID_OPTIONS', {
      kind: 'bytes',
      observed,
      maximum,
    });
  }
}

function bundleShape(
  memberCount: number,
  maxFanoutEntries: number,
): Readonly<{ indexDepth: number; objectCount: number }> {
  const payload = maxFanoutEntries - 1;
  let level = memberCount === 0 ? 1 : Math.ceil(memberCount / payload);
  let descriptorCount = level + 1;
  let indexDepth = 1;
  while (level > 1) {
    level = Math.ceil(level / payload);
    descriptorCount += level;
    indexDepth += 1;
  }
  return Object.freeze({ indexDepth, objectCount: descriptorCount * 2 });
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
