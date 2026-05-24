import GraphModelMigrationNotice from '../../../../src/domain/migrations/GraphModelMigrationNotice.ts';
import GraphModelMigrationRuntimeConformanceResult, {
  GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_FAILED,
  GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_PASSED,
} from '../../../../src/domain/migrations/GraphModelMigrationRuntimeConformanceResult.ts';
import GraphModelMigrationRuntimeReplayRequest
  from '../../../../src/domain/migrations/GraphModelMigrationRuntimeReplayRequest.ts';
import GraphModelMigrationRuntimeReplayResult, {
  GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_FAILED,
  GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_PASSED,
} from '../../../../src/domain/migrations/GraphModelMigrationRuntimeReplayResult.ts';
import GraphModelMigrationScratchWriteResult
  from '../../../../src/domain/migrations/GraphModelMigrationScratchWriteResult.ts';
import {
  GraphModelMigrationScratchRuntimeReplayerError,
  replayVerifiedGraphModelMigrationScratchIntoRuntime,
} from './GraphModelMigrationScratchRuntimeReplayer.ts';

const WITNESS_ID = 'git-warp-v18-production-runtime-scratch-replay-v1';
const GENERIC_RUNTIME_REPLAY_FAILED_CODE = 'E_RUNTIME_REPLAY_FAILED';

export type GraphModelMigrationProductionRuntimeReplayProviderOptions = {
  readonly sourceRepositoryPath: string;
  readonly graphId: string;
  readonly writerId?: string;
  readonly runtimeRepositoryPath?: string | null;
};

/** Builds finalization conformance evidence from production-runtime replay. */
export function createGraphModelMigrationProductionRuntimeConformanceProvider(
  options: GraphModelMigrationProductionRuntimeReplayProviderOptions,
): (scratchWriteResult: GraphModelMigrationScratchWriteResult) =>
  Promise<GraphModelMigrationRuntimeConformanceResult | null> {
  const checked = checkedProviderOptions(options);
  return async (scratchWriteResult) => {
    if (!(scratchWriteResult instanceof GraphModelMigrationScratchWriteResult)) {
      throw new GraphModelMigrationProductionRuntimeReplayProviderError(
        'scratchWriteResult must be a GraphModelMigrationScratchWriteResult',
      );
    }
    if (scratchWriteResult.scratchRef === null || scratchWriteResult.scratchHead === null) {
      return null;
    }
    const replayResult = await verifyGraphModelMigrationProductionRuntimeReplay({
      ...checked,
      request: new GraphModelMigrationRuntimeReplayRequest({
        graphId: checked.graphId,
        writerId: checked.writerId,
        scratchRef: scratchWriteResult.scratchRef,
        scratchHead: scratchWriteResult.scratchHead,
      }),
    });
    return runtimeConformanceFromReplay(replayResult);
  };
}

/** Verifies scratch output by replaying it through normal git-warp runtime. */
export async function verifyGraphModelMigrationProductionRuntimeReplay(options: {
  readonly sourceRepositoryPath: string;
  readonly runtimeRepositoryPath?: string | null;
  readonly request: GraphModelMigrationRuntimeReplayRequest;
}): Promise<GraphModelMigrationRuntimeReplayResult> {
  const sourceRepositoryPath = requireNonEmptyString(options.sourceRepositoryPath, 'sourceRepositoryPath');
  const request = requireReplayRequest(options.request);
  try {
    const replay = await replayVerifiedGraphModelMigrationScratchIntoRuntime({
      sourceRepositoryPath,
      runtimeRepositoryPath: options.runtimeRepositoryPath ?? null,
      request,
    });
    return passedReplay(request, replay.operationCount);
  } catch (error) {
    return failedReplay(
      request,
      0,
      error instanceof GraphModelMigrationScratchRuntimeReplayerError
        ? error.code
        : GENERIC_RUNTIME_REPLAY_FAILED_CODE,
      error instanceof Error ? error.message : 'production runtime replay failed',
    );
  }
}

function runtimeConformanceFromReplay(
  replayResult: GraphModelMigrationRuntimeReplayResult,
): GraphModelMigrationRuntimeConformanceResult {
  return new GraphModelMigrationRuntimeConformanceResult({
    scratchRef: replayResult.request.scratchRef,
    scratchHead: replayResult.request.scratchHead,
    status: replayResult.allowsFinalization()
      ? GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_PASSED
      : GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_FAILED,
    witness: replayResult.witness,
    fatalErrors: replayResult.fatalErrors,
  });
}

function passedReplay(
  request: GraphModelMigrationRuntimeReplayRequest,
  replayedOperationCount: number,
): GraphModelMigrationRuntimeReplayResult {
  return new GraphModelMigrationRuntimeReplayResult({
    request,
    status: GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_PASSED,
    witness: `${WITNESS_ID} operations=${replayedOperationCount}`,
    replayedOperationCount,
    fatalErrors: [],
  });
}

function failedReplay(
  request: GraphModelMigrationRuntimeReplayRequest,
  replayedOperationCount: number,
  code: string,
  message: string,
): GraphModelMigrationRuntimeReplayResult {
  return new GraphModelMigrationRuntimeReplayResult({
    request,
    status: GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_FAILED,
    witness: WITNESS_ID,
    replayedOperationCount,
    fatalErrors: [GraphModelMigrationNotice.fatal(code, message)],
  });
}

function checkedProviderOptions(
  options: GraphModelMigrationProductionRuntimeReplayProviderOptions,
): Required<Pick<GraphModelMigrationProductionRuntimeReplayProviderOptions, 'sourceRepositoryPath' | 'graphId'>>
  & { readonly writerId: string; readonly runtimeRepositoryPath: string | null } {
  return Object.freeze({
    sourceRepositoryPath: requireNonEmptyString(options.sourceRepositoryPath, 'sourceRepositoryPath'),
    graphId: requireNonEmptyString(options.graphId, 'graphId'),
    writerId: requireNonEmptyString(options.writerId ?? 'scratch-migration', 'writerId'),
    runtimeRepositoryPath: options.runtimeRepositoryPath ?? null,
  });
}

function requireReplayRequest(
  request: GraphModelMigrationRuntimeReplayRequest,
): GraphModelMigrationRuntimeReplayRequest {
  if (!(request instanceof GraphModelMigrationRuntimeReplayRequest)) {
    throw new GraphModelMigrationProductionRuntimeReplayProviderError(
      'request must be a GraphModelMigrationRuntimeReplayRequest',
    );
  }
  return request;
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new GraphModelMigrationProductionRuntimeReplayProviderError(`${name} must be a non-empty string`);
  }
  return value;
}

export class GraphModelMigrationProductionRuntimeReplayProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphModelMigrationProductionRuntimeReplayProviderError';
  }
}
