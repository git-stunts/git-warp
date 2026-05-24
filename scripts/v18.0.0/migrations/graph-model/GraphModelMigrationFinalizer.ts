import GraphModelMigrationFinalizationResult, {
  GRAPH_MODEL_MIGRATION_FINALIZATION_BLOCKED,
  GRAPH_MODEL_MIGRATION_FINALIZATION_COMPLETED,
  GRAPH_MODEL_MIGRATION_FINALIZATION_PARTIAL_ARCHIVE,
} from '../../../../src/domain/migrations/GraphModelMigrationFinalizationResult.ts';
import GraphModelMigrationFinalizationSafetyResult
  from '../../../../src/domain/migrations/GraphModelMigrationFinalizationSafetyResult.ts';
import GraphModelMigrationNotice
  from '../../../../src/domain/migrations/GraphModelMigrationNotice.ts';
import { runMigrationGit } from './GitMigrationCommandRunner.ts';

const ZERO_OID = '0000000000000000000000000000000000000000';

export type GraphModelMigrationFinalizerOptions = {
  readonly repositoryPath: string;
  readonly safetyResult: GraphModelMigrationFinalizationSafetyResult;
};

export class GraphModelMigrationFinalizerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphModelMigrationFinalizerError';
  }
}

/** Finalizes a safety-approved scratch migration through archive-preserving Git ref updates. */
export async function finalizeGraphModelMigration(
  options: GraphModelMigrationFinalizerOptions,
): Promise<GraphModelMigrationFinalizationResult> {
  const repositoryPath = requireNonEmptyString(options.repositoryPath, 'repositoryPath');
  const safetyResult = requireSafetyResult(options.safetyResult);
  const request = safetyResult.request;
  if (!safetyResult.allowsFinalization()) {
    return blockedResult(request.liveRefName, request.archiveRefName, safetyResult.fatalErrors);
  }

  const archiveRefName = requireFinalizationString(request.archiveRefName, 'archiveRefName');
  const expectedLiveHead = requireFinalizationString(request.expectedLiveHead, 'expectedLiveHead');
  const scratchHead = requireFinalizationString(request.scratchHead, 'scratchHead');
  const currentLiveHead = await gitTextOrNull(repositoryPath, [
    'show-ref',
    '--verify',
    '--hash',
    request.liveRefName,
  ]);
  if (currentLiveHead !== expectedLiveHead) {
    return blockedResult(request.liveRefName, archiveRefName, [
      GraphModelMigrationNotice.fatal(
        'E_STALE_LIVE_REF_EXPECTATION',
        'migration finalization live ref changed before archive creation',
      ),
    ]);
  }
  if (await refExists(repositoryPath, archiveRefName)) {
    return blockedResult(request.liveRefName, archiveRefName, [
      GraphModelMigrationNotice.fatal(
        'E_ARCHIVE_REF_EXISTS',
        `migration archive ref already exists: ${archiveRefName}`,
      ),
    ]);
  }

  const archiveUpdate = await runMigrationGit(
    repositoryPath,
    ['update-ref', archiveRefName, expectedLiveHead, ZERO_OID],
    null,
  );
  if (!archiveUpdate.ok()) {
    return blockedResult(request.liveRefName, archiveRefName, [
      GraphModelMigrationNotice.fatal(
        'E_ARCHIVE_REF_UPDATE_FAILED',
        'migration finalization could not create archive ref',
      ),
    ]);
  }

  const liveUpdate = await runMigrationGit(
    repositoryPath,
    ['update-ref', request.liveRefName, scratchHead, expectedLiveHead],
    null,
  );
  if (!liveUpdate.ok()) {
    return new GraphModelMigrationFinalizationResult({
      status: GRAPH_MODEL_MIGRATION_FINALIZATION_PARTIAL_ARCHIVE,
      liveRefName: request.liveRefName,
      archiveRefName,
      previousLiveHead: expectedLiveHead,
      finalizedLiveHead: null,
      fatalErrors: [
        GraphModelMigrationNotice.fatal(
          'E_LIVE_REF_UPDATE_FAILED',
          'migration finalization archived old lineage but could not advance live ref',
        ),
      ],
    });
  }

  return new GraphModelMigrationFinalizationResult({
    status: GRAPH_MODEL_MIGRATION_FINALIZATION_COMPLETED,
    liveRefName: request.liveRefName,
    archiveRefName,
    previousLiveHead: expectedLiveHead,
    finalizedLiveHead: scratchHead,
    fatalErrors: [],
  });
}

function blockedResult(
  liveRefName: string,
  archiveRefName: string | null,
  fatalErrors: readonly GraphModelMigrationNotice[],
): GraphModelMigrationFinalizationResult {
  return new GraphModelMigrationFinalizationResult({
    status: GRAPH_MODEL_MIGRATION_FINALIZATION_BLOCKED,
    liveRefName,
    archiveRefName,
    previousLiveHead: null,
    finalizedLiveHead: null,
    fatalErrors,
  });
}

function requireSafetyResult(
  safetyResult: GraphModelMigrationFinalizationSafetyResult,
): GraphModelMigrationFinalizationSafetyResult {
  if (!(safetyResult instanceof GraphModelMigrationFinalizationSafetyResult)) {
    throw new GraphModelMigrationFinalizerError(
      'safetyResult must be a GraphModelMigrationFinalizationSafetyResult',
    );
  }
  return safetyResult;
}

function requireFinalizationString(value: string | null, name: string): string {
  if (value === null || value.trim().length === 0) {
    throw new GraphModelMigrationFinalizerError(`${name} must be present after safety approval`);
  }
  return value;
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new GraphModelMigrationFinalizerError(`${name} must be a non-empty string`);
  }
  return value;
}

async function refExists(repositoryPath: string, refName: string): Promise<boolean> {
  const result = await runMigrationGit(repositoryPath, ['show-ref', '--verify', '--hash', refName], null);
  return result.ok();
}

async function gitTextOrNull(cwd: string, args: readonly string[]): Promise<string | null> {
  const result = await runMigrationGit(cwd, args, null);
  if (!result.ok()) {
    return null;
  }
  return result.stdout.trim();
}
