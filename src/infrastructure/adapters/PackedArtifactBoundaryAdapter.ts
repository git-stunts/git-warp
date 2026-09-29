import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import WarpError from '../../domain/errors/WarpError.ts';

/** Decodes installed-package files and dynamically loaded hook capabilities. */
export default class PackedArtifactBoundaryAdapter {
  /** Parses an installed artifact file and validates its boundary schema. */
  read<T>(path: string, schema: z.ZodType<T>): T {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return schema.parse(value);
  }

  /** Installs through the packaged CLI and validates its reported outcome. */
  async installHook(packageDir: string, repo: string): Promise<void> {
    const hooksDir = join(repo, '.git', 'hooks');
    const shared: unknown = await import(
      pathToFileURL(join(packageDir, 'dist/bin/cli/shared.js')).href
    );
    const installer = await callMethod(shared, 'createHookInstaller', [
      { resolveHooksDir: () => Promise.resolve(hooksDir) },
    ]);
    z.object({ action: z.literal('installed') }).parse(
      await callMethod(installer, 'install', [repo, { strategy: 'install' }])
    );
  }
}

/** Invokes a validated dynamic capability while preserving its receiver. */
async function callMethod(target: unknown, name: string, args: readonly unknown[]): Promise<unknown> {
  const method: unknown =
    typeof target === 'object' && target !== null ? Reflect.get(target, name) : undefined;
  if (typeof method !== 'function') {
    throw new WarpError(`packaged CLI does not provide ${name}`, 'E_PACKED_ARTIFACT_CAPABILITY');
  }
  const result: unknown = await Reflect.apply(method, target, args);
  return result;
}
