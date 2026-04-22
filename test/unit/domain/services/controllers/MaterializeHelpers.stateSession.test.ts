import { describe, expect, it } from "vitest";

import { Dot } from "../../../../../src/domain/crdt/Dot.ts";
import StateSession from "../../../../../src/domain/orset/session/StateSession.ts";
import PageCache from "../../../../../src/domain/orset/trie/PageCache.ts";
import TrieGeometry from "../../../../../src/domain/orset/trie/TrieGeometry.ts";
import { encodeEdgeKey } from "../../../../../src/domain/services/KeyCodec.ts";
import { buildAdjacencyFromSession } from "../../../../../src/domain/services/controllers/MaterializeHelpers.ts";
import cborCodec from "../../../../../src/infrastructure/codecs/CborCodec.ts";
import { InMemoryTrieStore } from "../../../../helpers/trieHelpers.ts";

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

describe("MaterializeHelpers — state session adjacency", () => {
  it("builds deterministic adjacency from async session scans", async () => {
    const session = await openSession();
    await session.addNode("a", Dot.create("w1", 1));
    await session.addNode("b", Dot.create("w1", 2));
    await session.addEdge(encodeEdgeKey("a", "b", "follows"), Dot.create("w1", 3));
    await session.addEdge(encodeEdgeKey("b", "c", "ghost"), Dot.create("w1", 4));

    const adjacency = await buildAdjacencyFromSession(session);

    expect(adjacency.outgoing.get("a")).toEqual([
      { neighborId: "b", label: "follows" },
    ]);
    expect(adjacency.outgoing.has("b")).toBe(false);
    expect(adjacency.incoming.get("b")).toEqual([
      { neighborId: "a", label: "follows" },
    ]);
  });

  it("fails loudly on a closed session", async () => {
    const session = await openSession();
    await session.close();

    await expect(buildAdjacencyFromSession(session)).rejects.toThrow(
      "StateSession is closed",
    );
  });
});
