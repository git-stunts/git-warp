import { describe, expect, it } from "vitest";

import TrieBranch from "../../../../../src/domain/orset/trie/TrieBranch.ts";
import DirtyPageSet, {
  encodeDirtyPath,
} from "../../../../../src/domain/orset/trie/DirtyPageSet.ts";
import TrieFlusher from "../../../../../src/domain/orset/trie/TrieFlusher.ts";
import TrieGeometry from "../../../../../src/domain/orset/trie/TrieGeometry.ts";
import TrieLeaf from "../../../../../src/domain/orset/trie/TrieLeaf.ts";
import type { TrieBranchEntries } from "../../../../../src/domain/orset/trie/TrieBranchEntries.ts";
import type TrieStorePort from "../../../../../src/domain/orset/trie/TrieStorePort.ts";
import type ArtifactStagingPort from "../../../../../src/ports/ArtifactStagingPort.ts";
import cborCodec from "../../../../../src/infrastructure/codecs/CborCodec.ts";
import { InMemoryTrieStore } from "../../../../helpers/trieHelpers.ts";

const GEOMETRY = TrieGeometry.default16way();

describe("TrieFlusher write waves", () => {
  it("writes all leaves together and branches once per dependency depth", async () => {
    const snapshot = multiDepthSnapshot();
    const baseline = await new TrieFlusher({
      store: new InMemoryTrieStore(),
      codec: cborCodec,
    }).flush(snapshot);
    const store = new RecordingBatchTrieStore();

    const batched = await new TrieFlusher({ store, codec: cborCodec }).flush(snapshot);

    expect(batched.rootOid).toBe(baseline.rootOid);
    expect(store.leafBatchSizes).toEqual([3]);
    expect(store.branchBatchSizes).toEqual([1, 1]);
    expect(store.singletonLeafWrites).toBe(0);
    expect(store.singletonBranchWrites).toBe(0);
  });

  it("rejects a batch result that omits an ordered root", async () => {
    const store = new WrongCardinalityTrieStore();

    await expect(new TrieFlusher({ store, codec: cborCodec }).flush(
      multiDepthSnapshot(),
    )).rejects.toMatchObject({
      code: "E_TRIE_FLUSH_STORE",
      context: { kind: "leaf", expected: 3, actual: 0 },
    });
  });
});

function multiDepthSnapshot(): DirtyPageSet {
  const leaf = (): TrieLeaf => new TrieLeaf([], GEOMETRY);
  const nested = new TrieBranch(new Map([
    [0, "pending:0/0"],
    [1, "pending:0/1"],
  ]), GEOMETRY);
  const root = new TrieBranch(new Map([
    [0, "pending:0"],
    [1, "pending:1"],
  ]), GEOMETRY);
  return new DirtyPageSet({
    rootOid: null,
    dirtyLeaves: new Map([
      [encodeDirtyPath([0, 0]), leaf()],
      [encodeDirtyPath([0, 1]), leaf()],
      [encodeDirtyPath([1]), leaf()],
    ]),
    dirtyBranches: new Map([
      [encodeDirtyPath([0]), nested],
      [encodeDirtyPath([]), root],
    ]),
    cleanChildren: new Map(),
  });
}

class RecordingBatchTrieStore implements TrieStorePort {
  readonly leafBatchSizes: number[] = [];
  readonly branchBatchSizes: number[] = [];
  singletonLeafWrites = 0;
  singletonBranchWrites = 0;
  readonly #store = new InMemoryTrieStore();

  async readLeaf(root: string): Promise<Uint8Array> {
    return await this.#store.readLeaf(root);
  }

  async readBranch(root: string): Promise<TrieBranchEntries> {
    return await this.#store.readBranch(root);
  }

  async writeLeaf(data: Uint8Array): Promise<string> {
    this.singletonLeafWrites += 1;
    return await this.#store.writeLeaf(data);
  }

  async writeBranch(children: TrieBranchEntries): Promise<string> {
    this.singletonBranchWrites += 1;
    return await this.#store.writeBranch(children);
  }

  async writeLeaves(
    leaves: readonly Uint8Array[],
    _staging?: ArtifactStagingPort,
  ): Promise<readonly string[]> {
    this.leafBatchSizes.push(leaves.length);
    return await Promise.all(leaves.map(
      async (leaf) => await this.#store.writeLeaf(leaf),
    ));
  }

  async writeBranches(
    branches: readonly TrieBranchEntries[],
    _staging?: ArtifactStagingPort,
  ): Promise<readonly string[]> {
    this.branchBatchSizes.push(branches.length);
    return await Promise.all(branches.map(
      async (branch) => await this.#store.writeBranch(branch),
    ));
  }
}

class WrongCardinalityTrieStore extends RecordingBatchTrieStore {
  override async writeLeaves(): Promise<readonly string[]> {
    return [];
  }
}
