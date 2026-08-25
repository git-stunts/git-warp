import {
  BundleHandle,
  type BundleMemberReference,
} from '@git-stunts/git-cas';
import TrieStoreError from '../../domain/errors/TrieStoreError.ts';
import type { TrieBranchEntries } from '../../domain/orset/trie/TrieBranchEntries.ts';
import type TrieStorePort from '../../domain/orset/trie/TrieStorePort.ts';
import type ArtifactStagingPort from '../../ports/ArtifactStagingPort.ts';
import {
  tryWriteBranchWave,
  tryWriteLeafWave,
  type GitCasTrieFacade,
} from './GitCasTrieWriteBatcher.ts';
import {
  GIT_CAS_TRIE_LEAF_MAX_BYTES,
  GIT_CAS_TRIE_LEAF_PATH,
} from './GitCasTrieStorageProfile.ts';
import { parseNibbleName } from './trieNibbleName.ts';

export type { GitCasTrieFacade } from './GitCasTrieWriteBatcher.ts';

const BRANCH_PREFIX = 'children/';

const E_TRIE_STORE_READ = 'E_TRIE_STORE_READ';
const E_TRIE_STORE_WRITE = 'E_TRIE_STORE_WRITE';
const E_TRIE_STORE_MISSING = 'E_TRIE_STORE_MISSING';
const E_TRIE_STORE_CORRUPT = 'E_TRIE_STORE_CORRUPT';

const MISSING_CODES = new Set([
  'BUNDLE_NOT_FOUND',
  'HANDLE_TARGET_MISSING',
  'OBJECT_NOT_FOUND',
]);

/** Stores trie leaves and branches as composable git-cas bundle graphs. */
export default class GitCasTrieStoreAdapter implements TrieStorePort {
  readonly #cas: GitCasTrieFacade;

  constructor(options: { readonly cas: GitCasTrieFacade }) {
    if (
      options === null || options === undefined ||
      options.cas === null || options.cas === undefined
    ) {
      throw new TrieStoreError('cas dependency is required', {
        code: E_TRIE_STORE_WRITE,
      });
    }
    this.#cas = options.cas;
  }

  async readLeaf(root: string): Promise<Uint8Array> {
    const bundle = parseReadRoot(root);
    let member: BundleMemberReference | null;
    try {
      member = await this.#cas.bundles.getMemberReference({
        handle: bundle,
        path: GIT_CAS_TRIE_LEAF_PATH,
      });
    } catch (raw) {
      throw readFailure(raw, 'read leaf bundle', root);
    }
    if (member === null) {
      throw missingRoot('leaf', root);
    }
    if (member.handle.kind !== 'page') {
      throw corruptRoot('leaf member is not a git-cas page', root);
    }
    try {
      return await this.#cas.pages.get({
        handle: member.handle,
        maxBytes: GIT_CAS_TRIE_LEAF_MAX_BYTES,
      });
    } catch (raw) {
      throw readFailure(raw, 'read leaf page', root);
    }
  }

  async readBranch(root: string): Promise<TrieBranchEntries> {
    const bundle = parseReadRoot(root);
    const entries = new Map<number, string>();
    try {
      for await (const member of this.#cas.bundles.iterateMemberReferences({ handle: bundle })) {
        collectBranchMember(entries, member, root);
      }
    } catch (raw) {
      if (raw instanceof TrieStoreError) {
        throw raw;
      }
      throw readFailure(raw, 'read branch bundle', root);
    }
    return entries;
  }

  async writeLeaf(data: Uint8Array, staging?: ArtifactStagingPort): Promise<string> {
    try {
      const pageHandle = staging === undefined
        ? (await this.#cas.pages.put({
          source: data,
          maxBytes: GIT_CAS_TRIE_LEAF_MAX_BYTES,
        })).handle.toString()
        : await staging.stagePage(data, { maxBytes: GIT_CAS_TRIE_LEAF_MAX_BYTES });
      if (staging !== undefined) {
        return (await staging.stageOrderedBundle([
          [GIT_CAS_TRIE_LEAF_PATH, pageHandle],
        ])).toString();
      }
      const bundle = await this.#cas.bundles.putOrdered({
        members: [[GIT_CAS_TRIE_LEAF_PATH, pageHandle]],
      });
      return bundle.handle.toString();
    } catch (raw) {
      throw writeFailure(raw, 'write leaf');
    }
  }

  async writeLeaves(
    leaves: readonly Uint8Array[],
    staging?: ArtifactStagingPort,
  ): Promise<readonly string[]> {
    if (leaves.length === 0) { return Object.freeze([]); }
    try {
      const batched = await tryWriteLeafWave(leaves, this.#cas, staging);
      if (batched !== null) { return batched; }
      return await this.#writeLeavesIndividually(leaves, staging);
    } catch (raw) {
      throw writeFailure(raw, 'write leaf wave');
    }
  }

  async writeBranch(
    children: TrieBranchEntries,
    staging?: ArtifactStagingPort,
  ): Promise<string> {
    const members = branchMembers(children);
    try {
      if (staging !== undefined) {
        return (await staging.stageOrderedBundle(members)).toString();
      }
      const bundle = await this.#cas.bundles.putOrdered({ members });
      return bundle.handle.toString();
    } catch (raw) {
      throw writeFailure(raw, 'write branch');
    }
  }

  async writeBranches(
    branches: readonly TrieBranchEntries[],
    staging?: ArtifactStagingPort,
  ): Promise<readonly string[]> {
    if (branches.length === 0) { return Object.freeze([]); }
    try {
      const groups = branches.map(branchMembers);
      const batched = await tryWriteBranchWave(groups, this.#cas, staging);
      if (batched !== null) { return batched; }
      return await this.#writeBranchesIndividually(branches, staging);
    } catch (raw) {
      throw writeFailure(raw, 'write branch wave');
    }
  }

  async #writeLeavesIndividually(
    leaves: readonly Uint8Array[],
    staging?: ArtifactStagingPort,
  ): Promise<readonly string[]> {
    const roots: string[] = [];
    for (const leaf of leaves) { roots.push(await this.writeLeaf(leaf, staging)); }
    return Object.freeze(roots);
  }

  async #writeBranchesIndividually(
    branches: readonly TrieBranchEntries[],
    staging?: ArtifactStagingPort,
  ): Promise<readonly string[]> {
    const roots: string[] = [];
    for (const branch of branches) { roots.push(await this.writeBranch(branch, staging)); }
    return Object.freeze(roots);
  }
}

function collectBranchMember(
  entries: Map<number, string>,
  member: BundleMemberReference,
  root: string,
): void {
  const name = branchMemberName(member.path, root);
  if (member.handle.kind !== 'bundle') {
    throw corruptRoot(`branch member ${name} is not a git-cas bundle`, root);
  }
  const nibble = parseNibbleName(name);
  if (entries.has(nibble)) {
    throw corruptRoot(`branch contains duplicate nibble ${name}`, root);
  }
  entries.set(nibble, member.handle.toString());
}

function branchMemberName(path: string, root: string): string {
  if (!path.startsWith(BRANCH_PREFIX)) {
    throw corruptRoot(`unexpected branch member path ${path}`, root);
  }
  const name = path.slice(BRANCH_PREFIX.length);
  if (name.includes('/')) {
    throw corruptRoot(`nested branch member path ${path}`, root);
  }
  return name;
}

function branchMembers(children: TrieBranchEntries): Array<[string, string]> {
  const ordered = [...children].sort(([left], [right]) => left - right);
  const width = nibbleNameWidth(ordered);
  return ordered.map(([nibble, child]) => [
    `${BRANCH_PREFIX}${formatNibble(nibble, width)}`,
    parseChildRoot(child).toString(),
  ]);
}

function nibbleNameWidth(entries: readonly (readonly [number, string])[]): number {
  const largest = entries.at(-1)?.[0] ?? 0;
  requireNibble(largest);
  return Math.max(1, largest.toString(16).length);
}

function formatNibble(nibble: number, width: number): string {
  requireNibble(nibble);
  return nibble.toString(16).padStart(width, '0');
}

function requireNibble(nibble: number): void {
  if (Number.isSafeInteger(nibble) && nibble >= 0) {
    return;
  }
  throw new TrieStoreError(`invalid branch nibble ${String(nibble)}`, {
    code: E_TRIE_STORE_WRITE,
    context: { nibble },
  });
}

function parseChildRoot(root: string): BundleHandle {
  try {
    return BundleHandle.parse(root);
  } catch (raw) {
    throw writeFailure(raw, 'parse child root');
  }
}

function parseReadRoot(root: string): BundleHandle {
  try {
    return BundleHandle.parse(root);
  } catch (raw) {
    throw new TrieStoreError('trie root is not a git-cas bundle handle', {
      code: E_TRIE_STORE_CORRUPT,
      context: { operation: 'parse root', root, reason: errorMessage(raw) },
    });
  }
}

function missingRoot(kind: 'leaf' | 'branch', root: string): TrieStoreError {
  return new TrieStoreError(`trie ${kind} root is missing`, {
    code: E_TRIE_STORE_MISSING,
    context: { root },
  });
}

function corruptRoot(message: string, root: string): TrieStoreError {
  return new TrieStoreError(message, {
    code: E_TRIE_STORE_CORRUPT,
    context: { root },
  });
}

function readFailure(raw: unknown, operation: string, root: string): TrieStoreError {
  if (raw instanceof TrieStoreError) {
    return raw;
  }
  const code = errorCode(raw);
  return new TrieStoreError(`${operation} failed: ${errorMessage(raw)}`, {
    code: code !== null && MISSING_CODES.has(code)
      ? E_TRIE_STORE_MISSING
      : E_TRIE_STORE_READ,
    context: { operation, root, storageCode: code },
  });
}

function writeFailure(raw: unknown, operation: string): TrieStoreError {
  if (raw instanceof TrieStoreError) {
    return raw;
  }
  return new TrieStoreError(`${operation} failed: ${errorMessage(raw)}`, {
    code: E_TRIE_STORE_WRITE,
    context: { operation, storageCode: errorCode(raw) },
  });
}

function errorCode(raw: unknown): string | null {
  if (!(raw instanceof Error) || !('code' in raw) || typeof raw.code !== 'string') {
    return null;
  }
  return raw.code;
}

function errorMessage(raw: unknown): string {
  return raw instanceof Error ? raw.message : String(raw);
}
