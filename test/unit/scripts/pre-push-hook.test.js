import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const hookPath = fileURLToPath(new URL('../../../scripts/hooks/pre-push', import.meta.url));

/** @type {string[]} */
const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(/** @type {string} */ (tempDirs.pop()), { force: true, recursive: true });
  }
});

/**
 * @returns {string}
 */
function createTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'git-warp-pre-push-'));
  tempDirs.push(dir);
  return dir;
}

/**
 * @param {string} filePath
 * @param {string} source
 */
function writeExecutable(filePath, source) {
  writeFileSync(filePath, source, 'utf8');
  chmodSync(filePath, 0o755);
}

/**
 * @param {string} filePath
 * @returns {string[]}
 */
function readLog(filePath) {
  try {
    return readFileSync(filePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * @param {{ quick?: boolean, failCommand?: string|null, linkcheckAvailable?: boolean }} [options]
 */
function runPrePushHook(options = {}) {
  const { quick = false, failCommand = null, linkcheckAvailable = true } = options;
  const binDir = createTempDir();
  const npmBin = join(binDir, 'npm');
  const npmLog = join(binDir, 'npm.log');
  const lycheeLog = join(binDir, 'lychee.log');
  const linkcheckBin = join(binDir, 'warp-linkcheck-stub');

  writeExecutable(
    npmBin,
    [
      '#!/bin/sh',
      'set -eu',
      'cmd="$1"',
      'if [ "$cmd" = "run" ]; then',
      '  cmd="$2"',
      'fi',
      "printf '%s\\n' \"$cmd\" >> \"$WARP_NPM_LOG\"",
      'if [ "${WARP_FAIL_NPM_CMD:-}" = "$cmd" ]; then',
      '  echo "stub npm failing for $cmd" >&2',
      '  exit 1',
      'fi',
      'exit 0',
      '',
    ].join('\n')
  );

  if (linkcheckAvailable) {
    writeExecutable(
      linkcheckBin,
      [
        '#!/bin/sh',
        'set -eu',
        "printf '%s\\n' \"$*\" >> \"$WARP_LYCHEE_LOG\"",
        'exit 0',
        '',
      ].join('\n')
    );
  }

  /** @type {Record<string, string | undefined>} */
  const env = {
    ...process.env,
    WARP_NPM_LOG: npmLog,
    WARP_LYCHEE_LOG: lycheeLog,
    WARP_NPM_BIN: npmBin,
    WARP_NPM_LAUNCHER: 'sh',
    WARP_LINKCHECK_BIN: linkcheckBin,
    WARP_LINKCHECK_LAUNCHER: 'sh',
  };

  if (quick) {
    env.WARP_QUICK_PUSH = '1';
  }

  if (failCommand) {
    env.WARP_FAIL_NPM_CMD = failCommand;
  }

  const result = spawnSync('sh', [hookPath], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    timeout: 3000,
  });

  if (result.error) {
    throw result.error;
  }

  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    commands: readLog(npmLog),
    lycheeCalls: readLog(lycheeLog),
  };
}

describe('scripts/hooks/pre-push', () => {
  it('keeps the checked-in header aligned with the runtime gate layout', () => {
    const source = readFileSync(hookPath, 'utf8');

    expect(source).toContain('# Seven gates in parallel, then unit tests. ALL must pass or push is blocked.');
  });

  it('skips Gate 8 in quick mode without running unit tests', () => {
    const result = runPrePushHook({ quick: true });

    expect(result.status).toBe(0);
    expect(result.output).toContain('WARP_QUICK_PUSH: quick mode active — Gate 8 (unit tests) will be skipped');
    expect(result.output).toContain('[Gates 1-7] Running lint + typecheck + policy + consumer type test + surface validator + markdown gates...');
    expect(result.output).toContain('[Gate 8] Skipped (WARP_QUICK_PUSH quick mode)');
    expect([...result.commands].sort()).toEqual([
      'lint',
      'lint:md',
      'lint:md:code',
      'typecheck',
      'typecheck:consumer',
      'typecheck:policy',
      'typecheck:surface',
    ]);
    expect(result.lycheeCalls).toEqual(['--config .lychee.toml **/*.md']);
  });

  it('skips Gate 0 when the launcher target is unavailable', () => {
    const result = runPrePushHook({ quick: true, linkcheckAvailable: false });

    expect(result.status).toBe(0);
    expect(result.output).toContain('[Gate 0] Link check skipped (lychee not installed)');
    expect(result.lycheeCalls).toEqual([]);
  });

  it('runs Gate 8 in normal mode', () => {
    const result = runPrePushHook();

    expect(result.status).toBe(0);
    expect(result.output).toContain('[Gate 8] Running unit tests...');
    expect([...result.commands].sort()).toEqual([
      'lint',
      'lint:md',
      'lint:md:code',
      'test:local',
      'typecheck',
      'typecheck:consumer',
      'typecheck:policy',
      'typecheck:surface',
    ]);
  });

  const failureCases = [
    ['typecheck', 'BLOCKED — Gate 1 FAILED: TypeScript compiler (strict mode)'],
    ['typecheck:policy', 'BLOCKED — Gate 2 FAILED: IRONCLAD policy (any/wildcard/ts-ignore ban)'],
    ['typecheck:consumer', 'BLOCKED — Gate 3 FAILED: Consumer type surface test'],
    ['lint', 'BLOCKED — Gate 4 FAILED: ESLint (includes no-explicit-any, no-unsafe-*)'],
    ['typecheck:surface', 'BLOCKED — Gate 5 FAILED: Declaration surface validator'],
    ['lint:md', 'BLOCKED — Gate 6 FAILED: Markdown lint'],
    ['lint:md:code', 'BLOCKED — Gate 7 FAILED: Markdown JS/TS code-sample syntax check'],
    ['test:local', 'BLOCKED — Gate 8 FAILED: Unit tests'],
  ];

  for (const [failCommand, expectedMessage] of failureCases) {
    it(`reports ${expectedMessage}`, () => {
      const result = runPrePushHook({
        quick: failCommand !== 'test:local',
        failCommand,
      });

      expect(result.status).toBe(1);
      expect(result.output).toContain(expectedMessage);
    });
  }
});
