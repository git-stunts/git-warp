import MaterializationCoordinate from '../../domain/materialization/MaterializationCoordinate.ts';
import MaterializationRoot, {
  type MaterializationRootStatus,
} from '../../domain/materialization/MaterializationRoot.ts';
import MaterializationRoots, {
  MATERIALIZATION_ROOT_NAMES,
  type MaterializationRootName,
} from '../../domain/materialization/MaterializationRoots.ts';
import type BundleHandle from '../../domain/storage/BundleHandle.ts';
import WarpError from '../../domain/errors/WarpError.ts';

export const MATERIALIZATION_DESCRIPTOR_SCHEMA_VERSION = 2;

export type DecodedMaterializationDescriptor = Readonly<{
  coordinate: MaterializationCoordinate;
  stateHash: string;
  laneName: string;
  rootStatuses: ReadonlyMap<MaterializationRootName, MaterializationRootStatus>;
}>;

export function materializationDescriptorData(input: {
  coordinate: MaterializationCoordinate;
  stateHash: string;
  laneName: string;
  roots: MaterializationRoots;
}): object {
  return {
    schemaVersion: MATERIALIZATION_DESCRIPTOR_SCHEMA_VERSION,
    laneName: input.laneName,
    stateHash: input.stateHash,
    coordinate: materializationCoordinateData(input.coordinate),
    roots: input.roots.entries().map(([name, root]) => [name, root.status]),
  };
}

export function materializationCoordinateData(
  coordinate: MaterializationCoordinate,
): object {
  return {
    ceiling: coordinate.ceiling,
    frontier: coordinate.frontierEntries.map((entry) => [entry.writerId, entry.patchSha]),
  };
}

export function decodeMaterializationDescriptor(
  value: unknown,
): DecodedMaterializationDescriptor {
  requireRecord(value, 'descriptor');
  if (value['schemaVersion'] !== MATERIALIZATION_DESCRIPTOR_SCHEMA_VERSION) {
    throw descriptorError('materialization descriptor schema is unsupported');
  }
  const coordinateValue = value['coordinate'];
  requireRecord(coordinateValue, 'descriptor.coordinate');
  return Object.freeze({
    laneName: requireNonEmpty(value['laneName'], 'descriptor.laneName'),
    stateHash: requireNonEmpty(value['stateHash'], 'descriptor.stateHash'),
    rootStatuses: decodeRootStatuses(value['roots']),
    coordinate: new MaterializationCoordinate({
      frontier: decodeFrontier(coordinateValue['frontier']),
      ceiling: requireCeiling(coordinateValue['ceiling']),
    }),
  });
}

export function materializationRootsFromDescriptor(
  descriptor: DecodedMaterializationDescriptor,
  retainedRoots: ReadonlyMap<MaterializationRootName, BundleHandle>,
): MaterializationRoots {
  const statuses = descriptor.rootStatuses;
  return new MaterializationRoots({
    adjacency: rootFromMaps(statuses, retainedRoots, 'adjacency'),
    edgeAlive: rootFromMaps(statuses, retainedRoots, 'edge-alive'),
    edgeBirths: rootFromMaps(statuses, retainedRoots, 'edge-births'),
    frontier: rootFromMaps(statuses, retainedRoots, 'frontier'),
    nodeAlive: rootFromMaps(statuses, retainedRoots, 'node-alive'),
    properties: rootFromMaps(statuses, retainedRoots, 'properties'),
    provenanceSupport: rootFromMaps(statuses, retainedRoots, 'provenance-support'),
    roaringIndexes: rootFromMaps(statuses, retainedRoots, 'roaring-indexes'),
  });
}

function decodeFrontier(value: unknown): Map<string, string> {
  if (!Array.isArray(value)) {
    throw descriptorError('descriptor.coordinate.frontier must be an array');
  }
  const frontier = new Map<string, string>();
  for (const entry of value) {
    const [writerId, patchSha] = decodeFrontierEntry(entry);
    if (frontier.has(writerId)) {
      throw descriptorError('descriptor coordinate contains a duplicate frontier writer');
    }
    frontier.set(writerId, patchSha);
  }
  return frontier;
}

function decodeFrontierEntry(value: unknown): readonly [string, string] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw descriptorError('descriptor coordinate contains an invalid frontier entry');
  }
  return Object.freeze([
    requireNonEmpty(arrayValue(value, 0), 'descriptor frontier writerId'),
    requireNonEmpty(arrayValue(value, 1), 'descriptor frontier patchSha'),
  ]);
}

function decodeRootStatuses(
  value: unknown,
): ReadonlyMap<MaterializationRootName, MaterializationRootStatus> {
  if (!Array.isArray(value)) {
    throw descriptorError('descriptor.roots must be an array');
  }
  const statuses = new Map<MaterializationRootName, MaterializationRootStatus>();
  for (const entry of value) {
    const [name, status] = decodeRootStatusEntry(entry);
    if (statuses.has(name)) {
      throw descriptorError(`descriptor has duplicate ${name} root status`);
    }
    statuses.set(name, status);
  }
  for (const name of MATERIALIZATION_ROOT_NAMES) {
    requireRootStatus(statuses, name);
  }
  return statuses;
}

function decodeRootStatusEntry(
  value: unknown,
): readonly [MaterializationRootName, MaterializationRootStatus] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw descriptorError('descriptor contains an invalid root status entry');
  }
  const name = decodeRootStatusName(arrayValue(value, 0));
  return Object.freeze([name, decodeRootStatus(arrayValue(value, 1), name)]);
}

function decodeRootStatusName(value: unknown): MaterializationRootName {
  if (typeof value !== 'string') {
    throw descriptorError('descriptor contains an unknown root status name');
  }
  const name = MATERIALIZATION_ROOT_NAMES.find((candidate) => candidate === value);
  if (name === undefined) {
    throw descriptorError('descriptor contains an unknown root status name');
  }
  return name;
}

function decodeRootStatus(
  value: unknown,
  name: MaterializationRootName,
): MaterializationRootStatus {
  if (value !== 'retained' && value !== 'empty' && value !== 'unavailable') {
    throw descriptorError(`descriptor contains an invalid ${name} root status`);
  }
  return value;
}

function rootFromMaps(
  statuses: ReadonlyMap<MaterializationRootName, MaterializationRootStatus>,
  roots: ReadonlyMap<MaterializationRootName, BundleHandle>,
  name: MaterializationRootName,
): MaterializationRoot {
  const status = requireRootStatus(statuses, name);
  const retained = roots.get(name);
  if (status === 'retained') {
    if (retained === undefined) {
      throw descriptorError(`materialization bundle has no ${name} root bundle`);
    }
    return MaterializationRoot.retained(retained);
  }
  if (retained !== undefined) {
    throw descriptorError(`materialization bundle has an unexpected ${name} root bundle`);
  }
  return status === 'empty'
    ? MaterializationRoot.empty()
    : MaterializationRoot.unavailable();
}

function requireRootStatus(
  statuses: ReadonlyMap<MaterializationRootName, MaterializationRootStatus>,
  name: MaterializationRootName,
): MaterializationRootStatus {
  const status = statuses.get(name);
  if (status === undefined) {
    throw descriptorError(`descriptor has no ${name} root status`);
  }
  return status;
}

function requireCeiling(value: unknown): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw descriptorError('descriptor coordinate ceiling is invalid');
  }
  return value;
}

function requireRecord(
  value: unknown,
  field: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw descriptorError(`${field} must be an object`);
  }
}

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw descriptorError(`${field} must be a non-empty string`);
  }
  return value;
}

function arrayValue(values: readonly unknown[], index: number): unknown {
  return values[index];
}

function descriptorError(message: string): WarpError {
  return new WarpError(`Materialization storage ${message}`, 'E_MATERIALIZATION_STORAGE');
}
