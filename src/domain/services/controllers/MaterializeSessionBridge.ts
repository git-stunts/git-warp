import ORSet from "../../crdt/ORSet.ts";
import VersionVector from "../../crdt/VersionVector.ts";
import { Dot } from "../../crdt/Dot.ts";
import type PatchEntry from "../../artifacts/PatchEntry.ts";
import type StateSession from "../../orset/session/StateSession.ts";
import type MaterializationStorePort from "../../../ports/MaterializationStorePort.ts";
import type MaterializationWorkspacePort from "../../../ports/MaterializationWorkspacePort.ts";
import type LoggerPort from "../../../ports/LoggerPort.ts";
import type MaterializationCoordinate from "../../materialization/MaterializationCoordinate.ts";
import type StorageRetentionWitness from "../../storage/StorageRetentionWitness.ts";
import MaterializationRoot from "../../materialization/MaterializationRoot.ts";
import MaterializationRoots from "../../materialization/MaterializationRoots.ts";
import BundleHandle from "../../storage/BundleHandle.ts";
import type { PatchDiff } from "../../types/PatchDiff.ts";
import type { TickReceipt } from "../../types/TickReceipt.ts";
import WarpStateClass from "../state/WarpState.ts";
import {
  ReducerSessionFrame,
  reducePatchesInSession,
} from "../JoinReducerSession.ts";
import {
  buildAdjacencyFromSession,
  type MaterializeAdjacency,
} from "./MaterializeHelpers.ts";
import { releaseWorkspaceAfterFailure } from "./MaterializationWorkspaceCleanup.ts";

export type MaterializeSessionOpen = {
  readonly nodeAliveRootOid: string | null;
  readonly edgeAliveRootOid: string | null;
};

export type MaterializeSessionOpener = (
  init: MaterializeSessionOpen,
  options: { readonly workspace: MaterializationWorkspacePort },
) => Promise<StateSession>;

type MaterializeSessionPatchSource =
  | Iterable<PatchEntry>
  | AsyncIterable<PatchEntry>;

export async function reduceSessionBackedState(args: {
  readonly openStateSession: MaterializeSessionOpener;
  readonly materializations: MaterializationStorePort;
  readonly logger?: LoggerPort;
  readonly coordinate: MaterializationCoordinate;
  readonly patches: MaterializeSessionPatchSource;
  readonly baseState?: WarpStateClass;
  readonly roots?: MaterializeSessionOpen;
  readonly receipts: boolean;
  readonly wantDiff: boolean;
}): Promise<{
  readonly state: WarpStateClass;
  readonly adjacency: MaterializeAdjacency;
  readonly roots: MaterializationRoots;
  readonly workspace: MaterializationWorkspacePort;
  readonly acceptMaterialization: (witness: StorageRetentionWitness | null) => void;
  readonly receipts?: TickReceipt[];
  readonly diff?: PatchDiff;
}> {
  const workspace = await args.materializations.openWorkspace(args.coordinate);
  try {
    const frame = await openReducerSessionFrame(
      args.openStateSession,
      workspace,
      args.baseState,
      args.roots,
    );
    let reduced: {
      readonly state: WarpStateClass;
      readonly adjacency: MaterializeAdjacency;
      readonly receipts?: TickReceipt[];
      readonly diff?: PatchDiff;
    };
    if (args.receipts) {
      const result = await reducePatchesInSession(args.patches, frame, {
        receipts: true,
      });
      const adjacency = await buildAdjacencyFromSession(result.frame.session);
      reduced = {
        state: await projectFrameToState(result.frame),
        adjacency,
        receipts: result.receipts,
      };
    } else if (args.wantDiff) {
      const result = await reducePatchesInSession(args.patches, frame, {
        trackDiff: true,
      });
      const adjacency = await buildAdjacencyFromSession(result.frame.session);
      reduced = {
        state: await projectFrameToState(result.frame),
        adjacency,
        diff: result.diff,
      };
    } else {
      const result = await reducePatchesInSession(args.patches, frame);
      const adjacency = await buildAdjacencyFromSession(result.session);
      reduced = {
        state: await projectFrameToState(result),
        adjacency,
      };
    }

    const close = await frame.session.prepareClose();
    const roots = materializationRootsFromSession(close.roots);
    return {
      ...reduced,
      roots,
      workspace,
      acceptMaterialization: close.accept,
    };
  } catch (raw) {
    await releaseWorkspaceAfterFailure(workspace, args.logger);
    throw raw;
  }
}

async function openReducerSessionFrame(
  openStateSession: MaterializeSessionOpener,
  workspace: MaterializationWorkspacePort,
  baseState?: WarpStateClass,
  roots?: MaterializeSessionOpen,
): Promise<ReducerSessionFrame> {
  const session = await openStateSession(
    roots ?? {
      nodeAliveRootOid: null,
      edgeAliveRootOid: null,
    },
    { workspace },
  );

  if (baseState !== undefined && roots === undefined) {
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

export function materializationSessionOpen(
  roots: MaterializationRoots,
): MaterializeSessionOpen | null {
  const nodeAliveRootOid = sessionRootToken(roots.nodeAlive);
  const edgeAliveRootOid = sessionRootToken(roots.edgeAlive);
  if (nodeAliveRootOid === undefined || edgeAliveRootOid === undefined) {
    return null;
  }
  return Object.freeze({ nodeAliveRootOid, edgeAliveRootOid });
}

function materializationRootsFromSession(
  roots: MaterializeSessionOpen,
): MaterializationRoots {
  return new MaterializationRoots({
    adjacency: MaterializationRoot.unavailable(),
    edgeAlive: sessionMaterializationRoot(roots.edgeAliveRootOid),
    edgeBirths: MaterializationRoot.unavailable(),
    frontier: MaterializationRoot.unavailable(),
    nodeAlive: sessionMaterializationRoot(roots.nodeAliveRootOid),
    properties: MaterializationRoot.unavailable(),
    provenanceSupport: MaterializationRoot.unavailable(),
    roaringIndexes: MaterializationRoot.unavailable(),
  });
}

function sessionRootToken(root: MaterializationRoot): string | null | undefined {
  if (root.status === "unavailable") {
    return undefined;
  }
  return root.handle?.toString() ?? null;
}

function sessionMaterializationRoot(token: string | null): MaterializationRoot {
  return token === null
    ? MaterializationRoot.empty()
    : MaterializationRoot.retained(new BundleHandle(token));
}

async function seedSessionWithORSet(args: {
  readonly session: StateSession;
  readonly kind: "node" | "edge";
  readonly source: ORSet;
}): Promise<void> {
  for (const [element, dots] of args.source.entriesIter()) {
    const tombstones = new Set<string>();
    for (const encodedDot of dots) {
      const dot = Dot.decode(encodedDot);
      if (args.kind === "node") {
        await args.session.addNode(element, dot);
      } else {
        await args.session.addEdge(element, dot);
      }
      if (args.source.isTombstoned(encodedDot)) {
        tombstones.add(encodedDot);
      }
    }
    if (tombstones.size === 0) {
      continue;
    }
    if (args.kind === "node") {
      await args.session.removeNode(element, tombstones);
    } else {
      await args.session.removeEdge(element, tombstones);
    }
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
