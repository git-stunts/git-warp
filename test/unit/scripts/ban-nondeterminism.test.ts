import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

// The gate guards the repository it lives in, so each fixture repository
// carries a copy of this checkout's scripts/ directory and its own src/domain.
const CHECKOUT_SCRIPTS = fileURLToPath(new URL('../../../scripts', import.meta.url));
const GATE_RUN_TIMEOUT_MS = 60_000;
const VIOLATION_EXIT_CODE = 1;
const REFUSAL_EXIT_CODE = 2;

type FixtureFile = {
  readonly path: string;
  readonly source: string;
};

const fixtureRoots: string[] = [];

function createFixtureRepository(files: readonly FixtureFile[]): string {
  const root = mkdtempSync(join(tmpdir(), 'git-warp-determinism-gate-'));
  fixtureRoots.push(root);
  cpSync(CHECKOUT_SCRIPTS, join(root, 'scripts'), { recursive: true });
  writeFileSync(join(root, 'package.json'), '{ "type": "module" }\n');
  for (const file of files) {
    const target = join(root, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.source);
  }
  return root;
}

function runGate(root: string): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [join(root, 'scripts', 'ban-nondeterminism.ts')], {
    cwd: root,
    encoding: 'utf8',
    timeout: GATE_RUN_TIMEOUT_MS,
  });
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('scripts/ban-nondeterminism.ts', () => {
  it('refuses a TypeScript domain file that calls crypto.getRandomValues', () => {
    // Oracle: docs/ANTI_SLUDGE_POLICY.md section 9 bans crypto.getRandomValues in src/domain/**.
    const root = createFixtureRepository([{
      path: 'src/domain/services/EntropyFixture.ts',
      source: [
        'export function mintNonce(): Uint8Array {',
        '  return crypto.getRandomValues(new Uint8Array(8));',
        '}',
        '',
      ].join('\n'),
    }]);

    const run = runGate(root);

    expect(run.stdout).toContain('src/domain/services/EntropyFixture.ts:2:');
    expect(run.stdout).toContain('crypto.getRandomValues()');
    expect(run.status).toBe(VIOLATION_EXIT_CODE);
  });

  it('passes a TypeScript domain tree with no banned calls and reports how many files it scanned', () => {
    const root = createFixtureRepository([
      { path: 'src/domain/Clean.ts', source: 'export const ANSWER = 42;\n' },
      { path: 'src/domain/nested/AlsoClean.ts', source: 'export function twice(n: number): number { return n * 2; }\n' },
    ]);

    const run = runGate(root);

    expect(run.stdout).toContain('ban-nondeterminism: PASSED (2 domain files scanned).');
    expect(run.status).toBe(0);
  });

  it('refuses to pass when src/domain holds no files to scan', () => {
    const root = createFixtureRepository([]);
    mkdirSync(join(root, 'src', 'domain', 'services'), { recursive: true });

    const run = runGate(root);

    expect(run.stdout).toContain('scanned no files');
    expect(run.status).toBe(REFUSAL_EXIT_CODE);
  });

  it('refuses to pass when the repository has no src/domain directory', () => {
    const root = createFixtureRepository([{ path: 'src/infrastructure/Adapter.ts', source: 'export const now = Date.now();\n' }]);

    const run = runGate(root);

    expect(run.stdout).toContain('src/domain is not a directory');
    expect(run.status).toBe(REFUSAL_EXIT_CODE);
  });
});
