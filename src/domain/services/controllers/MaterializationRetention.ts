import MaterializationCoordinate from '../../materialization/MaterializationCoordinate.ts';
import type MaterializationHandle from '../../materialization/MaterializationHandle.ts';
import WarpError from '../../errors/WarpError.ts';
import {
  materializationSessionOpen,
} from './MaterializeSessionBridge.ts';
import type {
  MaterializeReduceOutput,
} from './MaterializeController.ts';
import type { MaterializeDeps } from './MaterializeDeps.ts';
import type {
  MaterializeResultBuildInput,
} from './MaterializeStrategyRuntime.ts';

/** Publishes session roots through their git-cas workspace retention scope. */
export async function resolveMaterializationRetention(input: {
  readonly deps: MaterializeDeps;
  readonly params: MaterializeResultBuildInput;
  readonly stateHash: string;
}): Promise<MaterializationHandle | undefined> {
  const retained = resolveExistingMaterialization(input.params, input.stateHash);
  return retained ?? await publishMaterialization(input);
}

function resolveExistingMaterialization(
  params: MaterializeResultBuildInput,
  stateHash: string,
): MaterializationHandle | undefined {
  const retained = params.materialization;
  if (retained === undefined) {
    return undefined;
  }
  if (retained.stateHash !== stateHash) {
    throw retentionError('retained handle state hash does not match resumed state');
  }
  if (!rootsMatch(params, retained)) {
    return undefined;
  }
  params.reduced.acceptMaterialization?.(retained.retention);
  return retained;
}

function rootsMatch(
  params: MaterializeResultBuildInput,
  retained: MaterializationHandle,
): boolean {
  return params.reduced.roots === undefined
    || retained.roots.equals(params.reduced.roots);
}

async function publishMaterialization(input: {
  readonly deps: MaterializeDeps;
  readonly params: MaterializeResultBuildInput;
  readonly stateHash: string;
}): Promise<MaterializationHandle | undefined> {
  const { params } = input;
  if (params.reduced.roots === undefined || params.frontier === null) {
    await acceptSessionWithoutMaterialization(params.reduced);
    return undefined;
  }
  const request = {
    coordinate: new MaterializationCoordinate({
      frontier: params.frontier,
      ceiling: params.ceiling,
    }),
    roots: params.reduced.roots,
    stateHash: input.stateHash,
    replayBasis: params.reduced.state,
  };
  const materialization = params.reduced.workspace === undefined
    ? await input.deps.materializations.retain(request)
    : await params.reduced.workspace.promote(request);
  params.reduced.acceptMaterialization?.(materialization.retention);
  return materialization;
}

async function acceptSessionWithoutMaterialization(
  reduced: MaterializeReduceOutput,
): Promise<void> {
  if (reduced.acceptMaterialization === undefined) {
    return;
  }
  if (reduced.roots === undefined || reduced.workspace === undefined) {
    throw retentionError('prepared session is missing roots or workspace retention');
  }
  const roots = materializationSessionOpen(reduced.roots);
  if (roots === null) {
    throw retentionError('prepared session roots cannot be checkpointed');
  }
  const witness = await reduced.workspace.checkpoint({
    nodeAliveRoot: roots.nodeAliveRootOid,
    edgeAliveRoot: roots.edgeAliveRootOid,
  });
  reduced.acceptMaterialization(witness);
}

function retentionError(message: string): WarpError {
  return new WarpError(message, 'E_MATERIALIZATION_RESUME');
}
