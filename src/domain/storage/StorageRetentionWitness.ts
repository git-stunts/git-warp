import WarpError from '../errors/WarpError.ts';
import StorageHandle from './StorageHandle.ts';

const CANONICAL_ISO_TIMESTAMP = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

export type StorageRetentionPolicy = 'pinned' | 'evictable';
export type StorageReachability = 'anchored' | 'orphaned' | 'volatile';
export type StorageRetentionRootKind =
  | 'root-set'
  | 'publication'
  | 'cache-set'
  | 'expiring-set';

export type StorageRetentionRootOptions = Readonly<{
  kind: StorageRetentionRootKind;
  namespace: string;
  locator: string;
  generation: string;
  path: string;
}>;

/** Runtime-backed identity of the root retaining one storage handle. */
export class StorageRetentionRoot {
  readonly kind: StorageRetentionRootKind;
  readonly namespace: string;
  /** Opaque provider-owned locator for the retaining root. */
  readonly locator: string;
  readonly generation: string;
  readonly path: string;

  constructor(options: StorageRetentionRootOptions) {
    requireOptions(options);
    requireRootKind(options.kind);
    requireString(options.namespace, 'root.namespace');
    requireString(options.locator, 'root.locator');
    requireString(options.generation, 'root.generation');
    requireString(options.path, 'root.path');
    this.kind = options.kind;
    this.namespace = options.namespace;
    this.locator = options.locator;
    this.generation = options.generation;
    this.path = options.path;
    Object.freeze(this);
  }
}

/** Immutable domain evidence that a storage handle was retained by a concrete root. */
export default class StorageRetentionWitness {
  readonly handle: StorageHandle;
  readonly policy: StorageRetentionPolicy;
  readonly reachability: StorageReachability;
  readonly root: StorageRetentionRoot;
  readonly observedAt: string;

  constructor(options: {
    readonly handle: StorageHandle;
    readonly policy: StorageRetentionPolicy;
    readonly reachability: StorageReachability;
    readonly root: StorageRetentionRoot;
    readonly observedAt: string;
  }) {
    requireOptions(options);
    requireHandle(options.handle);
    requirePolicy(options.policy);
    requireReachability(options.reachability);
    requireRoot(options.root);
    requireTimestamp(options.observedAt);
    this.handle = options.handle;
    this.policy = options.policy;
    this.reachability = options.reachability;
    this.root = options.root;
    this.observedAt = options.observedAt;
    Object.freeze(this);
  }
}

function requireOptions(options: object): void {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw retentionError('options must be an object');
  }
}

function requireHandle(handle: StorageHandle): void {
  if (!(handle instanceof StorageHandle)) {
    throw retentionError('handle must be a StorageHandle');
  }
}

function requirePolicy(policy: StorageRetentionPolicy): void {
  if (policy !== 'pinned' && policy !== 'evictable') {
    throw retentionError('policy is invalid');
  }
}

function requireReachability(reachability: StorageReachability): void {
  if (reachability !== 'anchored' && reachability !== 'orphaned' && reachability !== 'volatile') {
    throw retentionError('reachability is invalid');
  }
}

function requireRoot(root: StorageRetentionRoot): void {
  if (!(root instanceof StorageRetentionRoot)) {
    throw retentionError('root must be a StorageRetentionRoot');
  }
}

function requireRootKind(kind: StorageRetentionRootKind): void {
  if (kind !== 'root-set' && kind !== 'publication' && kind !== 'cache-set' && kind !== 'expiring-set') {
    throw retentionError('root.kind is invalid');
  }
}

function requireTimestamp(value: string): void {
  requireString(value, 'observedAt');
  if (!CANONICAL_ISO_TIMESTAMP.test(value)) {
    throw retentionError('observedAt must be a canonical ISO timestamp');
  }
}

function requireString(value: string, field: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw retentionError(`${field} must be non-empty`);
  }
}

function retentionError(message: string): WarpError {
  return new WarpError(
    `Storage retention witness ${message}`,
    'E_STORAGE_RETENTION_WITNESS',
  );
}
