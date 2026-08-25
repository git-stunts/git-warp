import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = new URL('../../../', import.meta.url);
const JSR_SCRIPT = new URL('scripts/run-jsr-publish.sh', REPO_ROOT);
const SETUP_DENO_ACTION = 'denoland/setup-deno@22d081ff2d3a40755e97629de92e3bcbfa7cf2ed';
const TEMP_ROOTS: string[] = [];

type HarnessResult = Readonly<{
  attempts: number;
  output: string;
  status: number | null;
}>;

async function repositoryText(relativePath: string): Promise<string> {
  return await readFile(new URL(relativePath, REPO_ROOT), 'utf8');
}

async function runHarness(mode: string): Promise<HarnessResult> {
  const root = await mkdtemp(join(tmpdir(), 'git-warp-jsr-publish-'));
  TEMP_ROOTS.push(root);
  const attemptFile = join(root, 'attempts');
  const fakeJsr = join(root, 'fake-jsr.sh');
  await writeFile(
    fakeJsr,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'test "$1" = "publish"',
      'test "$2" = "--dry-run"',
      'ATTEMPTS=0',
      'if [ -f "$GIT_WARP_TEST_ATTEMPT_FILE" ]; then',
      '  ATTEMPTS=$(cat "$GIT_WARP_TEST_ATTEMPT_FILE")',
      'fi',
      'ATTEMPTS=$((ATTEMPTS + 1))',
      'printf "%s\\n" "$ATTEMPTS" > "$GIT_WARP_TEST_ATTEMPT_FILE"',
      'case "$GIT_WARP_TEST_MODE" in',
      '  transient-once)',
      '    if [ "$ATTEMPTS" -eq 1 ]; then',
      '      echo "TypeError: terminated; cause: read ECONNRESET" >&2',
      '      exit 1',
      '    fi',
      '    ;;',
      '  transient-always)',
      '    echo "request failed: ETIMEDOUT" >&2',
      '    exit 1',
      '    ;;',
      '  validation)',
      '    echo "error: package validation failed" >&2',
      '    exit 1',
      '    ;;',
      '  *)',
      '    echo "unexpected test mode" >&2',
      '    exit 2',
      '    ;;',
      'esac',
      'echo "publish proof passed"',
      '',
    ].join('\n')
  );
  await chmod(fakeJsr, 0o755);

  const result = spawnSync('bash', [JSR_SCRIPT.pathname, '--dry-run'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_WARP_JSR_ATTEMPTS: '3',
      GIT_WARP_JSR_BIN: fakeJsr,
      GIT_WARP_JSR_DELAY_SECONDS: '0',
      GIT_WARP_TEST_ATTEMPT_FILE: attemptFile,
      GIT_WARP_TEST_MODE: mode,
    },
    timeout: 10_000,
  });
  const attempts = Number.parseInt(await readFile(attemptFile, 'utf8'), 10);
  return {
    attempts,
    output: `${result.stdout}${result.stderr}`,
    status: result.status,
  };
}

afterEach(async () => {
  await Promise.all(TEMP_ROOTS.splice(0).map(async (root) => await rm(root, { recursive: true })));
});

describe('JSR publish command', () => {
  it('retries a classified transient bootstrap failure and then succeeds', async () => {
    const result = await runHarness('transient-once');

    expect(result.status).toBe(0);
    expect(result.attempts).toBe(2);
    expect(result.output).toContain('Retrying classified transient JSR failure');
  });

  it('does not retry a deterministic package validation failure', async () => {
    const result = await runHarness('validation');

    expect(result.status).toBe(1);
    expect(result.attempts).toBe(1);
    expect(result.output).toContain('Deterministic JSR failure; not retrying');
  });

  it('bounds repeated transient failures', async () => {
    const result = await runHarness('transient-always');

    expect(result.status).toBe(1);
    expect(result.attempts).toBe(3);
    expect(result.output).toContain('Classified transient JSR failure exhausted 3 attempts');
  });

  it('pins and preinstalls the JSR toolchain in every publication workflow', async () => {
    const [packageJsonText, preflight, releasePr, mainPush, release] = await Promise.all([
      repositoryText('package.json'),
      repositoryText('scripts/release-preflight.sh'),
      repositoryText('.github/workflows/release-pr.yml'),
      repositoryText('.github/workflows/main-push-release-branch-check.yml'),
      repositoryText('.github/workflows/release.yml'),
    ]);
    const packageJson = JSON.parse(packageJsonText) as {
      readonly devDependencies: Readonly<Record<string, string>>;
      readonly scripts: Readonly<Record<string, string>>;
    };

    expect(packageJson.devDependencies['jsr']).toBe('0.14.3');
    expect(packageJson.scripts['jsr:publish']).toBe('bash scripts/run-jsr-publish.sh');
    expect(preflight).toContain('npm run jsr:publish -- --dry-run --allow-dirty');
    expect(releasePr).toContain(SETUP_DENO_ACTION);
    expect(mainPush).toContain(SETUP_DENO_ACTION);
    expect(release.match(new RegExp(SETUP_DENO_ACTION, 'gu'))).toHaveLength(2);
    for (const workflow of [releasePr, mainPush, release]) {
      expect(workflow).toContain("deno-version: 'v2.6.7'");
      expect(workflow).not.toContain('npx -y jsr');
    }
  });
});
