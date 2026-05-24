import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import GraphModelMigrationBasis from '../../../../src/domain/migrations/GraphModelMigrationBasis.ts';
import GraphModelMigrationContentSource
  from '../../../../src/domain/migrations/GraphModelMigrationContentSource.ts';
import GraphModelMigrationNotice from '../../../../src/domain/migrations/GraphModelMigrationNotice.ts';
import GraphModelMigrationPatchDescriptor
  from '../../../../src/domain/migrations/GraphModelMigrationPatchDescriptor.ts';
import GraphModelMigrationSourceInventory
  from '../../../../src/domain/migrations/GraphModelMigrationSourceInventory.ts';
import GraphModelMigrationWriterChainDescriptor
  from '../../../../src/domain/migrations/GraphModelMigrationWriterChainDescriptor.ts';
import V17GoldenGraphFixtureManifest, {
  V17_GOLDEN_CONTENT_FACT,
} from '../../../../src/domain/migrations/V17GoldenGraphFixtureManifest.ts';
import { compareStrings } from '../../../../src/domain/utils/StringComparison.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC }
  from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';

const execFileAsync = promisify(execFile);
const NO_WRITER_REFS_CODE = 'E_NO_WRITER_REFS';
const NON_PATCH_COMMIT_CODE = 'E_NON_PATCH_COMMIT';
const WRONG_GRAPH_CODE = 'E_WRONG_GRAPH';
const WRONG_WRITER_CODE = 'E_WRONG_WRITER';

export type GraphModelMigrationSourceInventoryCollectorOptions = {
  readonly repositoryPath: string;
  readonly graphId: string;
  readonly fixtureManifest?: V17GoldenGraphFixtureManifest | null;
};

/** Collects v18 migration source inventory from real restored graph-history refs. */
export async function collectGraphModelMigrationSourceInventory(
  options: GraphModelMigrationSourceInventoryCollectorOptions,
): Promise<GraphModelMigrationSourceInventory> {
  const repositoryPath = requireNonEmptyString(options.repositoryPath, 'repositoryPath');
  const graphId = requireNonEmptyString(options.graphId, 'graphId');
  const refNames = await listWriterRefs(repositoryPath, graphId);
  if (refNames.length === 0) {
    return emptyInventory(graphId, NO_WRITER_REFS_CODE, `no writer refs found for graph ${graphId}`);
  }

  const fatalErrors: GraphModelMigrationNotice[] = [];
  const writerChains: GraphModelMigrationWriterChainDescriptor[] = [];
  const patchDescriptors: GraphModelMigrationPatchDescriptor[] = [];
  const basisParts: string[] = [];

  for (const refName of refNames) {
    const writerId = writerIdFromRef(refName, graphId);
    const patchIds = await gitLines(repositoryPath, ['rev-list', '--reverse', refName]);
    const expectedWriter = writerId;
    await collectPatchDescriptors({
      repositoryPath,
      graphId,
      writerId: expectedWriter,
      patchIds,
      patchDescriptors,
      fatalErrors,
    });
    writerChains.push(new GraphModelMigrationWriterChainDescriptor({
      writerId,
      patchIds,
    }));
    const head = await gitText(repositoryPath, ['rev-parse', '--verify', refName]);
    basisParts.push(`${refName}@${head}`);
  }

  const sourceBasis = fatalErrors.length === 0
    ? new GraphModelMigrationBasis({
      graphId,
      basisId: basisParts.sort(compareStrings).join('|'),
    })
    : null;

  return new GraphModelMigrationSourceInventory({
    graphId,
    sourceBasis,
    writerChains,
    patchDescriptors,
    stateSnapshot: null,
    contentSources: collectContentSources(options.fixtureManifest ?? null),
    warnings: [],
    fatalErrors,
  });
}

async function collectPatchDescriptors(options: {
  readonly repositoryPath: string;
  readonly graphId: string;
  readonly writerId: string;
  readonly patchIds: readonly string[];
  readonly patchDescriptors: GraphModelMigrationPatchDescriptor[];
  readonly fatalErrors: GraphModelMigrationNotice[];
}): Promise<void> {
  let sequence = 0;
  for (const patchId of options.patchIds) {
    await verifyPatchCommit(options.repositoryPath, options.graphId, options.writerId, patchId, options.fatalErrors);
    options.patchDescriptors.push(new GraphModelMigrationPatchDescriptor({
      patchId,
      writerId: options.writerId,
      writerSequence: sequence,
    }));
    sequence += 1;
  }
}

async function verifyPatchCommit(
  repositoryPath: string,
  graphId: string,
  writerId: string,
  patchId: string,
  fatalErrors: GraphModelMigrationNotice[],
): Promise<void> {
  const message = await gitText(repositoryPath, ['show', '-s', '--format=%B', patchId]);
  try {
    const decoded = DEFAULT_COMMIT_MESSAGE_CODEC.decodePatch(message);
    if (decoded.graph !== graphId) {
      fatalErrors.push(GraphModelMigrationNotice.fatal(
        WRONG_GRAPH_CODE,
        `patch ${patchId} belongs to graph ${decoded.graph}, expected ${graphId}`,
      ));
    }
    if (decoded.writer !== writerId) {
      fatalErrors.push(GraphModelMigrationNotice.fatal(
        WRONG_WRITER_CODE,
        `patch ${patchId} belongs to writer ${decoded.writer}, expected ${writerId}`,
      ));
    }
  } catch {
    fatalErrors.push(GraphModelMigrationNotice.fatal(
      NON_PATCH_COMMIT_CODE,
      `patch ${patchId} does not decode as a v17 patch commit`,
    ));
  }
}

function collectContentSources(
  fixtureManifest: V17GoldenGraphFixtureManifest | null,
): readonly GraphModelMigrationContentSource[] {
  if (fixtureManifest === null) {
    return Object.freeze([]);
  }
  return Object.freeze(fixtureManifest.visibleFacts
    .filter((fact) => fact.kind === V17_GOLDEN_CONTENT_FACT)
    .map((fact) => new GraphModelMigrationContentSource({
      legacyContentKey: fact.key,
      contentOid: `fixture-content:${fact.key}`,
    })));
}

async function listWriterRefs(repositoryPath: string, graphId: string): Promise<readonly string[]> {
  const lines = await gitLines(repositoryPath, [
    'for-each-ref',
    '--format=%(refname)',
    `refs/warp/${graphId}/writers/`,
  ]);
  return Object.freeze([...lines].sort(compareStrings));
}

function emptyInventory(
  graphId: string,
  code: string,
  message: string,
): GraphModelMigrationSourceInventory {
  return new GraphModelMigrationSourceInventory({
    graphId,
    sourceBasis: null,
    writerChains: [],
    patchDescriptors: [],
    stateSnapshot: null,
    contentSources: [],
    warnings: [],
    fatalErrors: [GraphModelMigrationNotice.fatal(code, message)],
  });
}

function writerIdFromRef(refName: string, graphId: string): string {
  const prefix = `refs/warp/${graphId}/writers/`;
  if (!refName.startsWith(prefix)) {
    throw new Error(`writer ref ${refName} is outside ${prefix}`);
  }
  return requireNonEmptyString(refName.slice(prefix.length), 'writerId');
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

async function gitLines(cwd: string, args: readonly string[]): Promise<readonly string[]> {
  const output = await gitText(cwd, args);
  if (output.length === 0) {
    return Object.freeze([]);
  }
  return Object.freeze(output.split('\n').filter((line) => line.length > 0));
}

async function gitText(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', args, { cwd });
  return result.stdout.trim();
}
