import type { LWWRegister } from "../../crdt/LWW.ts";
import ORSet from "../../crdt/ORSet.ts";
import VersionVector from "../../crdt/VersionVector.ts";
import { Dot } from "../../crdt/Dot.ts";
import StateSession from "../../orset/session/StateSession.ts";
import type { PropValue } from "../../types/PropValue.ts";
import type { EventId } from "../../utils/EventId.ts";
import type { PatchDiff } from "../../types/PatchDiff.ts";
import type { TickReceipt } from "../../types/TickReceipt.ts";
import type WarpState from "../state/WarpState.ts";
import WarpStateClass from "../state/WarpState.ts";
import type { PatchLike } from "../JoinReducer.ts";
import {
  ReducerSessionFrame,
  reduceV5InSession,
} from "../JoinReducerSession.ts";

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
    readonly patch: PatchLike;
    readonly sha: string;
  }>;
  readonly baseState?: WarpState;
  readonly receipts: boolean;
  readonly wantDiff: boolean;
}): Promise<{
  readonly state: WarpState;
  readonly receipts?: TickReceipt[];
  readonly diff?: PatchDiff;
}> {
  const frame = await openReducerSessionFrame(
    args.openStateSession,
    args.baseState,
  );
  try {
    if (args.receipts) {
      const result = await reduceV5InSession(args.patches, frame, {
        receipts: true,
      });
      return {
        state: await projectFrameToState(result.frame),
        receipts: result.receipts,
      };
    }
    if (args.wantDiff) {
      const result = await reduceV5InSession(args.patches, frame, {
        trackDiff: true,
      });
      return {
        state: await projectFrameToState(result.frame),
        diff: result.diff,
      };
    }
    const result = await reduceV5InSession(args.patches, frame);
    return {
      state: await projectFrameToState(result),
    };
  } finally {
    await frame.session.close();
  }
}

type SeedState = {
  readonly nodeAlive: ORSet;
  readonly edgeAlive: ORSet;
  readonly prop: Map<string, LWWRegister<PropValue>>;
  readonly observedFrontier: VersionVector;
  readonly edgeBirthEvent: Map<string, EventId>;
};

async function openReducerSessionFrame(
  openStateSession: MaterializeSessionOpener,
  baseState?: SeedState,
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
    prop: new Map(baseState?.prop ?? []),
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
): Promise<WarpState> {
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
