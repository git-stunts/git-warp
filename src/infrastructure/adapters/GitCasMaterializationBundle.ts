import type {
  BundleMemberInput,
  BundleMemberReference,
  PageHandle,
} from '@git-stunts/git-cas';
import WarpError from '../../domain/errors/WarpError.ts';
import type MaterializationRoot from '../../domain/materialization/MaterializationRoot.ts';
import {
  MATERIALIZATION_ROOT_NAMES,
  type default as MaterializationRoots,
  type MaterializationRootName,
} from '../../domain/materialization/MaterializationRoots.ts';
import BundleHandle from '../../domain/storage/BundleHandle.ts';

const DESCRIPTOR_PATH = 'meta/descriptor';
const MATERIALIZATION_MEMBER_COUNT = MATERIALIZATION_ROOT_NAMES.length + 1;

export type DecodedMaterializationMembers = Readonly<{
  descriptor: PageHandle;
  retainedRoots: ReadonlyMap<MaterializationRootName, BundleHandle>;
}>;

type MaterializationMemberAccumulator = {
  descriptor: PageHandle | null;
  memberCount: number;
  roots: Map<MaterializationRootName, BundleHandle>;
};

export function* materializationMembers(
  descriptorHandle: string,
  roots: MaterializationRoots,
): Generator<[string, BundleMemberInput]> {
  yield [DESCRIPTOR_PATH, descriptorHandle];
  for (const [name, root] of roots.entries()) {
    if (root.status === 'retained') {
      yield [`roots/${name}`, requireRetainedHandle(root, name).toString()];
    }
  }
}

export async function decodeMaterializationMembers(
  members: AsyncIterable<BundleMemberReference>,
): Promise<DecodedMaterializationMembers> {
  const accumulator = createMemberAccumulator();
  for await (const member of members) {
    collectMaterializationMember(accumulator, member);
  }
  return finishMaterializationMembers(accumulator);
}

function createMemberAccumulator(): MaterializationMemberAccumulator {
  return {
    descriptor: null,
    memberCount: 0,
    roots: new Map<MaterializationRootName, BundleHandle>(),
  };
}

function collectMaterializationMember(
  accumulator: MaterializationMemberAccumulator,
  member: BundleMemberReference,
): void {
  accumulator.memberCount += 1;
  if (accumulator.memberCount > MATERIALIZATION_MEMBER_COUNT) {
    throw storageError('materialization bundle has too many members');
  }
  if (member.path === DESCRIPTOR_PATH) {
    collectDescriptorMember(accumulator, member);
    return;
  }
  collectRootMember(accumulator, member);
}

function collectDescriptorMember(
  accumulator: MaterializationMemberAccumulator,
  member: BundleMemberReference,
): void {
  if (accumulator.descriptor !== null) {
    throw storageError('materialization bundle has duplicate descriptor members');
  }
  if (member.handle.kind !== 'page') {
    throw storageError('materialization bundle has no descriptor page');
  }
  accumulator.descriptor = member.handle;
}

function collectRootMember(
  accumulator: MaterializationMemberAccumulator,
  member: BundleMemberReference,
): void {
  const rootName = parseRootName(member.path);
  if (rootName === null) {
    throw storageError(`materialization bundle has an unexpected member: ${member.path}`);
  }
  if (accumulator.roots.has(rootName)) {
    throw storageError(`materialization bundle has duplicate ${rootName} root members`);
  }
  if (member.handle.kind !== 'bundle') {
    throw storageError(`materialization bundle has no ${rootName} root bundle`);
  }
  accumulator.roots.set(rootName, new BundleHandle(member.handle.toString()));
}

function finishMaterializationMembers(
  accumulator: MaterializationMemberAccumulator,
): DecodedMaterializationMembers {
  if (accumulator.descriptor === null) {
    throw storageError('materialization bundle has no descriptor page');
  }
  return Object.freeze({
    descriptor: accumulator.descriptor,
    retainedRoots: new Map(accumulator.roots),
  });
}

function requireRetainedHandle(
  root: MaterializationRoot,
  name: MaterializationRootName,
): BundleHandle {
  if (root.handle === null) {
    throw storageError(`${name} retained root has no bundle handle`);
  }
  return root.handle;
}

function parseRootName(path: string): MaterializationRootName | null {
  const prefix = 'roots/';
  if (!path.startsWith(prefix)) {
    return null;
  }
  const candidate = path.slice(prefix.length);
  return MATERIALIZATION_ROOT_NAMES.find((name) => name === candidate) ?? null;
}

function storageError(message: string): WarpError {
  return new WarpError(`Materialization storage ${message}`, 'E_MATERIALIZATION_STORAGE');
}
