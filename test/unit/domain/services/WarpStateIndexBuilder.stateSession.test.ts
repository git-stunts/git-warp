import { describe, expect, it } from "vitest";

import { Dot } from "../../../../src/domain/crdt/Dot.ts";
import StateSession from "../../../../src/domain/orset/session/StateSession.ts";
import PageCache from "../../../../src/domain/orset/trie/PageCache.ts";
import TrieGeometry from "../../../../src/domain/orset/trie/TrieGeometry.ts";
import { encodeEdgeKey } from "../../../../src/domain/services/KeyCodec.ts";
import WarpStateIndexBuilder from "../../../../src/domain/services/index/WarpStateIndexBuilder.ts";
import cborCodec from "../../../../src/infrastructure/codecs/CborCodec.ts";
import { InMemoryTrieStore } from "../../../helpers/trieHelpers.ts";

const GEOMETRY = TrieGeometry.default16way();

async function openSession(): Promise<StateSession> {
  return await StateSession.open({
    nodeAliveRootOid: null,
    edgeAliveRootOid: null,
    store: new InMemoryTrieStore(),
    codec: cborCodec,
    geometry: GEOMETRY,
    pageCache: new PageCache({ maxResident: 32 }),
  });
}

describe("WarpStateIndexBuilder — state session", () => {
  it("builds node and edge stats from async session scans", async () => {
    const session = await openSession();
    await session.addNode("user:alice", Dot.create("w1", 1));
    await session.addNode("user:bob", Dot.create("w1", 2));
    await session.addEdge(
      encodeEdgeKey("user:alice", "user:bob", "follows"),
      Dot.create("w1", 3),
    );
    await session.addEdge(
      encodeEdgeKey("user:bob", "user:ghost", "ghost-edge"),
      Dot.create("w1", 4),
    );

    const builder = new WarpStateIndexBuilder({ codec: cborCodec });
    const { stats } = await builder.buildFromSession(session);

    expect(stats.nodes).toBe(2);
    expect(stats.edges).toBe(1);
    expect(builder.builder.shaToId.has("user:alice")).toBe(true);
    expect(builder.builder.shaToId.has("user:bob")).toBe(true);
  });

  it("fails loudly on a closed session", async () => {
    const session = await openSession();
    await session.close();

    const builder = new WarpStateIndexBuilder({ codec: cborCodec });
    await expect(builder.buildFromSession(session)).rejects.toThrow(
      "StateSession is closed",
    );
  });
});
