import { readFileSync, unlinkSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { nodeFileTrace } from '@vercel/nft';
import computedModuleLoads from './ComputedModuleLoads.ts';
import packageRuntimeRoots from './PackageRuntimeRoots.ts';
import { listFiles } from './PackedArtifactFiles.ts';
import PackagePayloadError from './PackagePayloadError.ts';

/** Deletes only untraced emitted JavaScript; types, assets, dependencies and retained bytes stay intact. */
export default async function prunePrivateJavaScript(directory: string): Promise<void> {
  const base = resolve(directory);
  const roots = packageRuntimeRoots(base).map((path) => join(base, path));
  const trace = await nodeFileTrace(roots, { base, ts: false, ignore: ['node_modules/**'] });
  if (trace.warnings.size > 0) {
    const warnings = [...trace.warnings].map((warning) => warning.message.replaceAll(base, '<package>'));
    throw new PackagePayloadError(`runtime trace has warnings; refusing to prune: ${warnings.join('; ')}`);
  }
  const required = new Set([...trace.fileList].map((path) => resolve(base, path)));
  const files = listFiles(join(base, 'dist'), '.js');
  for (const path of files.filter((file) => required.has(file))) {
    if (computedModuleLoads(readFileSync(path, 'utf8'), relative(base, path)).length > 0) {
      throw new PackagePayloadError('computed runtime import; refusing to prune');
    }
  }
  for (const path of files.filter((file) => !required.has(file))) {
    unlinkSync(path);
  }
}
