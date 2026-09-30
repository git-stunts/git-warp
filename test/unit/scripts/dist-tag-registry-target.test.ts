import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';

const roots: string[] = [];
const SCRIPT = fileURLToPath(new URL('../../../scripts/compute-npm-dist-tag.sh', import.meta.url));
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it('protects the explicit latest channel rather than npm configured default tag', () => {
  const root = mkdtempSync(join(tmpdir(), 'dist-tag-registry-'));
  roots.push(root);
  const npm = join(root, 'npm');
  writeFileSync(npm, `#!/bin/sh
case "$2:$3" in
  @git-stunts/git-warp@latest:version) printf '"19.1.0"\\n' ;;
  @git-stunts/git-warp:version) printf '"15.0.0"\\n' ;;
  @git-stunts/git-warp:dist-tags.maintenance-v16) exit 0 ;;
  *) exit 2 ;;
esac
`);
  chmodSync(npm, 0o755);
  const result = spawnSync('sh', ['-c',
    'unset NPM_DIST_TAG_PROBE_OUT NPM_MAINTENANCE_PROBE_OUT; PATH="$1:$PATH"; export PATH; exec "$2" 16.0.1',
    'probe', root, SCRIPT,
  ], { encoding: 'utf8' });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe('maintenance-v16');
});
