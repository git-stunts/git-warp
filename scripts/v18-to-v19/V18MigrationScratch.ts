import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildCheckpointRef } from '../../src/domain/utils/RefLayout.ts';
import { CURRENT_SUBSTRATE_MARKER } from '../../src/infrastructure/adapters/SubstrateVersionGate.ts';
import { completeWithCleanup } from '../../src/infrastructure/adapters/OperationCleanup.ts';
import { seedV18Checkpoint } from './V18CheckpointSeed.ts';
import type { V18MigrationPlan } from './V18MigrationPlan.ts';
import { listV18MigrationRefs, v18MigrationGitText } from './V18MigrationGit.ts';
import { V18MigrationGitCommitWriter } from './V18MigrationGitCommitWriter.ts';
import { V18MigrationGitObjectReader } from './V18MigrationGitObjectReader.ts';
import V18PatchTranslator from './V18PatchTranslator.ts';
import { rewriteV18WriterChain, type V18WriterChainRewrite } from './V18WriterChainRewriter.ts';
import {
  reportV18MigrationProgress,
  type V18MigrationProgressReporter,
} from './V18MigrationProgress.ts';
import {
  appendAndVerifyV18MigrationReading,
  V18_MIGRATION_VERIFICATION_WRITER,
} from './V18MigrationPublicReadingVerification.ts';
import { openScratchGraph } from './V18MigrationScratchGraph.ts';

export type V18PreparedMigration = Readonly<{
  cleanup(): Promise<void>;
  desiredRefs: Readonly<Record<string, string>>;
  rewrites: readonly V18WriterChainRewrite[];
  scratchPath: string;
}>;

/** Builds and verifies the complete migration in disposable repositories. */
export async function prepareV18MigrationScratch(
  options: Readonly<{
    passphrase?: string;
    plan: V18MigrationPlan;
    progress?: V18MigrationProgressReporter;
    scratchRoot?: string;
  }>
): Promise<V18PreparedMigration> {
  if (options.plan.status !== 'migration-required') {
    throw new Error(`cannot prepare migration with status ${options.plan.status}`);
  }
  const scratchRoot = options.scratchRoot ?? tmpdir();
  const scratchPath = await mkdtemp(join(scratchRoot, 'git-warp-v18-to-v19-'));
  try {
    reportV18MigrationProgress(options.progress, {
      message: 'initializing disposable repository',
      phase: 'scratch',
    });
    await initializeScratch(scratchPath);
    await fetchPlanRefs(scratchPath, options.plan);
    const objectReader = new V18MigrationGitObjectReader(scratchPath);
    let translator: V18PatchTranslator | null = null;
    let commitWriter: V18MigrationGitCommitWriter | null = null;
    const rewrites: V18WriterChainRewrite[] = [];
    const commitMap = new Map<string, string>();
    let seededCheckpointRef: string | null = null;
    await completeWithCleanup(
      async () => {
        translator = await V18PatchTranslator.open({
          objectReader,
          repositoryPath: scratchPath,
          ...(options.passphrase === undefined ? {} : { passphrase: options.passphrase }),
        });
        commitWriter = new V18MigrationGitCommitWriter(scratchPath);
        for (const writer of options.plan.writers) {
          rewrites.push(
            await rewriteV18WriterChain({
              commitWriter,
              commitMap,
              graph: options.plan.graph,
              objectReader,
              ...(options.progress === undefined ? {} : { progress: options.progress }),
              refName: writer.refName,
              repositoryPath: scratchPath,
              translator,
              writer: writer.writer,
            })
          );
        }
        reportV18MigrationProgress(options.progress, {
          message: 'publishing current substrate marker',
          phase: 'scratch',
        });
        await writeCurrentMarker(scratchPath, options.plan.markerRef);
        const checkpointRef = buildCheckpointRef(options.plan.graph);
        const seed = await seedV18Checkpoint({
          commitMap,
          graph: options.plan.graph,
          legacyCheckpointSha: options.plan.derivedRefs[checkpointRef] ?? null,
          ...(options.progress === undefined ? {} : { progress: options.progress }),
          repositoryPath: scratchPath,
          translator,
        });
        seededCheckpointRef = seed.status === 'seeded' ? seed.checkpointRef : null;
      },
      async () => {
        await closeScratchResources(commitWriter, objectReader, translator);
      },
      'v18 scratch migration and resource cleanup both failed'
    );
    reportV18MigrationProgress(options.progress, {
      message: 'retiring superseded derived refs',
      phase: 'scratch',
    });
    await deleteDerivedRefs(scratchPath, options.plan, seededCheckpointRef);
    if (seededCheckpointRef === null) {
      await createCurrentCheckpoint(scratchPath, options.plan.graph, options.progress);
    }
    const desiredRefs = await collectDesiredRefs(scratchPath, options.plan.graph);
    reportV18MigrationProgress(options.progress, {
      message: 'proving reopen, append, public reading, and receipt',
      phase: 'verify',
    });
    await verifyRepositoryInDisposableCopy(scratchPath, options.plan.graph, scratchRoot);
    return Object.freeze({
      async cleanup(): Promise<void> {
        await rm(scratchPath, { recursive: true, force: true });
      },
      desiredRefs,
      rewrites: Object.freeze(rewrites),
      scratchPath,
    });
  } catch (error) {
    await rm(scratchPath, { recursive: true, force: true });
    throw error;
  }
}

/** Verifies promoted refs through a disposable append and bounded public reading. */
export async function verifyPromotedV19Repository(
  repositoryPath: string,
  graph: string,
  scratchRoot = tmpdir()
): Promise<void> {
  await verifyRepositoryInDisposableCopy(repositoryPath, graph, scratchRoot);
}

async function initializeScratch(scratchPath: string): Promise<void> {
  await v18MigrationGitText(scratchPath, ['init', '-q']);
  await v18MigrationGitText(scratchPath, ['config', 'user.name', 'git-warp v18-to-v19 migration']);
  await v18MigrationGitText(scratchPath, ['config', 'user.email', 'git-warp@example.invalid']);
}

async function fetchPlanRefs(scratchPath: string, plan: V18MigrationPlan): Promise<void> {
  const refs = [
    ...plan.writers.map((writer) => writer.refName),
    ...Object.keys(plan.derivedRefs),
    ...Object.keys(plan.preservedRefs),
  ];
  await fetchMigrationRefs(scratchPath, plan.repositoryPath, refs);
}

async function deleteDerivedRefs(
  scratchPath: string,
  plan: V18MigrationPlan,
  preservedRef: string | null
): Promise<void> {
  for (const [refName, oid] of Object.entries(plan.derivedRefs)) {
    if (refName === preservedRef) {
      continue;
    }
    await v18MigrationGitText(scratchPath, ['update-ref', '-d', refName, oid]);
  }
}

async function writeCurrentMarker(scratchPath: string, markerRef: string): Promise<void> {
  const markerOid = await v18MigrationGitText(scratchPath, ['hash-object', '-w', '--stdin'], {
    input: CURRENT_SUBSTRATE_MARKER,
  });
  await v18MigrationGitText(scratchPath, ['update-ref', markerRef, markerOid]);
}

async function createCurrentCheckpoint(
  repositoryPath: string,
  graph: string,
  progress?: V18MigrationProgressReporter
): Promise<void> {
  const opened = await openScratchGraph(repositoryPath, graph, V18_MIGRATION_VERIFICATION_WRITER);
  try {
    reportV18MigrationProgress(progress, {
      message: 'materializing writer history without a checkpoint seed',
      phase: 'scratch',
    });
    await opened.graph.materialize();
    reportV18MigrationProgress(progress, {
      message: 'publishing checkpoint from full writer history',
      phase: 'scratch',
    });
    await opened.graph.createCheckpoint();
  } finally {
    await opened.close();
  }
}

async function verifyRepositoryInDisposableCopy(
  sourcePath: string,
  graph: string,
  scratchRoot: string
): Promise<void> {
  const verificationPath = await mkdtemp(join(scratchRoot, 'git-warp-v19-verify-'));
  try {
    await initializeScratch(verificationPath);
    const refs = await listV18MigrationRefs(sourcePath, `refs/warp/${graph}/`);
    await fetchMigrationRefs(verificationPath, sourcePath, refs);
    await appendAndVerifyV18MigrationReading(verificationPath, graph);
  } finally {
    await rm(verificationPath, { recursive: true, force: true });
  }
}

async function collectDesiredRefs(
  scratchPath: string,
  graph: string
): Promise<Readonly<Record<string, string>>> {
  const desired: Record<string, string> = {};
  for (const refName of await listV18MigrationRefs(scratchPath, `refs/warp/${graph}/`)) {
    desired[refName] = await v18MigrationGitText(scratchPath, ['rev-parse', '--verify', refName]);
  }
  return Object.freeze(desired);
}

async function fetchMigrationRefs(
  repositoryPath: string,
  sourcePath: string,
  refs: readonly string[]
): Promise<void> {
  if (refs.length === 0) {
    return;
  }
  await v18MigrationGitText(repositoryPath, [
    'fetch',
    '-q',
    '--no-tags',
    sourcePath,
    ...refs.map((refName) => `+${refName}:${refName}`),
  ]);
}

async function closeScratchResources(
  commitWriter: V18MigrationGitCommitWriter | null,
  objectReader: V18MigrationGitObjectReader,
  translator: V18PatchTranslator | null
): Promise<void> {
  const results = await Promise.allSettled([
    ...(commitWriter === null ? [] : [commitWriter.close()]),
    objectReader.close(),
    ...(translator === null ? [] : [translator.close()]),
  ]);
  const failures = results
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => result.reason);
  if (failures.length === 1) {
    throw failures[0];
  }
  if (failures.length > 1) {
    throw new AggregateError(failures, 'v18 scratch resources failed to close');
  }
}
