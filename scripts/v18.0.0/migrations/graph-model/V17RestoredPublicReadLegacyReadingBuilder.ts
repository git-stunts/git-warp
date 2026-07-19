import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Plumbing from '@git-stunts/plumbing';

import GenesisEquivalenceReading
  from '../../../../src/domain/migrations/GenesisEquivalenceReading.ts';
import GenesisEquivalenceReadingFact
  from '../../../../src/domain/migrations/GenesisEquivalenceReadingFact.ts';
import V17GoldenGraphFixtureGenesisReading
  from './V17GoldenGraphFixtureGenesisReading.ts';
import V17GoldenGraphFixtureManifest
  from './V17GoldenGraphFixtureManifest.ts';
import { CONTENT_PROPERTY_KEY }
  from '../../../../src/domain/services/KeyCodec.ts';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import GitCasRepositoryAdapter from '../../../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import defaultCrypto from '../../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import type AssetStoragePort from '../../../../src/ports/AssetStoragePort.ts';
import { runMigrationGit } from './GitMigrationCommandRunner.ts';

const CONTENT_ATTACHMENT_SUFFIX = `:${CONTENT_PROPERTY_KEY}`;

export type V17RestoredPublicReadLegacyReadingBuilderOptions = {
  readonly repositoryPath: string;
  readonly manifest: V17GoldenGraphFixtureManifest;
  readonly contentOidRepositoryPath?: string | null;
};

/** Builds legacy equivalence facts from a restored v17 fixture after ref verification. */
export async function buildV17RestoredPublicReadLegacyReading(
  options: V17RestoredPublicReadLegacyReadingBuilderOptions,
): Promise<GenesisEquivalenceReading> {
  const repositoryPath = requireNonEmptyString(options.repositoryPath, 'repositoryPath');
  const manifest = requireManifest(options.manifest);
  await verifyRestoredWriterRefs(repositoryPath, manifest);
  return await readingWithRuntimeContentOids(
    new V17GoldenGraphFixtureGenesisReading().build(manifest),
    manifest.graphId,
    options.contentOidRepositoryPath ?? null,
  );
}

async function verifyRestoredWriterRefs(
  repositoryPath: string,
  manifest: V17GoldenGraphFixtureManifest,
): Promise<void> {
  for (const chain of manifest.writerChains) {
    const observedHead = await gitText(repositoryPath, [
      'show-ref',
      '--verify',
      '--hash',
      chain.refName,
    ]);
    if (observedHead !== chain.expectedHead) {
      throw new V17RestoredPublicReadLegacyReadingBuilderError(
        `restored ref ${chain.refName} expected ${chain.expectedHead}, got ${observedHead}`,
      );
    }
    const observedPatchCount = Number(await gitText(repositoryPath, [
      'rev-list',
      '--count',
      chain.refName,
    ]));
    if (observedPatchCount !== chain.patchCount) {
      throw new V17RestoredPublicReadLegacyReadingBuilderError(
        `restored ref ${chain.refName} expected ${chain.patchCount} patches, got ${observedPatchCount}`,
      );
    }
  }
}

async function readingWithRuntimeContentOids(
  reading: GenesisEquivalenceReading,
  graphId: string,
  repositoryPath: string | null,
): Promise<GenesisEquivalenceReading> {
  const resolver = await RuntimeContentOidResolver.open(repositoryPath);
  const [result] = await Promise.allSettled([(async () => {
    const facts: GenesisEquivalenceReadingFact[] = [];
    for (const fact of reading.facts) {
      facts.push(await factWithRuntimeContentOid(fact, graphId, resolver));
    }
    return new GenesisEquivalenceReading({
      readingId: reading.readingId,
      facts,
    });
  })()]);
  const [cleanup] = await Promise.allSettled([resolver.close()]);
  if (result.status === 'rejected' && cleanup.status === 'rejected') {
    throw new AggregateError(
      [result.reason, cleanup.reason],
      'Legacy reading construction and runtime cleanup both failed',
    );
  }
  if (result.status === 'rejected') {
    throw result.reason;
  }
  if (cleanup.status === 'rejected') {
    throw cleanup.reason;
  }
  return result.value;
}

async function factWithRuntimeContentOid(
  fact: GenesisEquivalenceReadingFact,
  graphId: string,
  resolver: RuntimeContentOidResolver,
): Promise<GenesisEquivalenceReadingFact> {
  if (fact.kind !== 'content-attachment' || fact.fieldPath !== 'payload.oid') {
    return fact;
  }
  return new GenesisEquivalenceReadingFact({
    kind: fact.kind,
    factKey: fact.factKey,
    fieldPath: fact.fieldPath,
    value: await resolver.oidFor({
      graphId,
      contentKey: fact.factKey,
      nodeId: nodeIdFromContentFactKey(fact.factKey),
    }),
    boundary: fact.boundary,
  });
}

function nodeIdFromContentFactKey(factKey: string): string {
  if (!factKey.endsWith(CONTENT_ATTACHMENT_SUFFIX)) {
    throw new V17RestoredPublicReadLegacyReadingBuilderError(
      `content fact ${factKey} must identify a node ${CONTENT_PROPERTY_KEY} attachment`,
    );
  }
  return factKey.slice(0, factKey.length - CONTENT_ATTACHMENT_SUFFIX.length);
}

class RuntimeContentOidResolver {
  private closePromise: Promise<void> | null = null;

  private constructor(
    private readonly repositoryPath: string,
    private readonly shouldCleanup: boolean,
    private readonly storage: AssetStoragePort,
    private readonly runtimeStorage: GitCasRepositoryAdapter,
    private readonly history: GitTimelineHistoryAdapter,
  ) {
  }

  static async open(repositoryPath: string | null): Promise<RuntimeContentOidResolver> {
    const shouldCleanup = repositoryPath === null;
    const runtimeRepositoryPath = repositoryPath
      ?? await mkdtemp(join(tmpdir(), 'git-warp-v18-content-oid-'));
    let history: GitTimelineHistoryAdapter | null = null;
    let runtimeStorage: GitCasRepositoryAdapter | null = null;
    try {
      const plumbing = await Plumbing.createDefault({ cwd: runtimeRepositoryPath });
      await plumbing.execute({ args: ['init', '-q'] });
      history = new GitTimelineHistoryAdapter({ plumbing });
      runtimeStorage = new GitCasRepositoryAdapter({
        plumbing,
        history,
      });
      const services = await runtimeStorage.createRuntimeStorageServices({
        timelineName: 'migration-content',
        codec: defaultCodec,
        crypto: defaultCrypto,
        commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
      });
      return new RuntimeContentOidResolver(
        runtimeRepositoryPath,
        shouldCleanup,
        services.content,
        runtimeStorage,
        history,
      );
    } catch (error) {
      try {
        await closeRuntimeContentOidResources(
          runtimeStorage,
          history,
          shouldCleanup ? runtimeRepositoryPath : null,
        );
      } catch (closeError) {
        throw new AggregateError(
          [error, closeError],
          'Runtime content resolver failed to open and clean up',
        );
      }
      throw error;
    }
  }

  async oidFor(options: {
    readonly graphId: string;
    readonly contentKey: string;
    readonly nodeId: string;
  }): Promise<string> {
    const content = `migration-source:${options.contentKey}`;
    const bytes = new TextEncoder().encode(content);
    const staged = await this.storage.stage(singleChunk(bytes), {
      slug: `${options.graphId}/${options.nodeId}`,
      filename: 'content',
      expectedSize: bytes.byteLength,
    });
    return staged.handle.toString();
  }

  close(): Promise<void> {
    this.closePromise ??= closeRuntimeContentOidResources(
      this.runtimeStorage,
      this.history,
      this.shouldCleanup ? this.repositoryPath : null,
    );
    return this.closePromise;
  }
}

async function closeRuntimeContentOidResources(
  runtimeStorage: GitCasRepositoryAdapter | null,
  history: GitTimelineHistoryAdapter | null,
  temporaryRepositoryPath: string | null,
): Promise<void> {
  const failures: unknown[] = [];
  const cleanups = [
    async (): Promise<void> => await runtimeStorage?.close(),
    async (): Promise<void> => await history?.close(),
    async (): Promise<void> => {
      if (temporaryRepositoryPath !== null) {
        await rm(temporaryRepositoryPath, { recursive: true, force: true });
      }
    },
  ];
  for (const cleanup of cleanups) {
    try {
      await cleanup();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length === 1) {
    throw failures[0];
  }
  if (failures.length > 1) {
    throw new AggregateError(failures, 'Runtime content resolver failed to close cleanly');
  }
}

async function* singleChunk(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  yield bytes;
}

async function gitText(repositoryPath: string, args: readonly string[]): Promise<string> {
  const result = await runMigrationGit(repositoryPath, args, null);
  if (!result.ok()) {
    throw new V17RestoredPublicReadLegacyReadingBuilderError(
      `git ${args.join(' ')} failed: ${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function requireManifest(manifest: V17GoldenGraphFixtureManifest): V17GoldenGraphFixtureManifest {
  if (!(manifest instanceof V17GoldenGraphFixtureManifest)) {
    throw new V17RestoredPublicReadLegacyReadingBuilderError(
      'manifest must be a V17GoldenGraphFixtureManifest',
    );
  }
  return manifest;
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new V17RestoredPublicReadLegacyReadingBuilderError(`${name} must be a non-empty string`);
  }
  return value;
}

export class V17RestoredPublicReadLegacyReadingBuilderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'V17RestoredPublicReadLegacyReadingBuilderError';
  }
}
