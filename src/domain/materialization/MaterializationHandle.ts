import WarpError from '../errors/WarpError.ts';
import BundleHandle from '../storage/BundleHandle.ts';
import StorageRetentionWitness from '../storage/StorageRetentionWitness.ts';
import MaterializationCoordinate from './MaterializationCoordinate.ts';
import MaterializationRoots from './MaterializationRoots.ts';

/** Retained immutable locator and causal identity for one materialization. */
export default class MaterializationHandle {
  readonly laneName: string;
  readonly bundle: BundleHandle;
  readonly coordinate: MaterializationCoordinate;
  readonly roots: MaterializationRoots;
  readonly stateHash: string;
  readonly retention: StorageRetentionWitness;

  constructor(options: {
    readonly laneName: string;
    readonly bundle: BundleHandle;
    readonly coordinate: MaterializationCoordinate;
    readonly roots: MaterializationRoots;
    readonly stateHash: string;
    readonly retention: StorageRetentionWitness;
  }) {
    requireOptions(options);
    this.laneName = requireNonEmpty(options.laneName, 'laneName');
    this.bundle = requireInstance(options.bundle, BundleHandle, 'bundle');
    this.coordinate = requireInstance(
      options.coordinate,
      MaterializationCoordinate,
      'coordinate',
    );
    this.roots = requireInstance(options.roots, MaterializationRoots, 'roots');
    this.stateHash = requireNonEmpty(options.stateHash, 'stateHash');
    this.retention = requireInstance(
      options.retention,
      StorageRetentionWitness,
      'retention',
    );
    if (!this.retention.handle.equals(this.bundle)) {
      throw handleError('retention witness does not retain the materialization bundle');
    }
    Object.freeze(this);
  }
}

type RuntimeClass<T> = abstract new (...args: never[]) => T;

function requireInstance<T>(value: T, runtimeClass: RuntimeClass<T>, field: string): T {
  if (!(value instanceof runtimeClass)) {
    throw handleError(`${field} has an invalid runtime identity`);
  }
  return value;
}

function requireNonEmpty(value: string, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw handleError(`${field} must be a non-empty string`);
  }
  return value;
}

function requireOptions(options: object): void {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw handleError('options must be an object');
  }
}

function handleError(message: string): WarpError {
  return new WarpError(`Materialization handle ${message}`, 'E_MATERIALIZATION_HANDLE');
}
