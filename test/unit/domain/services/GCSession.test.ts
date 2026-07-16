import { describe, expect, it } from "vitest";

import { Dot, encodeDot } from "../../../../src/domain/crdt/Dot.ts";
import VersionVector from "../../../../src/domain/crdt/VersionVector.ts";
import StateSession from "../../../../src/domain/orset/session/StateSession.ts";
import PageCache from "../../../../src/domain/orset/trie/PageCache.ts";
import TrieGeometry from "../../../../src/domain/orset/trie/TrieGeometry.ts";
import GCMetrics from "../../../../src/domain/services/GCMetrics.ts";
import executeGCInSession from "../../../../src/domain/services/executeGCInSession.ts";
import WarpError from "../../../../src/domain/errors/WarpError.ts";
import { createEmptyState } from "../../../../src/domain/services/JoinReducer.ts";
import cborCodec from "../../../../src/infrastructure/codecs/CborCodec.ts";
import { InMemoryTrieStore } from "../../../helpers/trieHelpers.ts";

const GEOMETRY = TrieGeometry.default16way();

async function openSession(args?: {
  readonly nodeAliveRootOid?: string | null;
  readonly edgeAliveRootOid?: string | null;
  readonly store?: InMemoryTrieStore;
  readonly pageCache?: PageCache;
}) {
  const store = args?.store ?? new InMemoryTrieStore();
  const pageCache = args?.pageCache ?? new PageCache({ maxResident: 32 });
  const session = await StateSession.open({
    nodeAliveRootOid: args?.nodeAliveRootOid ?? null,
    edgeAliveRootOid: args?.edgeAliveRootOid ?? null,
    store,
    codec: cborCodec,
    geometry: GEOMETRY,
    pageCache,
  });
  return { session, store, pageCache };
}

describe("GCMetrics.fromSession", () => {
  it("matches the synchronous ORSet count laws for equivalent alive-set state", async () => {
    const syncState = createEmptyState();
    const { session } = await openSession();
    const nodeDot1 = Dot.create("alice", 1);
    const nodeDot2 = Dot.create("alice", 2);
    const edgeDot1 = Dot.create("bob", 1);

    syncState.nodeAlive.add("node:1", nodeDot1);
    syncState.nodeAlive.add("node:2", nodeDot2);
    syncState.edgeAlive.add("edge:1", edgeDot1);
    syncState.nodeAlive.remove(new Set([encodeDot(nodeDot2)]));
    syncState.edgeAlive.remove(new Set([encodeDot(edgeDot1)]));

    await session.addNode("node:1", nodeDot1);
    await session.addNode("node:2", nodeDot2);
    await session.addEdge("edge:1", edgeDot1);
    await session.removeNode("node:2", new Set([encodeDot(nodeDot2)]));
    await session.removeEdge("edge:1", new Set([encodeDot(edgeDot1)]));

    const syncMetrics = GCMetrics.fromState(syncState);
    const sessionMetrics = await GCMetrics.fromSession(session);

    expect(sessionMetrics).toEqual(syncMetrics);
  });

  it("returns zero metrics for an empty session", async () => {
    const { session } = await openSession();

    const metrics = await GCMetrics.fromSession(session);

    expect(metrics.nodeEntries).toBe(0);
    expect(metrics.edgeEntries).toBe(0);
    expect(metrics.totalEntries).toBe(0);
    expect(metrics.totalTombstones).toBe(0);
    expect(metrics.totalLiveDots).toBe(0);
    expect(metrics.tombstoneRatio).toBe(0);
  });
});

describe("executeGCInSession", () => {
  it("removes compactable tombstoned node dots and persists the compacted roots across close and reopen", async () => {
    const { session, store, pageCache } = await openSession();
    const compactableDot = Dot.create("alice", 1);
    const retainedDot = Dot.create("alice", 2);

    await session.addNode("node:1", compactableDot);
    await session.addNode("node:2", retainedDot);
    await session.removeNode("node:1", new Set([encodeDot(compactableDot)]));
    await session.removeNode("node:2", new Set([encodeDot(retainedDot)]));

    const result = await executeGCInSession(
      session,
      VersionVector.from({ alice: 1 }),
    );

    expect(result.nodesCompacted).toBe(1);
    expect(result.edgesCompacted).toBe(0);
    expect(result.tombstonesRemoved).toBe(1);

    const closeResult = await session.close();
    const reopened = await StateSession.open({
      nodeAliveRootOid: closeResult.nodeAliveRootOid,
      edgeAliveRootOid: closeResult.edgeAliveRootOid,
      store,
      codec: cborCodec,
      geometry: GEOMETRY,
      pageCache,
    });

    expect(await reopened.nodeElementState("node:1")).toBeNull();
    expect(await reopened.nodeContains("node:2")).toBe(false);
  });

  it("preserves live dots even when the included version vector dominates them", async () => {
    const { session } = await openSession();

    await session.addNode("node:1", Dot.create("alice", 1));
    await session.addEdge("edge:1", Dot.create("alice", 2));

    const result = await executeGCInSession(
      session,
      VersionVector.from({ alice: 99 }),
    );

    expect(result.nodesCompacted).toBe(0);
    expect(result.edgesCompacted).toBe(0);
    expect(result.tombstonesRemoved).toBe(0);
    expect(await session.nodeContains("node:1")).toBe(true);
    expect(await session.edgeContains("edge:1")).toBe(true);
  });

  it("compacts both node and edge engines in one call", async () => {
    const { session } = await openSession();
    const nodeDot = Dot.create("alice", 1);
    const edgeDot = Dot.create("alice", 2);

    await session.addNode("node:1", nodeDot);
    await session.addEdge("edge:1", edgeDot);
    await session.removeNode("node:1", new Set([encodeDot(nodeDot)]));
    await session.removeEdge("edge:1", new Set([encodeDot(edgeDot)]));

    const result = await executeGCInSession(
      session,
      VersionVector.from({ alice: 2 }),
    );

    expect(result.nodesCompacted).toBe(1);
    expect(result.edgesCompacted).toBe(1);
    expect(result.tombstonesRemoved).toBe(2);
  });

  it("rejects invalid version vectors with E_GC_INVALID_VV", async () => {
    const { session } = await openSession();
    const invalidVectors: readonly unknown[] = [{}, null, undefined];

    for (const invalidVector of invalidVectors) {
      await expect(async () => {
        // @ts-expect-error intentional runtime validation test
        await executeGCInSession(session, invalidVector);
      }).rejects.toBeInstanceOf(WarpError);

      try {
        // @ts-expect-error intentional runtime validation test
        await executeGCInSession(session, invalidVector);
      } catch (error) {
        if (error instanceof WarpError) {
          expect(error.code).toBe("E_GC_INVALID_VV");
        }
      }
    }
  });

  it("fails loudly when called on a closed session", async () => {
    const { session } = await openSession();
    await session.close();

    await expect(
      executeGCInSession(session, VersionVector.empty()),
    ).rejects.toBeTruthy();
  });
});
