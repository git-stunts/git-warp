import { unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import PackagePayloadError from './PackagePayloadError.ts';
import { listFiles } from './PackedArtifactFiles.ts';
import PUBLIC_PACKAGE_ENTRYPOINTS from './PublicPackageEntrypoints.ts';

/** Keeps exactly the declaration closure required by the supported public exports. */
export default function prunePrivateDeclarations(directory: string): void {
  const roots = PUBLIC_PACKAGE_ENTRYPOINTS
    .map((name) => join(directory, `${name}.d.ts`));
  const program = ts.createProgram(roots, {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    skipLibCheck: false,
    noEmit: true,
    target: ts.ScriptTarget.ESNext,
    strict: true,
  });
  if (ts.getPreEmitDiagnostics(program).length > 0) {
    throw new PackagePayloadError('public declaration closure has compiler errors; refusing to prune');
  }
  const required = new Set(program.getSourceFiles().map((file) => resolve(file.fileName)));
  for (const path of listFiles(directory, '.d.ts')) {
    if (!required.has(resolve(path))) {
      unlinkSync(path);
    }
  }
}
