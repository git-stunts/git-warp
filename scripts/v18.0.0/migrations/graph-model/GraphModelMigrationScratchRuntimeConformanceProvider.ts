import GraphModelMigrationNotice
  from '../../../../src/domain/migrations/GraphModelMigrationNotice.ts';
import GraphModelMigrationRuntimeConformanceResult, {
  GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_FAILED,
  GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_PASSED,
} from '../../../../src/domain/migrations/GraphModelMigrationRuntimeConformanceResult.ts';
import GraphModelMigrationScratchRef
  from '../../../../src/domain/migrations/GraphModelMigrationScratchRef.ts';
import GraphModelMigrationScratchWriteResult
  from '../../../../src/domain/migrations/GraphModelMigrationScratchWriteResult.ts';
import { buildGraphModelMigrationScratchReading }
  from './GraphModelMigrationScratchReadingBuilder.ts';
import { runMigrationGit } from './GitMigrationCommandRunner.ts';

const WITNESS_ID = 'git-warp-v18-scratch-operation-readback-v1';

export type GraphModelMigrationScratchRuntimeConformanceProviderOptions = {
  readonly repositoryPath: string;
};

export type GraphModelMigrationScratchRuntimeConformanceProvider = (
  scratchWriteResult: GraphModelMigrationScratchWriteResult,
) => Promise<GraphModelMigrationRuntimeConformanceResult | null>;

/** Builds runtime conformance evidence by reading scratch operation history back from Git. */
export function createGraphModelMigrationScratchRuntimeConformanceProvider(
  options: GraphModelMigrationScratchRuntimeConformanceProviderOptions,
): GraphModelMigrationScratchRuntimeConformanceProvider {
  const repositoryPath = requireNonEmptyString(options.repositoryPath, 'repositoryPath');
  return async (scratchWriteResult) => await verifyGraphModelMigrationScratchRuntimeConformance({
    repositoryPath,
    scratchWriteResult,
  });
}

/** Verifies that scratch migration output is still readable at its expected head. */
export async function verifyGraphModelMigrationScratchRuntimeConformance(options: {
  readonly repositoryPath: string;
  readonly scratchWriteResult: GraphModelMigrationScratchWriteResult;
}): Promise<GraphModelMigrationRuntimeConformanceResult | null> {
  const repositoryPath = requireNonEmptyString(options.repositoryPath, 'repositoryPath');
  const scratchWriteResult = requireScratchWriteResult(options.scratchWriteResult);
  if (scratchWriteResult.scratchRef === null || scratchWriteResult.scratchHead === null) {
    return null;
  }
  const observedHead = await observedScratchHead(repositoryPath, scratchWriteResult.scratchRef);
  if (observedHead === null) {
    return failedResult(
      scratchWriteResult.scratchRef,
      scratchWriteResult.scratchHead,
      'E_RUNTIME_CONFORMANCE_SCRATCH_REF_UNREADABLE',
      `scratch migration ref ${scratchWriteResult.scratchRef.refName} is not readable`,
    );
  }
  if (observedHead !== scratchWriteResult.scratchHead) {
    return failedResult(
      scratchWriteResult.scratchRef,
      scratchWriteResult.scratchHead,
      'E_RUNTIME_CONFORMANCE_SCRATCH_HEAD_CHANGED',
      `scratch migration ref ${scratchWriteResult.scratchRef.refName} no longer points at expected head`,
    );
  }
  return await readBackScratchHistory(repositoryPath, scratchWriteResult);
}

async function readBackScratchHistory(
  repositoryPath: string,
  scratchWriteResult: GraphModelMigrationScratchWriteResult,
): Promise<GraphModelMigrationRuntimeConformanceResult> {
  if (scratchWriteResult.scratchRef === null || scratchWriteResult.scratchHead === null) {
    throw new GraphModelMigrationScratchRuntimeConformanceProviderError(
      'scratch output must be present before readback',
    );
  }
  try {
    const reading = await buildGraphModelMigrationScratchReading({
      repositoryPath,
      scratchRefName: scratchWriteResult.scratchRef.refName,
      readingId: 'scratch-runtime-conformance',
    });
    if (reading.facts.length !== scratchWriteResult.writtenPatches.length) {
      return failedResult(
        scratchWriteResult.scratchRef,
        scratchWriteResult.scratchHead,
        'E_RUNTIME_CONFORMANCE_SCRATCH_OPERATION_COUNT',
        'scratch readback fact count does not match written operation count',
      );
    }
    return passedResult(scratchWriteResult.scratchRef, scratchWriteResult.scratchHead, reading.facts.length);
  } catch {
    return failedResult(
      scratchWriteResult.scratchRef,
      scratchWriteResult.scratchHead,
      'E_RUNTIME_CONFORMANCE_SCRATCH_HISTORY_UNREADABLE',
      'scratch migration history cannot be read back as genesis evidence',
    );
  }
}

async function observedScratchHead(
  repositoryPath: string,
  scratchRef: GraphModelMigrationScratchRef,
): Promise<string | null> {
  const result = await runMigrationGit(
    repositoryPath,
    ['show-ref', '--verify', '--hash', scratchRef.refName],
    null,
  );
  if (!result.ok()) {
    return null;
  }
  const head = result.stdout.trim();
  if (head.length === 0) {
    return null;
  }
  return head;
}

function passedResult(
  scratchRef: GraphModelMigrationScratchRef,
  scratchHead: string,
  factCount: number,
): GraphModelMigrationRuntimeConformanceResult {
  return new GraphModelMigrationRuntimeConformanceResult({
    scratchRef,
    scratchHead,
    status: GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_PASSED,
    witness: `${WITNESS_ID} facts=${factCount}`,
    fatalErrors: [],
  });
}

function failedResult(
  scratchRef: GraphModelMigrationScratchRef,
  scratchHead: string,
  code: string,
  message: string,
): GraphModelMigrationRuntimeConformanceResult {
  return new GraphModelMigrationRuntimeConformanceResult({
    scratchRef,
    scratchHead,
    status: GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_FAILED,
    witness: WITNESS_ID,
    fatalErrors: [GraphModelMigrationNotice.fatal(code, message)],
  });
}

function requireScratchWriteResult(
  scratchWriteResult: GraphModelMigrationScratchWriteResult,
): GraphModelMigrationScratchWriteResult {
  if (!(scratchWriteResult instanceof GraphModelMigrationScratchWriteResult)) {
    throw new GraphModelMigrationScratchRuntimeConformanceProviderError(
      'scratchWriteResult must be a GraphModelMigrationScratchWriteResult',
    );
  }
  return scratchWriteResult;
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new GraphModelMigrationScratchRuntimeConformanceProviderError(`${name} must be a non-empty string`);
  }
  return value;
}

export class GraphModelMigrationScratchRuntimeConformanceProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphModelMigrationScratchRuntimeConformanceProviderError';
  }
}
