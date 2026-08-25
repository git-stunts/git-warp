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
import ArtifactStagingPort, {
  type DependentArtifactAdmissionOptions,
  type DependentArtifactOperation,
  type StageOrderedBundleOptions,
  type StagePageOptions,
} from "../../../../../src/ports/ArtifactStagingPort.ts";
import CodecPort from "../../../../../src/ports/CodecPort.ts";
import cborCodec from "../../../../../src/infrastructure/codecs/CborCodec.ts";
import { InMemoryTrieStore } from "../../../../helpers/trieHelpers.ts";

const GEOMETRY = TrieGeometry.default16way();
const WIDE_GEOMETRY = new TrieGeometry({
  fanout: 256,
  nibbleBits: 8,
  leafCapacity: 64,
  leafFloor: 16,
});
const MEBIBYTE = 1024 * 1024;

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

  it("admits bounded dependent waves through one scoped staging operation", async () => {
    const store = new RecordingBatchTrieStore();
    const staging = new RecordingDependentArtifactStaging();

    await new TrieFlusher({ store, codec: cborCodec, staging }).flush(
      multiDepthSnapshot(),
    );

    expect(staging.operationBounds).toEqual([8]);
    expect(store.stagings).toEqual([
      staging.scoped,
      staging.scoped,
      staging.scoped,
    ]);
  });

  it("keeps oversized dependent writes on the ordinary staging path", async () => {
    const store = new RecordingBatchTrieStore();
    const staging = new RecordingDependentArtifactStaging();

    await new TrieFlusher({ store, codec: cborCodec, staging }).flush(
      oversizedLeafSnapshot(),
    );

    expect(staging.operationBounds).toEqual([]);
    expect(new Set(store.stagings)).toEqual(new Set([staging]));
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

  it("bounds serialized leaf waves before handing bytes to storage", async () => {
    const store = new BoundRecordingTrieStore();
    const codec = new FixedSizeCodec(16 * MEBIBYTE);

    await new TrieFlusher({ store, codec }).flush(shallowLeafSnapshot(3));

    expect(store.leafBatchSizes).toEqual([2, 1]);
    expect(store.leafBatchBytes).toEqual([32 * MEBIBYTE, 16 * MEBIBYTE]);
  });

  it("bounds leaf waves by item count", async () => {
    const store = new BoundRecordingTrieStore();

    await new TrieFlusher({ store, codec: cborCodec }).flush(wideLeafSnapshot());

    expect(store.leafBatchSizes).toEqual([256, 1]);
  });

  it("bounds same-depth branch waves by item count", async () => {
    const store = new BoundRecordingTrieStore();

    await new TrieFlusher({ store, codec: cborCodec }).flush(wideBranchSnapshot());

    expect(store.branchBatchSizes).toEqual([64, 1, 1, 1]);
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

function shallowLeafSnapshot(count: number): DirtyPageSet {
  const dirtyLeaves = new Map<string, TrieLeaf>();
  const children = new Map<number, string>();
  for (let nibble = 0; nibble < count; nibble += 1) {
    const path = [nibble];
    dirtyLeaves.set(encodeDirtyPath(path), new TrieLeaf([], GEOMETRY));
    children.set(nibble, `pending:${encodeDirtyPath(path)}`);
  }
  return new DirtyPageSet({
    rootOid: null,
    dirtyLeaves,
    dirtyBranches: new Map([
      [encodeDirtyPath([]), new TrieBranch(children, GEOMETRY)],
    ]),
    cleanChildren: new Map(),
  });
}

function wideLeafSnapshot(): DirtyPageSet {
  const dirtyLeaves = new Map<string, TrieLeaf>();
  const firstChildren = new Map<number, string>();
  for (let nibble = 0; nibble < 256; nibble += 1) {
    const path = [0, nibble];
    dirtyLeaves.set(encodeDirtyPath(path), new TrieLeaf([], WIDE_GEOMETRY));
    firstChildren.set(nibble, `pending:${encodeDirtyPath(path)}`);
  }
  const finalPath = [1, 0];
  dirtyLeaves.set(encodeDirtyPath(finalPath), new TrieLeaf([], WIDE_GEOMETRY));
  return new DirtyPageSet({
    rootOid: null,
    dirtyLeaves,
    dirtyBranches: new Map([
      [encodeDirtyPath([0]), new TrieBranch(firstChildren, WIDE_GEOMETRY)],
      [encodeDirtyPath([1]), new TrieBranch(new Map([
        [0, `pending:${encodeDirtyPath(finalPath)}`],
      ]), WIDE_GEOMETRY)],
      [encodeDirtyPath([]), new TrieBranch(new Map([
        [0, `pending:${encodeDirtyPath([0])}`],
        [1, `pending:${encodeDirtyPath([1])}`],
      ]), WIDE_GEOMETRY)],
    ]),
    cleanChildren: new Map(),
  });
}

function oversizedLeafSnapshot(): DirtyPageSet {
  const dirtyLeaves = new Map<string, TrieLeaf>();
  const dirtyBranches = new Map<string, TrieBranch>();
  const rootChildren = new Map<number, string>();
  let remaining = 513;
  for (let parent = 0; remaining > 0; parent += 1) {
    const childCount = Math.min(remaining, 256);
    const children = new Map<number, string>();
    for (let nibble = 0; nibble < childCount; nibble += 1) {
      const path = [parent, nibble];
      dirtyLeaves.set(encodeDirtyPath(path), new TrieLeaf([], WIDE_GEOMETRY));
      children.set(nibble, `pending:${encodeDirtyPath(path)}`);
    }
    const parentPath = [parent];
    dirtyBranches.set(
      encodeDirtyPath(parentPath),
      new TrieBranch(children, WIDE_GEOMETRY),
    );
    rootChildren.set(parent, `pending:${encodeDirtyPath(parentPath)}`);
    remaining -= childCount;
  }
  dirtyBranches.set(
    encodeDirtyPath([]),
    new TrieBranch(rootChildren, WIDE_GEOMETRY),
  );
  return new DirtyPageSet({
    rootOid: null,
    dirtyLeaves,
    dirtyBranches,
    cleanChildren: new Map(),
  });
}

function wideBranchSnapshot(): DirtyPageSet {
  const dirtyBranches = new Map<string, TrieBranch>();
  const parentChildren = new Map<number, string>();
  for (let nibble = 0; nibble < 65; nibble += 1) {
    const path = [0, nibble];
    dirtyBranches.set(
      encodeDirtyPath(path),
      new TrieBranch(new Map(), WIDE_GEOMETRY),
    );
    parentChildren.set(nibble, `pending:${encodeDirtyPath(path)}`);
  }
  dirtyBranches.set(
    encodeDirtyPath([0]),
    new TrieBranch(parentChildren, WIDE_GEOMETRY),
  );
  dirtyBranches.set(
    encodeDirtyPath([]),
    new TrieBranch(new Map([
      [0, `pending:${encodeDirtyPath([0])}`],
    ]), WIDE_GEOMETRY),
  );
  return new DirtyPageSet({
    rootOid: null,
    dirtyLeaves: new Map(),
    dirtyBranches,
    cleanChildren: new Map(),
  });
}

class RecordingBatchTrieStore implements TrieStorePort {
  readonly leafBatchSizes: number[] = [];
  readonly branchBatchSizes: number[] = [];
  readonly stagings: ArtifactStagingPort[] = [];
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
    staging?: ArtifactStagingPort,
  ): Promise<readonly string[]> {
    if (staging !== undefined) { this.stagings.push(staging); }
    this.leafBatchSizes.push(leaves.length);
    return await Promise.all(leaves.map(
      async (leaf) => await this.#store.writeLeaf(leaf),
    ));
  }

  async writeBranches(
    branches: readonly TrieBranchEntries[],
    staging?: ArtifactStagingPort,
  ): Promise<readonly string[]> {
    if (staging !== undefined) { this.stagings.push(staging); }
    this.branchBatchSizes.push(branches.length);
    return await Promise.all(branches.map(
      async (branch) => await this.#store.writeBranch(branch),
    ));
  }
}

class RecordingDependentArtifactStaging extends ArtifactStagingPort {
  readonly operationBounds: number[] = [];
  readonly scoped = new RecordingScopedArtifactStaging();

  override async admitDependentArtifacts<T>(
    operation: DependentArtifactOperation<T>,
    options: DependentArtifactAdmissionOptions<T>,
  ): Promise<T> {
    this.operationBounds.push(options.maxOperations);
    return await operation(this.scoped);
  }

  override async stagePage(): Promise<string> {
    return "outer-page";
  }

  override async stageOrderedBundle(): Promise<never> {
    throw new Error("outer staging does not create bundles in this test");
  }
}

class RecordingScopedArtifactStaging extends ArtifactStagingPort {
  override async stagePage(
    _source: Uint8Array,
    _options: StagePageOptions,
  ): Promise<string> {
    return "scoped-page";
  }

  override async stageOrderedBundle(
    _members: Iterable<[path: string, handle: string]>,
    _options?: StageOrderedBundleOptions,
  ): Promise<never> {
    throw new Error("scoped staging does not create bundles in this test");
  }
}

class WrongCardinalityTrieStore extends RecordingBatchTrieStore {
  override async writeLeaves(): Promise<readonly string[]> {
    return [];
  }
}

class BoundRecordingTrieStore implements TrieStorePort {
  readonly leafBatchSizes: number[] = [];
  readonly leafBatchBytes: number[] = [];
  readonly branchBatchSizes: number[] = [];
  #nextRoot = 0;

  async readLeaf(): Promise<Uint8Array> {
    throw new Error("readLeaf is outside this write-bound test");
  }

  async readBranch(): Promise<TrieBranchEntries> {
    throw new Error("readBranch is outside this write-bound test");
  }

  async writeLeaf(): Promise<string> {
    return this.#root("leaf");
  }

  async writeBranch(): Promise<string> {
    return this.#root("branch");
  }

  async writeLeaves(leaves: readonly Uint8Array[]): Promise<readonly string[]> {
    this.leafBatchSizes.push(leaves.length);
    this.leafBatchBytes.push(leaves.reduce((total, leaf) => total + leaf.byteLength, 0));
    return leaves.map(() => this.#root("leaf"));
  }

  async writeBranches(
    branches: readonly TrieBranchEntries[],
  ): Promise<readonly string[]> {
    this.branchBatchSizes.push(branches.length);
    return branches.map(() => this.#root("branch"));
  }

  #root(kind: "leaf" | "branch"): string {
    this.#nextRoot += 1;
    return `${kind}:${String(this.#nextRoot)}`;
  }
}

class FixedSizeCodec extends CodecPort {
  readonly #byteLength: number;

  constructor(byteLength: number) {
    super();
    this.#byteLength = byteLength;
  }

  override encode<TEncoded>(_data: TEncoded): Uint8Array {
    return new Uint8Array(this.#byteLength);
  }

  override decode<TDecoded>(_bytes: Uint8Array): TDecoded {
    throw new Error("decode is outside this write-bound test");
  }
}
