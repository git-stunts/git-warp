import type MaterializationCoordinate from '../../materialization/MaterializationCoordinate.ts';
import LiveMaterializationResolution from '../../materialization/LiveMaterializationResolution.ts';
import type MaterializationHandle from '../../materialization/MaterializationHandle.ts';
import MaterializationRoot from '../../materialization/MaterializationRoot.ts';
import MaterializationRoots from '../../materialization/MaterializationRoots.ts';
import BundleHandle from '../../storage/BundleHandle.ts';
import WarpError from '../../errors/WarpError.ts';
import type StateSession from '../../orset/session/StateSession.ts';
import type MaterializationWorkspacePort from '../../../ports/MaterializationWorkspacePort.ts';
import { applyLivenessInSession } from '../JoinReducerSession.ts';
import type { MaterializeDeps } from './MaterializeDeps.ts';
import type { MaterializeSessionOpener } from './MaterializeSessionBridge.ts';
import {
  releaseAcquisitionAfterFailure,
  releaseWorkspaceAfterFailure,
} from './MaterializationWorkspaceCleanup.ts';

export type BoundedLiveMaterializationResult = Readonly<{
  materialization: Awaited<
    ReturnType<MaterializeDeps['materializations']['retain']>
  >;
  patchCount: number;
}>;

export async function resolveBoundedLiveMaterialization(args: {
  readonly deps: MaterializeDeps;
  readonly coordinate: MaterializationCoordinate;
}): Promise<LiveMaterializationResolution | null> {
  const bounded = await retainBoundedLiveMaterialization(args);
  if (bounded === null) {
    return null;
  }
  const acquired = await args.deps.materializations.acquireExact(args.coordinate);
  if (acquired === null) {
    throw resolutionError('newly retained bounded handle could not be acquired');
  }
  try {
    requireSameHandle(bounded.materialization, acquired.materialization);
    return new LiveMaterializationResolution({
      materialization: acquired.materialization,
      source: 'materialized',
      replayedPatchCount: bounded.patchCount,
      release: async () => await acquired.release(),
    });
  } catch (raw) {
    await releaseAcquisitionAfterFailure(acquired, args.deps.logger);
    throw raw;
  }
}

/**
 * Replays only node/edge OR-Set state into bounded CAS pages and retains those
 * roots as a partial materialization. No WarpState or whole-graph adjacency is
 * constructed.
 */
export async function retainBoundedLiveMaterialization(args: {
  readonly deps: MaterializeDeps;
  readonly coordinate: MaterializationCoordinate;
}): Promise<BoundedLiveMaterializationResult | null> {
  const { deps, coordinate } = args;
  const { openStateSession } = deps;
  if (openStateSession === undefined) {
    return null;
  }
  const workspace = await deps.materializations.openWorkspace(coordinate);
  try {
    return await buildBoundedMaterialization({
      deps,
      coordinate,
      workspace,
      openStateSession,
    });
  } catch (raw) {
    await releaseWorkspaceAfterFailure(workspace, deps.logger);
    throw raw;
  }
}

async function buildBoundedMaterialization(args: {
  readonly deps: MaterializeDeps;
  readonly coordinate: MaterializationCoordinate;
  readonly workspace: MaterializationWorkspacePort;
  readonly openStateSession: MaterializeSessionOpener;
}): Promise<BoundedLiveMaterializationResult | null> {
  const { deps, coordinate, workspace, openStateSession } = args;
  const session = await openStateSession(
    { nodeAliveRootOid: null, edgeAliveRootOid: null },
    { workspace },
  );
  try {
    const patchCount = await replayLiveness(session, deps, coordinate);
    if (patchCount === 0) {
      await session.close();
      await workspace.release();
      return null;
    }
    return await retainPreparedLiveness({
      session,
      coordinate,
      workspace,
      patchCount,
    });
  } catch (raw) {
    session.abort();
    throw raw;
  }
}

async function replayLiveness(
  session: StateSession,
  deps: MaterializeDeps,
  coordinate: MaterializationCoordinate,
): Promise<number> {
  let patchCount = 0;
  for await (const entry of deps.patches.streamForFrontier(
    coordinate.frontier(),
    coordinate.ceiling,
  )) {
    patchCount += 1;
    await applyLivenessInSession(session, entry.patch);
  }
  return patchCount;
}

async function retainPreparedLiveness(args: {
  readonly session: StateSession;
  readonly coordinate: MaterializationCoordinate;
  readonly workspace: MaterializationWorkspacePort;
  readonly patchCount: number;
}): Promise<BoundedLiveMaterializationResult> {
  const { session, coordinate, workspace, patchCount } = args;
  const prepared = await session.prepareClose();
  const materialization = await workspace.promote({
    coordinate,
    roots: livenessRoots(prepared.roots),
    stateHash: null,
  });
  prepared.accept(materialization.retention);
  await workspace.release();
  return Object.freeze({ materialization, patchCount });
}

function livenessRoots(roots: {
  readonly nodeAliveRootOid: string | null;
  readonly edgeAliveRootOid: string | null;
}): MaterializationRoots {
  return new MaterializationRoots({
    adjacency: MaterializationRoot.unavailable(),
    edgeAlive: sessionRoot(roots.edgeAliveRootOid),
    edgeBirths: MaterializationRoot.unavailable(),
    frontier: MaterializationRoot.unavailable(),
    nodeAlive: sessionRoot(roots.nodeAliveRootOid),
    properties: MaterializationRoot.unavailable(),
    provenanceSupport: MaterializationRoot.unavailable(),
    replayBasis: MaterializationRoot.unavailable(),
    roaringIndexes: MaterializationRoot.unavailable(),
  });
}

function sessionRoot(token: string | null): MaterializationRoot {
  return token === null
    ? MaterializationRoot.empty()
    : MaterializationRoot.retained(new BundleHandle(token));
}

function requireSameHandle(
  expected: MaterializationHandle,
  acquired: MaterializationHandle,
): void {
  if (
    !acquired.coordinate.equals(expected.coordinate)
    || acquired.stateHash !== expected.stateHash
    || !acquired.bundle.equals(expected.bundle)
  ) {
    throw resolutionError('newly retained handle changed before it could be acquired');
  }
}

function resolutionError(message: string): WarpError {
  return new WarpError(
    `Materialization resolution ${message}`,
    'E_MATERIALIZATION_RESUME',
  );
}
