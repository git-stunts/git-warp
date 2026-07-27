import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  measureMigratedRead,
  printMigratedReadResult,
  requiredArgument,
} from './MigratedReadWorkerCommon.ts';

type V18Plumbing = Readonly<{ close?: () => Promise<void> }>;
type V18Worldline = Readonly<{
  coordinate: () => Promise<Readonly<{
    optic: () => Readonly<{
      node: (subject: string) => Readonly<{
        prop: (key: string) => Readonly<{ read: () => Promise<unknown> }>;
      }>;
    }>;
  }>>;
  prepareOpticBasis: () => Promise<void>;
}>;
type V18GitWarpModule = Readonly<{
  GitGraphAdapter: new (options: Readonly<{ plumbing: V18Plumbing }>) => unknown;
  openWarpWorldline: (options: Readonly<{
    persistence: unknown;
    worldlineName: string;
    writerId: string;
  }>) => Promise<V18Worldline>;
}>;
type V18PlumbingModule = Readonly<{
  default: Readonly<{
    createDefault: (
      options: Readonly<{ cwd: string }>,
    ) => Promise<V18Plumbing>;
  }>;
}>;

const repositoryPath = requiredArgument(process.argv.slice(2), '--repo');
const fixturePackage = requiredArgument(
  process.argv.slice(2),
  '--fixture-package',
);
const gitWarp = await loadPackage<V18GitWarpModule>(
  fixturePackage,
  '@git-stunts/git-warp',
  '18.2.1',
);
const plumbingModule = await loadPackage<V18PlumbingModule>(
  fixturePackage,
  '@git-stunts/plumbing',
  '3.0.3',
);

const result = await measureMigratedRead(async () => {
  const plumbing = await plumbingModule.default.createDefault({
    cwd: repositoryPath,
  });
  try {
    const persistence = new gitWarp.GitGraphAdapter({ plumbing });
    const worldline = await gitWarp.openWarpWorldline({
      persistence,
      worldlineName: 'v18-medium-retained-substrate',
      writerId: 'performance-reader',
    });
    await worldline.prepareOpticBasis();
    const coordinate = await worldline.coordinate();
    const reading = await coordinate
      .optic()
      .node('medium:document:015')
      .prop('ordinal')
      .read();
    const verified = requireOrdinalReading(reading);
    return Object.freeze({
      basisId: verified.basisId,
      basisKind: 'checkpoint-tail' as const,
      receiptStatus: null,
      supportStatus: 'checkpoint-tail' as const,
      value: verified.value,
    });
  } finally {
    await plumbing.close?.();
  }
});
printMigratedReadResult(result);

async function loadPackage<T>(
  fixtureRoot: string,
  name: string,
  expectedVersion: string,
): Promise<T> {
  const packageRoot = join(fixtureRoot, 'node_modules', ...name.split('/'));
  const manifest = JSON.parse(
    await readFile(join(packageRoot, 'package.json'), 'utf8'),
  ) as unknown;
  if (!isPackageManifest(manifest) || manifest.version !== expectedVersion) {
    throw new Error(
      `${name} must be ${expectedVersion} in the v18 fixture package`,
    );
  }
  const entrypoint = pathToFileURL(join(packageRoot, manifest.main)).href;
  return await import(entrypoint) as unknown as T;
}

function isPackageManifest(
  value: unknown,
): value is Readonly<{ main: string; version: string }> {
  return typeof value === 'object'
    && value !== null
    && 'main' in value
    && typeof value.main === 'string'
    && 'version' in value
    && typeof value.version === 'string';
}

function requireOrdinalReading(value: unknown): Readonly<{
  basisId: string;
  value: 15;
}> {
  if (
    typeof value !== 'object'
    || value === null
    || !('exists' in value)
    || value.exists !== true
    || !('value' in value)
    || value.value !== 15
    || !('readIdentity' in value)
    || typeof value.readIdentity !== 'object'
    || value.readIdentity === null
    || !('kind' in value.readIdentity)
    || value.readIdentity.kind !== 'checkpoint-tail-read'
    || !('checkpointSha' in value.readIdentity)
    || typeof value.readIdentity.checkpointSha !== 'string'
    || value.readIdentity.checkpointSha.length === 0
  ) {
    throw new Error('v18 retained property read did not return ordinal 15');
  }
  return Object.freeze({
    basisId: value.readIdentity.checkpointSha,
    value: 15,
  });
}
