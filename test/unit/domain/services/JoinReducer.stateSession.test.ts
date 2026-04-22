import { describe, expect, it } from "vitest";

import { Dot } from "../../../../src/domain/crdt/Dot.ts";
import { LWWRegister } from "../../../../src/domain/crdt/LWW.ts";
import VersionVector from "../../../../src/domain/crdt/VersionVector.ts";
import PageCache from "../../../../src/domain/orset/trie/PageCache.ts";
import TrieGeometry from "../../../../src/domain/orset/trie/TrieGeometry.ts";
import StateSession from "../../../../src/domain/orset/session/StateSession.ts";
import type WarpState from "../../../../src/domain/services/state/WarpState.ts";
import {
  reduceV5,
  joinStates,
  type PatchLike,
} from "../../../../src/domain/services/JoinReducer.ts";
import type { TickReceipt } from "../../../../src/domain/types/TickReceipt.ts";
import type { PatchDiff } from "../../../../src/domain/types/PatchDiff.ts";
import { EventId } from "../../../../src/domain/utils/EventId.ts";
import cborCodec from "../../../../src/infrastructure/codecs/CborCodec.ts";
import { InMemoryTrieStore } from "../../../helpers/trieHelpers.ts";

const GEOMETRY = TrieGeometry.default16way();

function makePatch(
  writer: string,
  lamport: number,
  ops: PatchLike["ops"],
  context: Record<string, number> = {},
): PatchLike {
  return { writer, lamport, ops, context };
}

function nodeAdd(node: string, dot: Dot) {
  return { type: "NodeAdd", node, dot };
}

function nodeRemove(node: string, observedDots: readonly string[]) {
  return { type: "NodeRemove", node, observedDots: [...observedDots] };
}

function edgeAdd(from: string, to: string, label: string, dot: Dot) {
  return { type: "EdgeAdd", from, to, label, dot };
}

function edgeRemove(
  from: string,
  to: string,
  label: string,
  observedDots: readonly string[],
) {
  return { type: "EdgeRemove", from, to, label, observedDots: [...observedDots] };
}

function propSet(node: string, key: string, value: string) {
  return { type: "PropSet", node, key, value };
}

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

async function loadJoinReducerSessionModule() {
  return await import("../../../../src/domain/services/JoinReducerSession.ts");
}

function expectReduceV5ReceiptResult(
  result: ReturnType<typeof reduceV5>,
): { readonly state: WarpState; readonly receipts: readonly TickReceipt[] } {
  if (
    result !== null &&
    typeof result === "object" &&
    "state" in result &&
    "receipts" in result
  ) {
    return result;
  }
  throw new Error("Expected reduceV5 receipts result");
}

function expectReduceV5DiffResult(
  result: ReturnType<typeof reduceV5>,
): { readonly state: WarpState; readonly diff: PatchDiff } {
  if (
    result !== null &&
    typeof result === "object" &&
    "state" in result &&
    "diff" in result
  ) {
    return result;
  }
  throw new Error("Expected reduceV5 diff result");
}

function expectReduceV5State(result: ReturnType<typeof reduceV5>) {
  if (
    result !== null &&
    typeof result === "object" &&
    !("state" in result)
  ) {
    return result;
  }
  throw new Error("Expected plain WarpState result");
}

describe("JoinReducer session-backed path", () => {
  describe("golden path", () => {
    it("replays mixed patches through one session-backed reducer frame", async () => {
      const { ReducerSessionFrame, reduceV5InSession } =
        await loadJoinReducerSessionModule();
      const { session, store, pageCache } = await openSession();
      const frame = new ReducerSessionFrame({
        session,
        prop: new Map(),
        observedFrontier: VersionVector.empty(),
        edgeBirthEvent: new Map(),
      });

      const patches = [
        {
          patch: makePatch("alice", 1, [
            nodeAdd("node:1", new Dot("alice", 1)),
            nodeAdd("node:2", new Dot("alice", 2)),
            edgeAdd("node:1", "node:2", "knows", new Dot("alice", 3)),
            propSet("node:1", "name", "Alice"),
          ]),
          sha: "a".repeat(40),
        },
      ] as const;

      const result = await reduceV5InSession(patches, frame);

      expect(await result.session.nodeContains("node:1")).toBe(true);
      expect(await result.session.nodeContains("node:2")).toBe(true);
      expect(await result.session.edgeContains("node:1\x00node:2\x00knows")).toBe(
        true,
      );
      expect(result.prop.get("node:1\x00name")?.value).toBe("Alice");
      expect(Object.fromEntries(result.observedFrontier)).toEqual({ alice: 1 });
      expect(result.edgeBirthEvent.size).toBe(1);
      expect(store.hasBeenWrittenTo()).toBe(false);

      const closeResult = await result.session.close();
      const reopened = await StateSession.open({
        nodeAliveRootOid: closeResult.nodeAliveRootOid,
        edgeAliveRootOid: closeResult.edgeAliveRootOid,
        store,
        codec: cborCodec,
        geometry: GEOMETRY,
        pageCache,
      });

      expect(await reopened.nodeContains("node:1")).toBe(true);
      expect(await reopened.edgeContains("node:1\x00node:2\x00knows")).toBe(
        true,
      );
    });

    it("matches the legacy sync reducer in receipt mode", async () => {
      const { ReducerSessionFrame, reduceV5InSession } =
        await loadJoinReducerSessionModule();
      const { session } = await openSession();
      const frame = new ReducerSessionFrame({
        session,
        prop: new Map(),
        observedFrontier: VersionVector.empty(),
        edgeBirthEvent: new Map(),
      });

      const patches = [
        {
          patch: makePatch("alice", 1, [
            nodeAdd("node:1", new Dot("alice", 1)),
            propSet("node:1", "name", "Alice"),
          ]),
          sha: "b".repeat(40),
        },
      ] as const;

      const syncResult = expectReduceV5ReceiptResult(
        reduceV5(patches, undefined, { receipts: true }),
      );
      const sessionResult = await reduceV5InSession(patches, frame, {
        receipts: true,
      });

      expect(sessionResult.receipts).toEqual(syncResult.receipts);
      expect(Object.fromEntries(sessionResult.frame.observedFrontier)).toEqual(
        Object.fromEntries(syncResult.state.observedFrontier),
      );
      expect(sessionResult.frame.prop.get("node:1\x00name")?.value).toBe(
        syncResult.state.prop.get("node:1\x00name")?.value,
      );
    });

    it("matches the legacy sync reducer in diff mode", async () => {
      const { ReducerSessionFrame, reduceV5InSession } =
        await loadJoinReducerSessionModule();
      const { session } = await openSession();
      const frame = new ReducerSessionFrame({
        session,
        prop: new Map(),
        observedFrontier: VersionVector.empty(),
        edgeBirthEvent: new Map(),
      });

      const patches = [
        {
          patch: makePatch("alice", 1, [nodeAdd("node:1", new Dot("alice", 1))]),
          sha: "c".repeat(40),
        },
        {
          patch: makePatch(
            "alice",
            2,
            [nodeRemove("node:1", [Dot.encode(new Dot("alice", 1))])],
            { alice: 1 },
          ),
          sha: "d".repeat(40),
        },
      ] as const;

      const syncResult = expectReduceV5DiffResult(
        reduceV5(patches, undefined, { trackDiff: true }),
      );
      const sessionResult = await reduceV5InSession(patches, frame, {
        trackDiff: true,
      });

      expect(sessionResult.diff).toEqual(syncResult.diff);
      expect(Object.fromEntries(sessionResult.frame.observedFrontier)).toEqual(
        Object.fromEntries(syncResult.state.observedFrontier),
      );
    });
  });

  describe("edge cases", () => {
    it("leaves an empty frame untouched for an empty patch list", async () => {
      const { ReducerSessionFrame, reduceV5InSession } =
        await loadJoinReducerSessionModule();
      const { session, store } = await openSession();
      const frame = new ReducerSessionFrame({
        session,
        prop: new Map(),
        observedFrontier: VersionVector.empty(),
        edgeBirthEvent: new Map(),
      });

      const result = await reduceV5InSession([], frame);

      expect(await result.session.nodeContains("node:1")).toBe(false);
      expect(await result.session.edgeContains("edge:1")).toBe(false);
      expect(result.prop.size).toBe(0);
      expect(Object.fromEntries(result.observedFrontier)).toEqual({});
      expect(result.edgeBirthEvent.size).toBe(0);
      expect(store.hasBeenWrittenTo()).toBe(false);
    });

    it("handles tombstone patches through the session-backed alive-set path", async () => {
      const { ReducerSessionFrame, reduceV5InSession } =
        await loadJoinReducerSessionModule();
      const { session } = await openSession();
      const frame = new ReducerSessionFrame({
        session,
        prop: new Map(),
        observedFrontier: VersionVector.empty(),
        edgeBirthEvent: new Map(),
      });

      const nodeDot = new Dot("alice", 1);
      const edgeDot = new Dot("alice", 2);
      const patches = [
        {
          patch: makePatch("alice", 1, [
            nodeAdd("node:1", nodeDot),
            edgeAdd("node:1", "node:2", "knows", edgeDot),
          ]),
          sha: "e".repeat(40),
        },
        {
          patch: makePatch(
            "alice",
            2,
            [
              nodeRemove("node:1", [Dot.encode(nodeDot)]),
              edgeRemove("node:1", "node:2", "knows", [Dot.encode(edgeDot)]),
            ],
            { alice: 1 },
          ),
          sha: "f".repeat(40),
        },
      ] as const;

      const result = await reduceV5InSession(patches, frame);

      expect(await result.session.nodeContains("node:1")).toBe(false);
      expect(
        await result.session.edgeContains("node:1\x00node:2\x00knows"),
      ).toBe(false);
      expect(Object.fromEntries(result.observedFrontier)).toEqual({ alice: 2 });
    });

    it("joins two session-backed frames without routing through raw ORSet join", async () => {
      const { ReducerSessionFrame, joinFrames } =
        await loadJoinReducerSessionModule();
      const leftOpen = await openSession();
      const rightOpen = await openSession();
      await leftOpen.session.addNode("node:left", new Dot("alice", 1));
      await rightOpen.session.addNode("node:right", new Dot("bob", 1));

      const left = new ReducerSessionFrame({
        session: leftOpen.session,
        prop: new Map([
          [
            "node:left\x00name",
            LWWRegister.set(new EventId(1, "alice", "a".repeat(40), 0), "Left"),
          ],
        ]),
        observedFrontier: VersionVector.from({ alice: 1 }),
        edgeBirthEvent: new Map(),
      });
      const right = new ReducerSessionFrame({
        session: rightOpen.session,
        prop: new Map([
          [
            "node:right\x00name",
            LWWRegister.set(new EventId(1, "bob", "b".repeat(40), 0), "Right"),
          ],
        ]),
        observedFrontier: VersionVector.from({ bob: 1 }),
        edgeBirthEvent: new Map(),
      });

      const merged = await joinFrames(left, right);

      expect(await merged.session.nodeContains("node:left")).toBe(true);
      expect(await merged.session.nodeContains("node:right")).toBe(true);
      expect(merged.prop.has("node:left\x00name")).toBe(true);
      expect(merged.prop.has("node:right\x00name")).toBe(true);
      expect(Object.fromEntries(merged.observedFrontier)).toEqual({
        alice: 1,
        bob: 1,
      });
    });
  });

  describe("known failure modes", () => {
    it("does not flush between patches while replay is still in progress", async () => {
      const { ReducerSessionFrame, reduceV5InSession } =
        await loadJoinReducerSessionModule();
      const { session, store } = await openSession();
      const frame = new ReducerSessionFrame({
        session,
        prop: new Map(),
        observedFrontier: VersionVector.empty(),
        edgeBirthEvent: new Map(),
      });

      const patches = [
        {
          patch: makePatch("alice", 1, [nodeAdd("node:1", new Dot("alice", 1))]),
          sha: "1".repeat(40),
        },
        {
          patch: makePatch("alice", 2, [nodeAdd("node:2", new Dot("alice", 2))]),
          sha: "2".repeat(40),
        },
      ] as const;

      await reduceV5InSession(patches, frame);

      expect(store.hasBeenWrittenTo()).toBe(false);
    });

    it("agrees with the legacy sync join on merged metadata", async () => {
      const { ReducerSessionFrame, joinFrames } =
        await loadJoinReducerSessionModule();
      const leftOpen = await openSession();
      const rightOpen = await openSession();
      await leftOpen.session.addNode("node:left", new Dot("alice", 1));
      await rightOpen.session.addNode("node:right", new Dot("bob", 1));

      const left = new ReducerSessionFrame({
        session: leftOpen.session,
        prop: new Map(),
        observedFrontier: VersionVector.from({ alice: 1 }),
        edgeBirthEvent: new Map(),
      });
      const right = new ReducerSessionFrame({
        session: rightOpen.session,
        prop: new Map(),
        observedFrontier: VersionVector.from({ bob: 1 }),
        edgeBirthEvent: new Map(),
      });

      const merged = await joinFrames(left, right);
      const syncJoined = joinStates(
        expectReduceV5State(reduceV5([
          {
            patch: makePatch("alice", 1, [
              nodeAdd("node:left", new Dot("alice", 1)),
            ]),
            sha: "3".repeat(40),
          },
        ])),
        expectReduceV5State(reduceV5([
          {
            patch: makePatch("bob", 1, [
              nodeAdd("node:right", new Dot("bob", 1)),
            ]),
            sha: "4".repeat(40),
          },
        ])),
      );

      expect(Object.fromEntries(merged.observedFrontier)).toEqual(
        Object.fromEntries(syncJoined.observedFrontier),
      );
    });
  });
});
