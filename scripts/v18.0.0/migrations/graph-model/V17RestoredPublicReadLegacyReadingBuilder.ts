import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Plumbing from '@git-stunts/plumbing';

import GenesisEquivalenceReading
  from '../../../../src/domain/migrations/GenesisEquivalenceReading.ts';
import GenesisEquivalenceReadingFact
  from '../../../../src/domain/migrations/GenesisEquivalenceReadingFact.ts';
import V17GoldenGraphFixtureGenesisReading
  from '../../../../src/domain/migrations/V17GoldenGraphFixtureGenesisReading.ts';
import V17GoldenGraphFixtureManifest
  from '../../../../src/domain/migrations/V17GoldenGraphFixtureManifest.ts';
import { CONTENT_PROPERTY_KEY }
  from '../../../../src/domain/services/KeyCodec.ts';
import GitGraphAdapter from '../../../../src/infrastructure/adapters/GitGraphAdapter.ts';
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
  try {
    const facts: GenesisEquivalenceReadingFact[] = [];
    for (const fact of reading.facts) {
      facts.push(await factWithRuntimeContentOid(fact, graphId, resolver));
    }
    return new GenesisEquivalenceReading({
      readingId: reading.readingId,
      facts,
    });
  } finally {
    await resolver.close();
  }
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
  private constructor(
    private readonly repositoryPath: string,
    private readonly shouldCleanup: boolean,
    private readonly storage: Awaited<ReturnType<GitGraphAdapter['createRuntimeBlobStorage']>>,
  ) {
  }

  static async open(repositoryPath: string | null): Promise<RuntimeContentOidResolver> {
    let runtimeRepositoryPath = repositoryPath;
    let shouldCleanup = false;
    if (runtimeRepositoryPath === null) {
      runtimeRepositoryPath = await mkdtemp(join(tmpdir(), 'git-warp-v18-content-oid-'));
      shouldCleanup = true;
    }
    const plumbing = await Plumbing.createDefault({ cwd: runtimeRepositoryPath });
    await plumbing.execute({ args: ['init', '-q'] });
    const adapter = new GitGraphAdapter({ plumbing });
    return new RuntimeContentOidResolver(
      runtimeRepositoryPath,
      shouldCleanup,
      await adapter.createRuntimeBlobStorage(),
    );
  }

  async oidFor(options: {
    readonly graphId: string;
    readonly contentKey: string;
    readonly nodeId: string;
  }): Promise<string> {
    const content = `migration-source:${options.contentKey}`;
    return await this.storage.store(content, {
      slug: `${options.graphId}/${options.nodeId}`,
      mime: 'text/plain',
      size: new TextEncoder().encode(content).byteLength,
    });
  }

  async close(): Promise<void> {
    if (this.shouldCleanup) {
      await rm(this.repositoryPath, { recursive: true, force: true });
    }
  }
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
