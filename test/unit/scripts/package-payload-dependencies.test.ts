import { resolve } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { z } from 'zod';
import PackedArtifactBoundaryAdapter from '../../../src/infrastructure/adapters/PackedArtifactBoundaryAdapter.ts';

it('requires direct production dependencies to be used by supported source roots', () => {
  const { dependencies } = new PackedArtifactBoundaryAdapter().read(
    resolve('package.json'),
    z.object({ dependencies: z.record(z.string(), z.string()) })
  );
  const importedPackages = new Set(
    ts.createProgram([
      'index.ts', 'advanced.ts', 'diagnostics.ts', 'charts.ts', 'testing.ts',
      'bin/git-warp.ts', 'scripts/upgrade-v16-to-v17.ts', 'scripts/v18-to-v19/migrate.ts',
    ], { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext })
      .getSourceFiles().filter((file) => !file.isDeclarationFile).flatMap((file) =>
      ts.preProcessFile(file.text, true, true).importedFiles
        .map(({ fileName }) => fileName)
        .filter((name) => !name.startsWith('.') && !name.startsWith('node:'))
        .map((name) => name.split('/').slice(0, name.startsWith('@') ? 2 : 1).join('/'))
    )
  );
  expect([...importedPackages].filter((name) => !Object.hasOwn(dependencies, name))).toEqual([]);
  expect(Object.keys(dependencies).filter((name) => !importedPackages.has(name))).toEqual([]);
});
