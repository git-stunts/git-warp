import { join } from 'node:path';
import { z } from 'zod';
import PackedArtifactBoundaryAdapter from '../../src/infrastructure/adapters/PackedArtifactBoundaryAdapter.ts';

const JAVASCRIPT = z.string().regex(/^\.\/dist\/(?!.*\.\.)[^\\]+\.js$/u);
const EXPORT = z.union([
  z.literal('./package.json'),
  z.object({ import: JAVASCRIPT, default: JAVASCRIPT, types: z.string() }).strict(),
]);
const MANIFEST = z.object({
  exports: z.record(z.string(), EXPORT).refine((exports) => Object.keys(exports).length > 0),
  bin: z.record(z.string(), z.union([JAVASCRIPT, z.literal('./bin/git-warp')])),
});
const CLI_IMPLEMENTATION = 'dist/bin/git-warp.js';
const LEGACY_COMMAND = 'dist/scripts/upgrade-v16-to-v17.js';

/** Reads runtime exports and bins; the source-capable launcher delegates to compiled CLI output. */
export default function packageRuntimeRoots(directory: string): string[] {
  const manifest = new PackedArtifactBoundaryAdapter().read(join(directory, 'package.json'), MANIFEST);
  const exports = Object.values(manifest.exports).flatMap((entry) =>
    typeof entry === 'string' ? [] : [entry.import, entry.default]);
  const commands = Object.values(manifest.bin).map((path) =>
    path === './bin/git-warp' ? CLI_IMPLEMENTATION : path);
  return [...new Set([...exports, ...commands, CLI_IMPLEMENTATION, LEGACY_COMMAND])];
}
