import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Plumbing from '@git-stunts/plumbing';

import Runtime from '../../src/application/Runtime.ts';
import { createObserver } from '../../src/domain/api/ObserverRuntime.ts';
import Reading from '../../src/domain/api/Reading.ts';
import WarpCore from '../../src/domain/WarpCore.ts';
import { CURRENT_SUBSTRATE_MARKER } from '../../src/infrastructure/adapters/SubstrateVersionGate.ts';
import GitCasRepositoryAdapter from '../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import GitTimelineHistoryAdapter from '../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import WebCryptoAdapter from '../../src/infrastructure/adapters/WebCryptoAdapter.ts';
import defaultCodec from '../../src/infrastructure/codecs/CborCodec.ts';
import type { V18MigrationPlan } from './V18MigrationPlan.ts';
import {
  listV18MigrationRefs,
  v18MigrationGitText,
} from './V18MigrationGit.ts';
import V18PatchTranslator from './V18PatchTranslator.ts';
import {
  rewriteV18WriterChain,
  type V18WriterChainRewrite,
} from './V18WriterChainRewriter.ts';

const VERIFICATION_WRITER = 'v19-migration-verifier';
const VERIFICATION_NODE = 'migration:verification';
const VERIFICATION_KEY = 'status';
const VERIFICATION_VALUE = 'v19-ready';

export type V18PreparedMigration = Readonly<{
  cleanup(): Promise<void>;
  desiredRefs: Readonly<Record<string, string>>;
  rewrites: readonly V18WriterChainRewrite[];
  scratchPath: string;
}>;

/** Builds and verifies the complete migration in disposable repositories. */
export async function prepareV18MigrationScratch(options: Readonly<{
  passphrase?: string;
  plan: V18MigrationPlan;
}>): Promise<V18PreparedMigration> {
  if (options.plan.status !== 'migration-required') {
    throw new Error(`cannot prepare migration with status ${options.plan.status}`);
  }
  const scratchPath = await mkdtemp(join(tmpdir(), 'git-warp-v18-to-v19-'));
  try {
    await initializeScratch(scratchPath);
    await fetchPlanRefs(scratchPath, options.plan);
    const translator = await V18PatchTranslator.open({
      repositoryPath: scratchPath,
      ...(options.passphrase === undefined ? {} : { passphrase: options.passphrase }),
    });
    const rewrites: V18WriterChainRewrite[] = [];
    try {
      for (const writer of options.plan.writers) {
        rewrites.push(await rewriteV18WriterChain({
          graph: options.plan.graph,
          refName: writer.refName,
          repositoryPath: scratchPath,
          translator,
          writer: writer.writer,
        }));
      }
    } finally {
      await translator.close();
    }
    await deleteDerivedRefs(scratchPath, options.plan);
    await writeCurrentMarker(scratchPath, options.plan.markerRef);
    await createCurrentCheckpoint(scratchPath, options.plan.graph);
    const desiredRefs = await collectDesiredRefs(scratchPath, options.plan.graph);
    await verifyPreparedScratch(scratchPath, options.plan.graph);
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

/** Replays every promoted patch and opens the public v19 lane without appending. */
export async function verifyPromotedV19Repository(
  repositoryPath: string,
  graph: string,
): Promise<void> {
  const opened = await openScratchGraph(repositoryPath, graph, VERIFICATION_WRITER);
  try {
    await opened.graph.materialize();
  } finally {
    await opened.close();
  }
  const runtime = await Runtime.open({
    at: repositoryPath,
    writer: VERIFICATION_WRITER,
  });
  try {
    await runtime.lane(graph);
  } finally {
    await runtime.close();
  }
}

async function initializeScratch(scratchPath: string): Promise<void> {
  await v18MigrationGitText(scratchPath, ['init', '-q']);
  await v18MigrationGitText(scratchPath, [
    'config',
    'user.name',
    'git-warp v18-to-v19 migration',
  ]);
  await v18MigrationGitText(scratchPath, [
    'config',
    'user.email',
    'git-warp@example.invalid',
  ]);
}

async function fetchPlanRefs(
  scratchPath: string,
  plan: V18MigrationPlan,
): Promise<void> {
  const refs = [
    ...plan.writers.map((writer) => writer.refName),
    ...Object.keys(plan.derivedRefs),
    ...Object.keys(plan.preservedRefs),
  ];
  for (const refName of refs) {
    await v18MigrationGitText(scratchPath, [
      'fetch',
      '-q',
      '--no-tags',
      plan.repositoryPath,
      `+${refName}:${refName}`,
    ]);
  }
}

async function deleteDerivedRefs(
  scratchPath: string,
  plan: V18MigrationPlan,
): Promise<void> {
  for (const [refName, oid] of Object.entries(plan.derivedRefs)) {
    await v18MigrationGitText(scratchPath, ['update-ref', '-d', refName, oid]);
  }
}

async function writeCurrentMarker(scratchPath: string, markerRef: string): Promise<void> {
  const markerOid = await v18MigrationGitText(
    scratchPath,
    ['hash-object', '-w', '--stdin'],
    { input: CURRENT_SUBSTRATE_MARKER },
  );
  await v18MigrationGitText(scratchPath, ['update-ref', markerRef, markerOid]);
}

async function createCurrentCheckpoint(
  repositoryPath: string,
  graph: string,
): Promise<void> {
  const opened = await openScratchGraph(repositoryPath, graph, VERIFICATION_WRITER);
  try {
    await opened.graph.materialize();
    await opened.graph.createCheckpoint();
  } finally {
    await opened.close();
  }
}

async function verifyPreparedScratch(sourcePath: string, graph: string): Promise<void> {
  const verificationPath = await mkdtemp(join(tmpdir(), 'git-warp-v19-verify-'));
  try {
    await initializeScratch(verificationPath);
    for (const refName of await listV18MigrationRefs(
      sourcePath,
      `refs/warp/${graph}/`,
    )) {
      await v18MigrationGitText(verificationPath, [
        'fetch',
        '-q',
        '--no-tags',
        sourcePath,
        `+${refName}:${refName}`,
      ]);
    }
    const opened = await openScratchGraph(verificationPath, graph, VERIFICATION_WRITER);
    try {
      await opened.graph.patch((patch) => {
        patch
          .addNode(VERIFICATION_NODE)
          .setProperty(VERIFICATION_NODE, VERIFICATION_KEY, VERIFICATION_VALUE);
      });
    } finally {
      await opened.close();
    }
    await verifyPublicReading(verificationPath, graph);
  } finally {
    await rm(verificationPath, { recursive: true, force: true });
  }
}

async function verifyPublicReading(repositoryPath: string, graph: string): Promise<void> {
  const runtime = await Runtime.open({
    at: repositoryPath,
    writer: VERIFICATION_WRITER,
  });
  try {
    const lane = await runtime.lane(graph);
    const observation = lane.observe(createObserver<string>(
      'v18-to-v19.verification',
      Reading.property({ subject: VERIFICATION_NODE, key: VERIFICATION_KEY }),
      (value) => {
        if (typeof value !== 'string') {
          throw new TypeError('migration verification property must be a string');
        }
        return value;
      },
    ));
    const result = await observation.one();
    if (result.value !== VERIFICATION_VALUE) {
      throw new Error('v19 public reading did not observe the verification append');
    }
    const receipt = await observation.receipt;
    if (receipt.status !== 'completed') {
      throw new Error(`v19 public reading receipt is ${receipt.status}`);
    }
  } finally {
    await runtime.close();
  }
}

async function openScratchGraph(
  repositoryPath: string,
  graph: string,
  writer: string,
): Promise<Readonly<{
  close(): Promise<void>;
  graph: Awaited<ReturnType<typeof WarpCore.open>>;
}>> {
  const plumbing = await Plumbing.createDefault({ cwd: repositoryPath });
  const history = new GitTimelineHistoryAdapter({ plumbing });
  const storage = new GitCasRepositoryAdapter({ plumbing, history });
  try {
    const graphRuntime = await WarpCore.open({
      runtimeStorage: storage,
      stateCache: null,
      persistence: history,
      graphName: graph,
      writerId: writer,
      codec: defaultCodec,
      commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
      crypto: new WebCryptoAdapter(),
    });
    return Object.freeze({
      graph: graphRuntime,
      async close(): Promise<void> {
        try {
          await storage.close();
        } finally {
          await history.close();
        }
      },
    });
  } catch (error) {
    try {
      await storage.close();
    } finally {
      await history.close();
    }
    throw error;
  }
}

async function collectDesiredRefs(
  scratchPath: string,
  graph: string,
): Promise<Readonly<Record<string, string>>> {
  const desired: Record<string, string> = {};
  for (const refName of await listV18MigrationRefs(
    scratchPath,
    `refs/warp/${graph}/`,
  )) {
    desired[refName] = await v18MigrationGitText(
      scratchPath,
      ['rev-parse', '--verify', refName],
    );
  }
  return Object.freeze(desired);
}
