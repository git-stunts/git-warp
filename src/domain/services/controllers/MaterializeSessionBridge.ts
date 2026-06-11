import ORSet from "../../crdt/ORSet.ts";
import VersionVector from "../../crdt/VersionVector.ts";
import { Dot } from "../../crdt/Dot.ts";
import type StateSession from "../../orset/session/StateSession.ts";
import type { PatchDiff } from "../../types/PatchDiff.ts";
import type { TickReceipt } from "../../types/TickReceipt.ts";
import WarpStateClass from "../state/WarpState.ts";
import type { PatchLike } from "../JoinReducer.ts"; // nosemgrep: ts-no-like-types -- 0025C
import {
  ReducerSessionFrame,
  reducePatchesInSession,
} from "../JoinReducerSession.ts";
import {
  buildAdjacencyFromSession,
  type MaterializeAdjacency,
} from "./MaterializeHelpers.ts";

export type MaterializeSessionOpen = {
  readonly nodeAliveRootOid: string | null;
  readonly edgeAliveRootOid: string | null;
};

export type MaterializeSessionOpener = (
  init: MaterializeSessionOpen,
) => Promise<StateSession>;

export async function reduceSessionBackedState(args: {
  readonly openStateSession: MaterializeSessionOpener;
  readonly patches: ReadonlyArray<{
    readonly patch: PatchLike; // nosemgrep: ts-no-like-types -- 0025C
    readonly sha: string;
  }>;
  readonly baseState?: WarpStateClass;
  readonly receipts: boolean;
  readonly wantDiff: boolean;
}): Promise<{
  readonly state: WarpStateClass;
  readonly adjacency: MaterializeAdjacency;
  readonly receipts?: TickReceipt[];
  readonly diff?: PatchDiff;
}> {
  const frame = await openReducerSessionFrame(
    args.openStateSession,
    args.baseState,
  );
  try {
    if (args.receipts) {
      const result = await reducePatchesInSession(args.patches, frame, {
        receipts: true,
      });
      const adjacency = await buildAdjacencyFromSession(result.frame.session);
      return {
        state: await projectFrameToState(result.frame),
        adjacency,
        receipts: result.receipts,
      };
    }
    if (args.wantDiff) {
      const result = await reducePatchesInSession(args.patches, frame, {
        trackDiff: true,
      });
      const adjacency = await buildAdjacencyFromSession(result.frame.session);
      return {
        state: await projectFrameToState(result.frame),
        adjacency,
        diff: result.diff,
      };
    }
    const result = await reducePatchesInSession(args.patches, frame);
    const adjacency = await buildAdjacencyFromSession(result.session);
    return {
      state: await projectFrameToState(result),
      adjacency,
    };
  } finally {
    await frame.session.close();
  }
}

async function openReducerSessionFrame(
  openStateSession: MaterializeSessionOpener,
  baseState?: WarpStateClass,
): Promise<ReducerSessionFrame> {
  const session = await openStateSession({
    nodeAliveRootOid: null,
    edgeAliveRootOid: null,
  });

  if (baseState !== undefined) {
    await seedSessionWithORSet({
      session,
      kind: "node",
      source: baseState.nodeAlive,
    });
    await seedSessionWithORSet({
      session,
      kind: "edge",
      source: baseState.edgeAlive,
    });
  }

  return new ReducerSessionFrame({
    session,
    prop: new Map(baseState?.allPropEntries() ?? []),
    observedFrontier: baseState?.observedFrontier.clone() ?? VersionVector.empty(),
    edgeBirthEvent: new Map(baseState?.edgeBirthEvent ?? []),
  });
}

async function seedSessionWithORSet(args: {
  readonly session: StateSession;
  readonly kind: "node" | "edge";
  readonly source: ORSet;
}): Promise<void> {
  for (const [element, dots] of args.source.entriesIter()) {
    for (const encodedDot of dots) {
      const dot = Dot.decode(encodedDot);
      if (args.kind === "node") {
        await args.session.addNode(element, dot);
      } else {
        await args.session.addEdge(element, dot);
      }
    }
  }

  if (args.source.tombstones.size === 0) {
    return;
  }

  const tombstones = new Set(args.source.tombstones);
  if (args.kind === "node") {
    await args.session.removeNodes(tombstones);
  } else {
    await args.session.removeEdges(tombstones);
  }
}

async function projectFrameToState(
  frame: ReducerSessionFrame,
): Promise<WarpStateClass> {
  return new WarpStateClass({
    nodeAlive: await projectORSet(frame.session.scanNodeElementStates()),
    edgeAlive: await projectORSet(frame.session.scanEdgeElementStates()),
    prop: new Map(frame.prop),
    observedFrontier: frame.observedFrontier.clone(),
    edgeBirthEvent: new Map(frame.edgeBirthEvent),
  });
}

async function projectORSet(
  states: AsyncIterable<{
    readonly element: string;
    readonly dots: ReadonlySet<string>;
    readonly tombstonedDots: ReadonlySet<string>;
  }>,
): Promise<ORSet> {
  const entries = new Map<string, Set<string>>();
  const tombstones = new Set<string>();

  for await (const state of states) {
    entries.set(
      state.element,
      new Set([...state.dots, ...state.tombstonedDots]),
    );
    for (const dot of state.tombstonedDots) {
      tombstones.add(dot);
    }
  }

  return new ORSet(entries, tombstones);
}
