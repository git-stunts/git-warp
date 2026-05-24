import GenesisEquivalenceReading
  from '../../../../src/domain/migrations/GenesisEquivalenceReading.ts';
import V17GoldenGraphFixtureGenesisReading
  from '../../../../src/domain/migrations/V17GoldenGraphFixtureGenesisReading.ts';
import V17GoldenGraphFixtureManifest
  from '../../../../src/domain/migrations/V17GoldenGraphFixtureManifest.ts';
import { runMigrationGit } from './GitMigrationCommandRunner.ts';

export type V17RestoredPublicReadLegacyReadingBuilderOptions = {
  readonly repositoryPath: string;
  readonly manifest: V17GoldenGraphFixtureManifest;
};

/** Builds legacy equivalence facts from a restored v17 fixture after ref verification. */
export async function buildV17RestoredPublicReadLegacyReading(
  options: V17RestoredPublicReadLegacyReadingBuilderOptions,
): Promise<GenesisEquivalenceReading> {
  const repositoryPath = requireNonEmptyString(options.repositoryPath, 'repositoryPath');
  const manifest = requireManifest(options.manifest);
  await verifyRestoredWriterRefs(repositoryPath, manifest);
  return new V17GoldenGraphFixtureGenesisReading().build(manifest);
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
