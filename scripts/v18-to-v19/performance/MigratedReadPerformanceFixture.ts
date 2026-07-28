import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { restoreV18RetainedSubstrateFixture } from '../V18RetainedSubstrateFixtureRestore.ts';
import { runV18ToV19Migration } from '../V18MigrationCommand.ts';
import V18MigrationExecutionMode from '../V18MigrationExecutionMode.ts';

export type MigratedReadSeeds = Readonly<{
  bundleBytes: number;
  graph: 'v18-medium-retained-substrate';
  migrationWallMs: number;
  patchCount: 18;
  v18Repository: string;
  v19Repository: string;
}>;

export async function prepareMigratedReadSeeds(
  options: Readonly<{
    manifestPath: string;
    root: string;
  }>
): Promise<MigratedReadSeeds> {
  const v18 = await restoreV18RetainedSubstrateFixture({
    manifestPath: options.manifestPath,
    targetDirectory: join(options.root, 'v18-seed'),
  });
  const v19 = await restoreV18RetainedSubstrateFixture({
    manifestPath: options.manifestPath,
    targetDirectory: join(options.root, 'v19-seed'),
  });
  const migrationStarted = performance.now();
  const report = await runV18ToV19Migration({
    graph: v19.manifest.graphId,
    mode: V18MigrationExecutionMode.promote(),
    repositoryPath: v19.repositoryPath,
  });
  const migrationWallMs = performance.now() - migrationStarted;
  if (report.status !== 'migrated' || report.finalization === null) {
    throw new Error(`fixture migration returned ${report.status}`);
  }
  const writerPatchCount = v18.manifest.refs
    .filter((ref) => ref.kind === 'writer')
    .reduce((total, ref) => total + (ref.patchCount ?? 0), 0);
  if (
    v18.manifest.fixtureId !== 'v18-retained-substrate-medium-001' ||
    v18.manifest.graphId !== 'v18-medium-retained-substrate' ||
    writerPatchCount !== 18
  ) {
    throw new Error('medium retained-substrate fixture identity drifted');
  }
  const bundlePath = resolve(dirname(options.manifestPath), v18.manifest.bundlePath);
  return Object.freeze({
    bundleBytes: (await stat(bundlePath)).size,
    graph: v18.manifest.graphId,
    migrationWallMs,
    patchCount: 18,
    v18Repository: v18.repositoryPath,
    v19Repository: v19.repositoryPath,
  });
}

export async function migratedReadEnvironment(
  options: Readonly<{
    fixturePackage: string;
    projectRoot: string;
  }>
): Promise<
  Readonly<{
    architecture: string;
    git: string;
    node: string;
    platform: string;
    v18GitCas: '6.0.0';
    v18GitWarp: '18.2.1';
    v19Commit: string;
    v19GitCas: string;
    v19PackageVersion: string;
  }>
> {
  const v18GitWarp = await packageVersion(
    join(options.fixturePackage, 'node_modules/@git-stunts/git-warp')
  );
  const v18GitCas = await packageVersion(
    join(options.fixturePackage, 'node_modules/@git-stunts/git-cas')
  );
  if (v18GitWarp !== '18.2.1' || v18GitCas !== '6.0.0') {
    throw new Error(
      `v18 fixture dependencies drifted: git-warp ${v18GitWarp}, ` + `git-cas ${v18GitCas}`
    );
  }
  return Object.freeze({
    architecture: process.arch,
    git: execFileSync('git', ['--version'], { encoding: 'utf8' }).trim(),
    node: process.version,
    platform: process.platform,
    v18GitCas,
    v18GitWarp,
    v19Commit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: options.projectRoot,
      encoding: 'utf8',
    }).trim(),
    v19GitCas: await packageVersion(join(options.projectRoot, 'node_modules/@git-stunts/git-cas')),
    v19PackageVersion: await packageVersion(options.projectRoot),
  });
}

async function packageVersion(packageRoot: string): Promise<string> {
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as unknown;
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !('version' in manifest) ||
    typeof manifest.version !== 'string'
  ) {
    throw new Error(`${packageRoot} has no package version`);
  }
  return manifest.version;
}
