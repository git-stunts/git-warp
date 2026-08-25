import ORSet from "../../crdt/ORSet.ts";
import VersionVector from "../../crdt/VersionVector.ts";
import { Dot } from "../../crdt/Dot.ts";
import type PatchEntry from "../../artifacts/PatchEntry.ts";
import type StateSession from "../../orset/session/StateSession.ts";
import { TRIE_FLUSH_MAX_OPERATIONS_PER_DIRTY_PAGE }
  from "../../orset/trie/TrieFlushAdmissionPolicy.ts";
import type MaterializationStorePort from "../../../ports/MaterializationStorePort.ts";
import type MaterializationWorkspacePort from "../../../ports/MaterializationWorkspacePort.ts";
import type LoggerPort from "../../../ports/LoggerPort.ts";
import type IndexStorePort from "../../../ports/IndexStorePort.ts";
import {
  DEPENDENT_ARTIFACT_ADMISSION_MAX_OPERATIONS,
  type default as ArtifactStagingPort,
} from "../../../ports/ArtifactStagingPort.ts";
import type MaterializationCoordinate from "../../materialization/MaterializationCoordinate.ts";
import {
  materializationWorkspaceRootMembers,
} from "../../materialization/MaterializationWorkspaceRootMembers.ts";
import type StorageRetentionWitness from "../../storage/StorageRetentionWitness.ts";
import MaterializationRoot from "../../materialization/MaterializationRoot.ts";
import MaterializationRoots from "../../materialization/MaterializationRoots.ts";
import BundleHandle from "../../storage/BundleHandle.ts";
import WarpError from "../../errors/WarpError.ts";
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
import {
  MaterializationIndexRootPlan,
  type PreparedMaterializationIndexRoots,
} from "./MaterializationIndexRoots.ts";

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
  readonly propertyStore?: IndexStorePort;
  readonly propertyRoot?: MaterializationRoot;
  readonly indexRoot?: MaterializationRoot;
  readonly provenanceSupportRoot?: MaterializationRoot;
  readonly replayBasisRoot?: MaterializationRoot;
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
    let reducedPatchCount = 0;
    const patches = (async function* (): AsyncIterable<PatchEntry> {
      for await (const patch of args.patches) {
        reducedPatchCount += 1;
        yield patch;
      }
    })();
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
      const result = await reducePatchesInSession(patches, frame, {
        receipts: true,
      });
      const adjacency = await buildAdjacencyFromSession(result.frame.session);
      reduced = {
        state: await projectFrameToState(result.frame),
        adjacency,
        receipts: result.receipts,
      };
    } else if (args.wantDiff) {
      const result = await reducePatchesInSession(patches, frame, {
        trackDiff: true,
      });
      const adjacency = await buildAdjacencyFromSession(result.frame.session);
      reduced = {
        state: await projectFrameToState(result.frame),
        adjacency,
        diff: result.diff,
      };
    } else {
      const result = await reducePatchesInSession(patches, frame);
      const adjacency = await buildAdjacencyFromSession(result.session);
      reduced = {
        state: await projectFrameToState(result),
        adjacency,
      };
    }

    const indexPlan = MaterializationIndexRootPlan.create({
      state: reduced.state,
      store: args.propertyStore,
      ...(reducedPatchCount === 0 && args.propertyRoot !== undefined
        ? { existingPropertyRoot: args.propertyRoot }
        : {}),
      ...(reducedPatchCount === 0 && args.indexRoot !== undefined
        ? { existingIndexRoot: args.indexRoot }
        : {}),
    });
    const preparedArtifacts = await prepareSessionArtifacts(
      frame.session,
      indexPlan,
      workspace,
    );
    const {
      close,
      indexRoots: { properties, roaringIndexes },
    } = preparedArtifacts;
    if (!preparedArtifacts.rootsRetainedTogether) {
      await retainPreparedIndexRoots(
        workspace,
        close.roots,
        properties,
        roaringIndexes,
      );
    }
    const replayBasis = reducedPatchCount === 0 && args.replayBasisRoot !== undefined
      ? args.replayBasisRoot
      : MaterializationRoot.unavailable();
    const provenanceSupport = (
      reducedPatchCount === 0
      && args.provenanceSupportRoot !== undefined
    )
      ? args.provenanceSupportRoot
      : MaterializationRoot.unavailable();
    const roots = materializationRootsFromSession(
      close.roots,
      properties,
      roaringIndexes,
      provenanceSupport,
      replayBasis,
    );
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

type PreparedSessionArtifacts = Readonly<{
  close: Awaited<ReturnType<StateSession['prepareClose']>>;
  indexRoots: PreparedMaterializationIndexRoots;
  rootsRetainedTogether: boolean;
  workspaceRoot: BundleHandle | null;
}>;

type RetainedIndexRootTokens = Readonly<{
  propertiesRoot?: string;
  roaringIndexesRoot?: string;
}>;

const MATERIALIZATION_WORKSPACE_ROOT_WRITE_OPERATIONS = 1;

async function prepareSessionArtifacts(
  session: StateSession,
  indexPlan: MaterializationIndexRootPlan,
  workspace: MaterializationWorkspacePort,
): Promise<PreparedSessionArtifacts> {
  const stateOperationBound = session.dirtyPageCount() *
    TRIE_FLUSH_MAX_OPERATIONS_PER_DIRTY_PAGE;
  const operationBound = stateOperationBound + indexPlan.admissionOperationBound +
    MATERIALIZATION_WORKSPACE_ROOT_WRITE_OPERATIONS;
  const admissionGroupCount = Number(stateOperationBound > 0) +
    indexPlan.admissionGroupCount;
  if (
    workspace.admitDependentArtifacts !== undefined &&
    admissionGroupCount > 1 &&
    operationBound <= DEPENDENT_ARTIFACT_ADMISSION_MAX_OPERATIONS
  ) {
    return await workspace.admitDependentArtifacts(
      async (staging) => await prepareSessionArtifactsInScope(session, indexPlan, staging),
      {
        maxOperations: operationBound,
        retain: (prepared) => prepared.workspaceRoot === null
          ? []
          : [prepared.workspaceRoot.toString()],
      },
    );
  }
  return Object.freeze({
    close: await session.prepareClose(),
    indexRoots: await indexPlan.admit(workspace),
    rootsRetainedTogether: false,
    workspaceRoot: null,
  });
}

async function prepareSessionArtifactsInScope(
  session: StateSession,
  indexPlan: MaterializationIndexRootPlan,
  staging: ArtifactStagingPort,
): Promise<PreparedSessionArtifacts> {
  const close = await session.prepareClose(staging);
  const indexRoots = await indexPlan.write(staging);
  const workspaceRoot = await stageWorkspaceRoot(staging, close.roots, indexRoots);
  return Object.freeze({ close, indexRoots, rootsRetainedTogether: true, workspaceRoot });
}

async function stageWorkspaceRoot(
  staging: ArtifactStagingPort,
  roots: MaterializeSessionOpen,
  indexes: PreparedMaterializationIndexRoots,
): Promise<BundleHandle> {
  const retainedIndexes = retainedIndexRootTokens(
    indexes.properties,
    indexes.roaringIndexes,
  );
  const members = materializationWorkspaceRootMembers({
    nodeAliveRoot: roots.nodeAliveRootOid,
    edgeAliveRoot: roots.edgeAliveRootOid,
    ...retainedIndexes,
  });
  if (members.length === 0) {
    throw new WarpError(
      "Compound materialization produced no retainable workspace roots",
      "E_MATERIALIZATION_STORAGE",
    );
  }
  return await staging.stageOrderedBundle(members);
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
  properties: MaterializationRoot,
  roaringIndexes: MaterializationRoot,
  provenanceSupport: MaterializationRoot,
  replayBasis: MaterializationRoot,
): MaterializationRoots {
  return new MaterializationRoots({
    adjacency: MaterializationRoot.unavailable(),
    edgeAlive: sessionMaterializationRoot(roots.edgeAliveRootOid),
    edgeBirths: MaterializationRoot.unavailable(),
    frontier: MaterializationRoot.unavailable(),
    nodeAlive: sessionMaterializationRoot(roots.nodeAliveRootOid),
    properties,
    provenanceSupport,
    replayBasis,
    roaringIndexes,
  });
}

async function retainPreparedIndexRoots(
  workspace: MaterializationWorkspacePort,
  roots: MaterializeSessionOpen,
  properties: MaterializationRoot,
  roaringIndexes: MaterializationRoot,
): Promise<void> {
  const retainedIndexes = retainedIndexRootTokens(properties, roaringIndexes);
  if (
    retainedIndexes.propertiesRoot === undefined &&
    retainedIndexes.roaringIndexesRoot === undefined
  ) {
    return;
  }
  await workspace.checkpoint({
    nodeAliveRoot: roots.nodeAliveRootOid,
    edgeAliveRoot: roots.edgeAliveRootOid,
    ...retainedIndexes,
  });
}

function retainedIndexRootTokens(
  properties: MaterializationRoot,
  roaringIndexes: MaterializationRoot,
): RetainedIndexRootTokens {
  const propertiesRoot = retainedRootToken(properties);
  const roaringIndexesRoot = retainedRootToken(roaringIndexes);
  return Object.freeze({
    ...(propertiesRoot === undefined ? {} : { propertiesRoot }),
    ...(roaringIndexesRoot === undefined ? {} : { roaringIndexesRoot }),
  });
}

function retainedRootToken(root: MaterializationRoot): string | undefined {
  return root.status === 'retained' ? root.handle?.toString() : undefined;
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
    prop: frame.prop,
    observedFrontier: frame.observedFrontier,
    edgeBirthEvent: frame.edgeBirthEvent,
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
