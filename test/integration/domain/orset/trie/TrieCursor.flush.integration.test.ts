/**
 * Integration test: TrieCursor + TrieFlusher round-trip through a
 * real Git repository via GitTrieStoreAdapter.
 *
 * Cursor writes pending OIDs into branch entries; flusher resolves
 * those into real Git OIDs. A fresh cursor re-opened at the new
 * root must observe every element the source cursor wrote.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Plumbing from "@git-stunts/plumbing";

import { Dot } from "../../../../../src/domain/crdt/Dot.ts";
import GitTrieStoreAdapter from "../../../../../src/infrastructure/adapters/GitTrieStoreAdapter.ts";
import TrieCursor from "../../../../../src/domain/orset/trie/TrieCursor.ts";
import TrieFlusher from "../../../../../src/domain/orset/trie/TrieFlusher.ts";
import TrieGeometry from "../../../../../src/domain/orset/trie/TrieGeometry.ts";
import cborCodec from "../../../../../src/infrastructure/codecs/CborCodec.ts";

interface PlumbingRuntime {
  execute(opts: { args: string[]; input?: string | Buffer }): Promise<string>;
  executeStream(opts: {
    args: string[];
  }): Promise<{ collect(opts: { asString: boolean }): Promise<Buffer | string> }>;
}

interface Harness {
  readonly tempDir: string;
  readonly plumbing: PlumbingRuntime;
  readonly adapter: GitTrieStoreAdapter;
  cleanup(): Promise<void>;
}

async function createHarness(): Promise<Harness> {
  const tempDir = await mkdtemp(join(tmpdir(), "warp-trie-flush-integration-"));
  try {
    const plumbing = Plumbing.createDefault({ cwd: tempDir });
    await plumbing.execute({ args: ["init", "-q"] });
    await plumbing.execute({ args: ["config", "user.email", "test@test.com"] });
    await plumbing.execute({ args: ["config", "user.name", "Test"] });
    const adapter = new GitTrieStoreAdapter({ plumbing });
    return {
      tempDir,
      plumbing,
      adapter,
      async cleanup(): Promise<void> {
        await rm(tempDir, { recursive: true, force: true });
      },
    };
  } catch (err) {
    await rm(tempDir, { recursive: true, force: true });
    throw err;
  }
}

describe("TrieCursor + TrieFlusher integration (real Git)", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("round-trips a single element through a real Git repo", async () => {
    const geometry = TrieGeometry.default16way();
    const cursor = new TrieCursor({
      rootOid: null,
      store: harness.adapter,
      geometry,
      codec: cborCodec,
    });
    await cursor.add("node:1", new Dot("alice", 1));
    const flusher = new TrieFlusher({ store: harness.adapter, codec: cborCodec });
    const result = await flusher.flush(cursor.snapshot());
    expect(result.rootOid).not.toBeNull();

    const replay = new TrieCursor({
      rootOid: result.rootOid,
      store: harness.adapter,
      geometry,
      codec: cborCodec,
    });
    expect(await replay.contains("node:1")).toBe(true);
  });

  it("round-trips a capacity-2 trie with cascading splits", async () => {
    const tiny = new TrieGeometry({
      fanout: 16,
      nibbleBits: 4,
      leafCapacity: 2,
      leafFloor: 1,
    });
    const cursor = new TrieCursor({
      rootOid: null,
      store: harness.adapter,
      geometry: tiny,
      codec: cborCodec,
    });
    const ids = Array.from({ length: 20 }, (_, i) => `node:${i}`);
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      if (id === undefined) {
        continue;
      }
      await cursor.add(id, new Dot("w", i + 1));
    }
    const flusher = new TrieFlusher({ store: harness.adapter, codec: cborCodec });
    const result = await flusher.flush(cursor.snapshot());
    expect(result.rootOid).not.toBeNull();

    const rootType = (
      await harness.plumbing.execute({
        args: ["cat-file", "-t", result.rootOid ?? ""],
      })
    ).trim();
    expect(rootType).toBe("tree");

    const replay = new TrieCursor({
      rootOid: result.rootOid,
      store: harness.adapter,
      geometry: tiny,
      codec: cborCodec,
    });
    for (const id of ids) {
      expect(await replay.contains(id)).toBe(true);
    }
  });

  it("supports a second cursor that adds to a previously-flushed root", async () => {
    const geometry = TrieGeometry.default16way();
    const flusher = new TrieFlusher({ store: harness.adapter, codec: cborCodec });

    const first = new TrieCursor({
      rootOid: null,
      store: harness.adapter,
      geometry,
      codec: cborCodec,
    });
    for (let i = 0; i < 5; i += 1) {
      await first.add(`node:${i}`, new Dot("w", i + 1));
    }
    const baseline = await flusher.flush(first.snapshot());

    const second = new TrieCursor({
      rootOid: baseline.rootOid,
      store: harness.adapter,
      geometry,
      codec: cborCodec,
    });
    await second.add("node:new", new Dot("w", 100));
    const next = await flusher.flush(second.snapshot());
    expect(next.rootOid).not.toBe(baseline.rootOid);

    const replay = new TrieCursor({
      rootOid: next.rootOid,
      store: harness.adapter,
      geometry,
      codec: cborCodec,
    });
    for (let i = 0; i < 5; i += 1) {
      expect(await replay.contains(`node:${i}`)).toBe(true);
    }
    expect(await replay.contains("node:new")).toBe(true);
  });

  it("empty cursor flushes to no new root OID", async () => {
    const geometry = TrieGeometry.default16way();
    const cursor = new TrieCursor({
      rootOid: null,
      store: harness.adapter,
      geometry,
      codec: cborCodec,
    });
    const flusher = new TrieFlusher({ store: harness.adapter, codec: cborCodec });
    const result = await flusher.flush(cursor.snapshot());
    expect(result.rootOid).toBeNull();
    expect(result.isClean()).toBe(true);
  });
});
