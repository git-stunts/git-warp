import { describe, expect, it } from "vitest";

import { LWWRegister } from "../../../../src/domain/crdt/LWW.ts";
import { Dot } from "../../../../src/domain/crdt/Dot.ts";
import StateSession from "../../../../src/domain/orset/session/StateSession.ts";
import PageCache from "../../../../src/domain/orset/trie/PageCache.ts";
import TrieGeometry from "../../../../src/domain/orset/trie/TrieGeometry.ts";
import { ReceiptShard } from "../../../../src/domain/artifacts/ReceiptShard.ts";
import { PropertyShard } from "../../../../src/domain/artifacts/PropertyShard.ts";
import LogicalIndexBuildService from "../../../../src/domain/services/index/LogicalIndexBuildService.ts";
import { encodeEdgeKey, encodePropKey } from "../../../../src/domain/services/KeyCodec.ts";
import { EventId } from "../../../../src/domain/utils/EventId.ts";
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

describe("LogicalIndexBuildService — state session", () => {
  it("builds shards from session-backed alive sets and sync props", async () => {
    const session = await openSession();
    await session.addNode("A", Dot.create("w1", 1));
    await session.addNode("B", Dot.create("w1", 2));
    await session.addEdge(encodeEdgeKey("A", "B", "knows"), Dot.create("w1", 3));

    const prop = new Map([
      [
        encodePropKey("A", "name"),
        LWWRegister.set(new EventId(4, "w1", "a".repeat(40), 0), "Alice"),
      ],
    ]);

    const service = new LogicalIndexBuildService();
    const { shards, receipt } = await service.buildShardsFromSession({
      session,
      prop,
    });

    expect(receipt).toBeInstanceOf(ReceiptShard);
    expect(receipt.nodeCount).toBe(2);
    expect(receipt.labelCount).toBe(1);

    const propertyShard = shards.find((shard) => shard instanceof PropertyShard);
    expect(propertyShard).toBeInstanceOf(PropertyShard);
    const propertyEntry = (propertyShard as PropertyShard).entries.find(
      ([nodeId]) => nodeId === "A",
    );
    expect(propertyEntry?.[1]).toEqual({
      name: "Alice",
    });
  });
});
