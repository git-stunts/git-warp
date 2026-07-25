import MaterializationCoordinate from '../../domain/materialization/MaterializationCoordinate.ts';
import MaterializationRoots from '../../domain/materialization/MaterializationRoots.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import type { RetainMaterializationRequest } from '../../ports/MaterializationStorePort.ts';

export function requireRetainRequest(request: RetainMaterializationRequest): void {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    throw storageError('retain request must be an object');
  }
  requireCoordinate(request.coordinate);
  requireRetainRoots(request);
  requireRetainStateHash(request);
}

function requireRetainRoots(request: RetainMaterializationRequest): void {
  const { roots } = request;
  if (!(roots instanceof MaterializationRoots)) {
    throw storageError('retain request roots have an invalid runtime identity');
  }
  if (
    request.replayBasis === undefined
    && roots.entries().every(([, root]) => root.status === 'unavailable')
  ) {
    throw storageError('retain request must provide at least one materialization root');
  }
}

function requireRetainStateHash(request: RetainMaterializationRequest): void {
  if (request.stateHash !== null) {
    requireNonEmpty(request.stateHash, 'stateHash');
    requireCompleteReplayBasis(request);
    return;
  }
  if (request.replayBasis !== undefined || request.roots.replayBasis.status === 'retained') {
    throw storageError('partial materialization cannot retain a whole-state replay basis');
  }
}

function requireCompleteReplayBasis(request: RetainMaterializationRequest): void {
  if (
    request.replayBasis === undefined
    && request.roots.replayBasis.status !== 'retained'
  ) {
    throw storageError('complete materialization requires a whole-state replay basis');
  }
}

export function requireCoordinate(coordinate: MaterializationCoordinate): void {
  if (!(coordinate instanceof MaterializationCoordinate)) {
    throw storageError('coordinate has an invalid runtime identity');
  }
}

export function requireDependency(value: object, field: string): void {
  if (value === null || typeof value !== 'object') {
    throw storageError(`${field} dependency is required`);
  }
}

export function requireAdapterOptions(options: object): void {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw storageError('adapter options must be an object');
  }
}

export function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw storageError(`${field} must be a non-empty string`);
  }
  return value;
}

export function storageError(message: string): WarpError {
  return new WarpError(`Materialization storage ${message}`, 'E_MATERIALIZATION_STORAGE');
}
