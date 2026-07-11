import { describe, expect, it } from "vitest";
import fc from "fast-check";

import ORSet from "../../../../../src/domain/crdt/ORSet.ts";
import { Dot } from "../../../../../src/domain/crdt/Dot.ts";
import VersionVector from "../../../../../src/domain/crdt/VersionVector.ts";
import { ReducerSessionFrame, joinFrames } from "../../../../../src/domain/services/JoinReducerSession.ts";
import StateSession from "../../../../../src/domain/orset/session/StateSession.ts";
import PageCache from "../../../../../src/domain/orset/trie/PageCache.ts";
import TrieGeometry from "../../../../../src/domain/orset/trie/TrieGeometry.ts";
import cborCodec from "../../../../../src/infrastructure/codecs/CborCodec.ts";
import { serializeORSet } from "../../../../../src/infrastructure/codecs/ORSetCodec.ts";
import { InMemoryTrieStore } from "../../../../helpers/trieHelpers.ts";

const PROPERTY_TEST_SEED = 20260422;
const GEOMETRY = TrieGeometry.default16way();

type WriterId = "alice" | "bob" | "carol";
type GeneratedEntry = {
  readonly element: string;
  readonly writerId: WriterId;
  readonly counter: number;
  readonly tombstoned: boolean;
};

const writerArb = fc.constantFrom<WriterId>("alice", "bob", "carol");
const elementArb = fc.constantFrom(
  "node:a",
  "node:b",
  "node:c",
  "node:d",
  "node:e",
);
const generatedEntryArb = fc.record({
  element: elementArb,
  writerId: writerArb,
  counter: fc.integer({ min: 1, max: 6 }),
  tombstoned: fc.boolean(),
});
const orsetStateArb = fc.uniqueArray(generatedEntryArb, {
  minLength: 0,
  maxLength: 8,
  selector: (entry) => `${entry.writerId}:${entry.counter}`,
}).map((entries) => buildORSet(entries));
const compactVectorArb = fc.record({
  alice: fc.integer({ min: 0, max: 6 }),
  bob: fc.integer({ min: 0, max: 6 }),
  carol: fc.integer({ min: 0, max: 6 }),
});

async function openSession(args?: {
  readonly store?: InMemoryTrieStore;
  readonly nodeAliveRootOid?: string | null;
}): Promise<StateSession> {
  return await StateSession.open({
    nodeAliveRootOid: args?.nodeAliveRootOid ?? null,
    edgeAliveRootOid: null,
    store: args?.store ?? new InMemoryTrieStore(),
    codec: cborCodec,
    geometry: GEOMETRY,
    pageCache: new PageCache({ maxResident: 64 }),
  });
}

function buildORSet(entries: ReadonlyArray<GeneratedEntry>): ORSet {
  const set = ORSet.empty();
  const tombstones = new Set<string>();
  for (const entry of entries) {
    const dot = Dot.create(entry.writerId, entry.counter);
    set.add(entry.element, dot);
    if (entry.tombstoned) {
      tombstones.add(Dot.encode(dot));
    }
  }
  set.remove(tombstones);
  return set;
}

async function seedSessionFromORSet(
  session: StateSession,
  set: ORSet,
): Promise<void> {
  for (const [element, dots] of set.entriesIter()) {
    for (const encodedDot of dots) {
      await session.addNode(element, Dot.decode(encodedDot));
    }
  }
  if (set.tombstones.size > 0) {
    await session.removeNodes(new Set(set.tombstones));
  }
}

async function projectSessionToORSet(session: StateSession): Promise<ORSet> {
  const entries = new Map<string, Set<string>>();
  const tombstones = new Set<string>();
  for await (const elementState of session.scanNodeElementStates()) {
    entries.set(
      elementState.element,
      new Set([
        ...elementState.dots,
        ...elementState.tombstonedDots,
      ]),
    );
    for (const dot of elementState.tombstonedDots) {
      tombstones.add(dot);
    }
  }
  return new ORSet(entries, tombstones);
}

async function makeFrame(set: ORSet): Promise<ReducerSessionFrame> {
  const session = await openSession();
  await seedSessionFromORSet(session, set);
  return new ReducerSessionFrame({
    session,
    prop: new Map(),
    observedFrontier: VersionVector.empty(),
    edgeBirthEvent: new Map(),
  });
}

async function joinSessionSets(left: ORSet, right: ORSet): Promise<ORSet> {
  const leftFrame = await makeFrame(left);
  const rightFrame = await makeFrame(right);
  try {
    const joined = await joinFrames(leftFrame, rightFrame);
    return await projectSessionToORSet(joined.session);
  } finally {
    await leftFrame.session.close();
    await rightFrame.session.close();
  }
}

function orsetsEqual(left: ORSet, right: ORSet): boolean {
  const leftSerialized = serializeORSet(left);
  const rightSerialized = serializeORSet(right);
  return JSON.stringify(leftSerialized) === JSON.stringify(rightSerialized);
}

describe("StateSession semilattice proof", () => {
  describe("session-backed join laws", () => {
    it("matches in-memory ORSet join under commutativity", async () => {
      await fc.assert(
        fc.asyncProperty(orsetStateArb, orsetStateArb, async (left, right) => {
          const expected = left.join(right);
          const leftThenRight = await joinSessionSets(left, right);
          const rightThenLeft = await joinSessionSets(right, left);
          return (
            orsetsEqual(leftThenRight, expected)
            && orsetsEqual(rightThenLeft, expected)
          );
        }),
        { numRuns: 50, seed: PROPERTY_TEST_SEED },
      );
    });

    it("matches in-memory ORSet join under associativity", async () => {
      await fc.assert(
        fc.asyncProperty(
          orsetStateArb,
          orsetStateArb,
          orsetStateArb,
          async (left, middle, right) => {
            const expected = left.join(middle).join(right);
            const leftAssociated = await joinSessionSets(
              await joinSessionSets(left, middle),
              right,
            );
            const rightAssociated = await joinSessionSets(
              left,
              await joinSessionSets(middle, right),
            );
            return (
              orsetsEqual(leftAssociated, expected)
              && orsetsEqual(rightAssociated, expected)
            );
          },
        ),
        { numRuns: 40, seed: PROPERTY_TEST_SEED },
      );
    });

    it("matches in-memory ORSet join under idempotency", async () => {
      await fc.assert(
        fc.asyncProperty(orsetStateArb, async (state) => {
          const expected = state.join(state);
          const joined = await joinSessionSets(state, state);
          return orsetsEqual(joined, expected);
        }),
        { numRuns: 50, seed: PROPERTY_TEST_SEED },
      );
    });

    it("keeps add-wins semantics for concurrent add and observed remove", async () => {
      await fc.assert(
        fc.asyncProperty(
          elementArb,
          fc.integer({ min: 1, max: 4 }),
          fc.integer({ min: 5, max: 8 }),
          async (element, removedCounter, survivingCounter) => {
            const removedDot = Dot.create("alice", removedCounter);
            const survivingDot = Dot.create("bob", survivingCounter);
            const removed = ORSet.empty();
            removed.add(element, removedDot);
            removed.remove(new Set([Dot.encode(removedDot)]));

            const concurrent = ORSet.empty();
            concurrent.add(element, survivingDot);

            const joined = await joinSessionSets(removed, concurrent);
            const expected = removed.join(concurrent);
            return (
              joined.contains(element)
              && orsetsEqual(joined, expected)
            );
          },
        ),
        { numRuns: 30, seed: PROPERTY_TEST_SEED },
      );
    });
  });

  describe("compact safety", () => {
    it("matches in-memory ORSet compaction under randomized included version vectors", async () => {
      await fc.assert(
        fc.asyncProperty(
          orsetStateArb,
          compactVectorArb,
          async (state, vectorRecord) => {
            const expected = state.clone();
            const included = VersionVector.from(vectorRecord);
            expected.compact(included);

            const session = await openSession();
            try {
              await seedSessionFromORSet(session, state);
              await session.compact(included);
              const projected = await projectSessionToORSet(session);
              return orsetsEqual(projected, expected);
            } finally {
              await session.close();
            }
          },
        ),
        { numRuns: 40, seed: PROPERTY_TEST_SEED },
      );
    });
  });

  describe("structural sharing", () => {
    it("reuses untouched trie subtrees after reopening and adding one node", async () => {
      const store = new InMemoryTrieStore();
      const baseline = await openSession({ store });
      for (let i = 0; i < 10; i += 1) {
        await baseline.addNode(`node:${i}`, Dot.create("alice", i + 1));
      }
      const baselineClose = await baseline.close();
      const baselineWrites = store.writeCounts();

      expect(baselineClose.nodeAliveRootOid).not.toBeNull();
      if (baselineClose.nodeAliveRootOid === null) {
        throw new Error('nodeAliveRootOid must exist after close');
      }

      const reopened = await openSession({
        store,
        nodeAliveRootOid: baselineClose.nodeAliveRootOid,
      });
      await reopened.addNode("node:new", Dot.create("alice", 100));
      const nextClose = await reopened.close();

      expect(nextClose.nodeAliveRootOid).not.toBe(baselineClose.nodeAliveRootOid);

      const deltaWrites =
        store.writeCounts().leaf
        + store.writeCounts().branch
        - baselineWrites.leaf
        - baselineWrites.branch;
      expect(deltaWrites).toBeLessThanOrEqual(
        baselineWrites.leaf + baselineWrites.branch,
      );

      const replay = await openSession({
        store,
        nodeAliveRootOid: nextClose.nodeAliveRootOid,
      });
      try {
        for (let i = 0; i < 10; i += 1) {
          expect(await replay.nodeContains(`node:${i}`)).toBe(true);
        }
        expect(await replay.nodeContains("node:new")).toBe(true);
      } finally {
        await replay.close();
      }
    });
  });
});
