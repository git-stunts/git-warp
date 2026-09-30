import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import WarpError from '../../domain/errors/WarpError.ts';

/** Decodes installed-package files and dynamically loaded hook capabilities. */
export default class PackedArtifactBoundaryAdapter {
  /** Parses an installed artifact file and validates its boundary schema. */
  read<T>(path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return schema.parse(value);
  }

  /** Reads the persisted operation using only modules from the installed artifact. */
  async removal(fields: { packageDir: string; repo: string; writer: string; expectedDots: readonly string[] }): Promise<void> {
    const { packageDir, repo, writer, expectedDots } = fields;
    const moduleAt = async (path: string): Promise<unknown> => await import(pathToFileURL(join(packageDir, 'dist', path)).href);
    const api = await moduleAt('index.js');
    const runtime = await callMethod(member(api, 'Runtime'), 'open', [{ at: repo, writer: 'packed-inspector' }]);
    try {
      const access = await moduleAt('src/application/RuntimeStorageAccess.js');
      const binding = await callMethod(access, 'resolveRuntimeStorage', [runtime]);
      const defaults = await moduleAt('src/application/RuntimeHostNodeDefaults.js');
      const ports = await callMethod(defaults, 'getDefaultRuntimeHostNodePorts', []);
      const product = await moduleAt('src/domain/warp/RuntimeHostProduct.js');
      const graph = await callMethod(product, 'openRuntimeHostProduct', [{
        graphName: 'events', writerId: 'packed-inspector',
        persistence: member(binding, 'history'), runtimeStorage: member(binding, 'runtimeStorage'),
        codec: member(ports, 'codec'), crypto: member(ports, 'crypto'),
        trustCrypto: member(ports, 'trustCrypto'), commitMessageCodec: member(ports, 'commitMessageCodec'),
      }]);
      const patches = z.array(z.object({ patch: z.object({ ops: z.array(z.object({
        type: z.literal('NodeRemove'), node: z.literal('n'), observedDots: z.array(z.string()).min(1),
      })).length(1) }) })).length(1).parse(await callMethod(graph, 'getWriterPatches', [writer]));
      const dots = patches[0]?.patch.ops[0]?.observedDots;
      if (dots?.join(',') !== expectedDots.join(',')) {
        throw new WarpError('Persisted removal observed the wrong additions', 'E_PACKED_REMOVAL_DOTS');
      }
    } finally { await callMethod(runtime, 'close', []); }
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
  const method = member(target, name);
  if (typeof method !== 'function') {
    throw new WarpError(`packaged CLI does not provide ${name}`, 'E_PACKED_ARTIFACT_CAPABILITY');
  }
  const result: unknown = await Reflect.apply(method, target, args);
  return result;
}

/** Reads one named capability from a dynamically loaded artifact. */
function member(target: unknown, name: string): unknown {
  return (typeof target === 'object' && target !== null) || typeof target === 'function'
    ? Reflect.get(target, name) : undefined;
}
