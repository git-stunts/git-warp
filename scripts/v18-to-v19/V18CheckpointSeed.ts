import { LWWRegister } from '../../src/domain/crdt/LWW.ts';
import { createCheckpointEnvelope } from '../../src/domain/services/state/checkpointCreate.ts';
import {
  isCurrentCheckpointSchema,
} from '../../src/domain/services/state/checkpointHelpers.ts';
import { computeStateHash } from '../../src/domain/services/state/StateSerializer.ts';
import WarpState from '../../src/domain/services/state/WarpState.ts';
import { buildCheckpointRef } from '../../src/domain/utils/RefLayout.ts';
import GitCasRepositoryAdapter from '../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import GitTimelineHistoryAdapter from '../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import { openDefaultGitPlumbing } from '../../src/infrastructure/adapters/GitPlumbingRuntimeAdapter.ts';
import defaultCrypto from '../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import defaultCodec from '../../src/infrastructure/codecs/CborCodec.ts';
import type { PropValue } from '../../src/domain/types/PropValue.ts';
import { retainMigratedCheckpoint } from '../migrations/v17.0.0/CheckpointMaterializationMigration.ts';
import {
  decodeCheckpointMigrationMessage,
} from '../migrations/v17.0.0/LegacyCheckpointCommitMessageCodec.ts';
import LegacyCheckpointStorageReader, {
  hasCurrentCheckpointStorage,
  requireMigratableLegacyStorage,
} from '../migrations/v17.0.0/LegacyCheckpointStorageReader.ts';
import { openCheckpointMigrationStore } from '../migrations/v17.0.0/openCheckpointMigrationStore.ts';
import {
  reportV18MigrationProgress,
  type V18MigrationProgressReporter,
} from './V18MigrationProgress.ts';
import V18PatchTranslator from './V18PatchTranslator.ts';

export type V18CheckpointSeedResult = Readonly<{
  checkpointRef: string;
  checkpointSha: string | null;
  status: 'seeded' | 'unavailable';
}>;

/** Converts a v18 checkpoint into a current retained replay basis. */
export async function seedV18Checkpoint(options: Readonly<{
  commitMap: ReadonlyMap<string, string>;
  graph: string;
  legacyCheckpointSha: string | null;
  progress?: V18MigrationProgressReporter;
  repositoryPath: string;
  translator: V18PatchTranslator;
}>): Promise<V18CheckpointSeedResult> {
  const checkpointRef = buildCheckpointRef(options.graph);
  if (options.legacyCheckpointSha === null) {
    return { checkpointRef, checkpointSha: null, status: 'unavailable' };
  }
  const plumbing = await openDefaultGitPlumbing(options.repositoryPath);
  const history = new GitTimelineHistoryAdapter({ plumbing });
  let repository: GitCasRepositoryAdapter | null = null;
  let operationFailed = false;
  try {
    const message = decodeCheckpointMigrationMessage(
      await history.showNode(options.legacyCheckpointSha),
    );
    if (message.graph !== options.graph) {
      throw new Error(
        `checkpoint ${options.legacyCheckpointSha} belongs to graph ${message.graph}`,
      );
    }
    if (
      !isCurrentCheckpointSchema(message.schema)
      || hasCurrentCheckpointStorage(message)
    ) {
      return { checkpointRef, checkpointSha: null, status: 'unavailable' };
    }
    requireMigratableLegacyStorage(options.legacyCheckpointSha, message);
    reportV18MigrationProgress(options.progress, {
      message: 'loading retained v18 checkpoint state',
      phase: 'scratch',
    });
    repository = new GitCasRepositoryAdapter({ plumbing, history });
    const storage = await openCheckpointMigrationStore(repository, options.graph);
    const payload = await new LegacyCheckpointStorageReader({
      persistence: history,
      assetStorage: storage.assetStorage,
      codec: defaultCodec,
    }).load(options.legacyCheckpointSha, { includeDerivedArtifacts: false });
    const state = translateV18CheckpointState(
      payload.state,
      (reference) => options.translator.translatedContentHandle(reference),
    );
    const frontier = translateV18CheckpointFrontier(payload.frontier, options.commitMap);
    const parents = translateV18CommitShas(
      (await history.getNodeInfo(options.legacyCheckpointSha)).parents,
      options.commitMap,
    );
    reportV18MigrationProgress(options.progress, {
      message: 'hashing retained v18 checkpoint state',
      phase: 'scratch',
    });
    const stateHash = await computeStateHash(state, {
      codec: defaultCodec,
      crypto: defaultCrypto,
    });
    reportV18MigrationProgress(options.progress, {
      message: 'building current bounded checkpoint indexes',
      phase: 'scratch',
    });
    const materialization = await retainMigratedCheckpoint({
      materializations: storage.materializationStore,
      state,
      frontier,
      indexStore: storage.indexStore,
      stateHash,
    });
    reportV18MigrationProgress(options.progress, {
      message: 'publishing retained v19 checkpoint seed',
      phase: 'scratch',
    });
    const checkpointSha = await createCheckpointEnvelope({
      checkpointStore: storage.checkpointStore,
      graphName: options.graph,
      state,
      frontier,
      parents,
      expectedCheckpointSha: options.legacyCheckpointSha,
      codec: defaultCodec,
      crypto: defaultCrypto,
      materialization,
    });
    return { checkpointRef, checkpointSha, status: 'seeded' };
  } catch (error) {
    operationFailed = true;
    throw error;
  } finally {
    await closeResources(repository, history, operationFailed);
  }
}

/** Rewrites only content-bearing registers while preserving CRDT event identity. */
export function translateV18CheckpointState(
  state: WarpState,
  translateReference: (reference: string) => string,
): WarpState {
  const contentKeys = new Set<string>();
  for (const entry of state.nodeProperties()) {
    if (entry.key === '_content') {
      contentKeys.add(entry.encodedKey);
    }
  }
  for (const entry of state.edgeProperties()) {
    if (entry.key === '_content') {
      contentKeys.add(entry.encodedKey);
    }
  }
  const prop = new Map<string, LWWRegister<PropValue>>();
  for (const [encodedKey, register] of state.allPropEntries()) {
    if (!contentKeys.has(encodedKey)) {
      prop.set(encodedKey, register);
      continue;
    }
    if (typeof register.value !== 'string') {
      throw new Error(`legacy checkpoint content ${encodedKey} is not a string reference`);
    }
    prop.set(
      encodedKey,
      new LWWRegister(register.eventId, translateReference(register.value)),
    );
  }
  return new WarpState({
    nodeAlive: state.nodeAlive,
    edgeAlive: state.edgeAlive,
    prop,
    observedFrontier: state.observedFrontier,
    edgeBirthEvent: state.edgeBirthEvent,
  });
}

/** Maps a retained v18 frontier onto the byte-preserving rewritten writer chains. */
export function translateV18CheckpointFrontier(
  frontier: ReadonlyMap<string, string>,
  commitMap: ReadonlyMap<string, string>,
): Map<string, string> {
  return new Map(
    [...frontier].map(([writer, sha]) => [writer, requireTranslatedCommit(sha, commitMap)]),
  );
}

function translateV18CommitShas(
  shas: readonly string[],
  commitMap: ReadonlyMap<string, string>,
): string[] {
  return shas.map((sha) => requireTranslatedCommit(sha, commitMap));
}

function requireTranslatedCommit(
  sha: string,
  commitMap: ReadonlyMap<string, string>,
): string {
  const translated = commitMap.get(sha);
  if (translated === undefined) {
    throw new Error(`legacy checkpoint commit ${sha} is outside rewritten writer history`);
  }
  return translated;
}

async function closeResources(
  repository: GitCasRepositoryAdapter | null,
  history: GitTimelineHistoryAdapter,
  operationFailed: boolean,
): Promise<void> {
  const failures: Error[] = [];
  for (const close of [
    ...(repository === null ? [] : [async () => await repository.close()]),
    async () => await history.close(),
  ]) {
    try {
      await close();
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (!operationFailed && failures.length > 0) {
    throw new AggregateError(failures, 'checkpoint seed resources failed to close');
  }
}
