import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Adversarial tests for the quarantine graduate-check gate.
 *
 * This gate decides whether a branch may touch contaminated ground. Until
 * now it had no tests, and it silently passed on any clone whose merge-base
 * could not be resolved — which is every shallow CI clone of a branch that
 * diverged before the base tip. These tests pin the failure modes that
 * matter: the gate must fail closed, and no Git topology may launder a
 * quarantined path out of the touched set.
 */

const SCRIPT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/quarantine-graduate-check.ts',
);

let repo: string;

function git(...args: readonly string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
}

function commitAll(message: string): void {
  git('add', '-A');
  git('commit', '-q', '-m', message);
}

/** Writes a manifest quarantining `files` under one rule family. */
function writeManifest(files: readonly string[]): void {
  mkdirSync(join(repo, 'policy', 'quarantines'), { recursive: true });
  writeFileSync(
    join(repo, 'policy', 'quarantines', 'TEST-family.json'),
    `${JSON.stringify({
      manifest_id: 'TEST-family',
      owning_cycle: 'TEST',
      rule_family: 'test',
      rules: ['test-rule'],
      rationale: 'fixture',
      files: [...files],
    }, null, 2)}\n`,
  );
}

type RunResult = Readonly<{ status: number; stderr: string; stdout: string }>;

function runGate(base: string): RunResult {
  try {
    const stdout = execFileSync('node', [SCRIPT], {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_WARP_QUARANTINE_ROOT: repo,
        GIT_WARP_QUARANTINE_BASE: base,
      },
    });
    return { status: 0, stderr: '', stdout };
  } catch (raw) {
    const err = raw as { status?: number; stderr?: string; stdout?: string };
    return {
      status: err.status ?? -1,
      stderr: err.stderr ?? '',
      stdout: err.stdout ?? '',
    };
  }
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'warp-quarantine-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'gate@test.local');
  git('config', 'user.name', 'Gate Test');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src', 'dirty.ts'), 'export const a = 1;\n');
  writeFileSync(join(repo, 'src', 'clean.ts'), 'export const b = 2;\n');
  writeManifest(['src/dirty.ts']);
  commitAll('baseline');
  git('branch', 'base-ref');
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('quarantine graduate-check diff basis', () => {
  it('exits 2 when the base ref cannot be resolved', () => {
    const result = runGate('origin/nonexistent');

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('cannot establish a diff basis');
  });

  it('exits 2 rather than passing when the branch point is missing', () => {
    // A shallow clone of a branch that diverged before the base tip has no
    // common ancestor locally. The old behaviour reported "skipped" and
    // returned 0, making the gate a no-op exactly when it was needed.
    const shallow = mkdtempSync(join(tmpdir(), 'warp-quarantine-shallow-'));
    try {
      git('checkout', '-q', '-b', 'feature');
      writeFileSync(join(repo, 'src', 'clean.ts'), 'export const b = 3;\n');
      commitAll('feature work');
      git('checkout', '-q', 'main');
      writeFileSync(join(repo, 'src', 'other.ts'), 'export const c = 4;\n');
      commitAll('base advances');

      execFileSync('git', [
        'clone', '-q', '--depth=1', '--branch', 'feature',
        `file://${repo}`, shallow,
      ], { encoding: 'utf8' });
      execFileSync('git', ['fetch', '-q', '--no-tags', '--depth=1', 'origin', 'main'], {
        cwd: shallow,
      });

      let status = 0;
      let stderr = '';
      try {
        execFileSync('node', [SCRIPT], {
          cwd: shallow,
          encoding: 'utf8',
          env: {
            ...process.env,
            GIT_WARP_QUARANTINE_ROOT: shallow,
            GIT_WARP_QUARANTINE_BASE: 'origin/main',
          },
        });
      } catch (raw) {
        const err = raw as { status?: number; stderr?: string };
        status = err.status ?? -1;
        stderr = err.stderr ?? '';
      }

      expect(status).toBe(2);
      expect(stderr).toContain('fails closed');
    } finally {
      rmSync(shallow, { recursive: true, force: true });
    }
  });
});

describe('quarantine graduate-check touched-path handling', () => {
  it('passes when only unquarantined files change', () => {
    writeFileSync(join(repo, 'src', 'clean.ts'), 'export const b = 9;\n');
    commitAll('touch clean file');

    expect(runGate('base-ref').status).toBe(0);
  });

  it('fails when a quarantined file is modified without graduating', () => {
    writeFileSync(join(repo, 'src', 'dirty.ts'), 'export const a = 99;\n');
    commitAll('touch quarantined file');

    const result = runGate('base-ref');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('src/dirty.ts');
  });

  it('fails on a whitespace-only edit to a quarantined file', () => {
    // --name-only carries no content semantics by design: touching
    // contaminated ground at all means acknowledging it.
    writeFileSync(join(repo, 'src', 'dirty.ts'), 'export const a = 1;\n\n');
    commitAll('reformat quarantined file');

    expect(runGate('base-ref').status).toBe(1);
  });

  it('fails when a quarantined file is moved without graduating', () => {
    // The move must not launder the path. With --no-renames the deletion of
    // the old path keeps it in the touched set.
    git('mv', 'src/dirty.ts', 'src/moved.ts');
    commitAll('move quarantined file');

    const result = runGate('base-ref');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('src/dirty.ts');
  });

  it('fails when a quarantined file is moved into an excluded-looking tree', () => {
    mkdirSync(join(repo, 'test', 'helpers'), { recursive: true });
    git('mv', 'src/dirty.ts', 'test/helpers/dirty.ts');
    commitAll('launder quarantined file into helpers');

    expect(runGate('base-ref').status).toBe(1);
  });

  it('passes when a quarantined file is deleted and its entry removed', () => {
    rmSync(join(repo, 'src', 'dirty.ts'));
    writeManifest([]);
    commitAll('delete quarantined file and graduate the manifest');

    expect(runGate('base-ref').status).toBe(0);
  });

  it('passes when a quarantined file is copied, leaving the original untouched', () => {
    // The copy is new code. It is not quarantined and must never become
    // quarantined; the rule engines judge it on its own merits.
    writeFileSync(join(repo, 'src', 'copy.ts'), 'export const a = 1;\n');
    commitAll('copy quarantined content to a new path');

    expect(runGate('base-ref').status).toBe(0);
  });
});

describe('quarantine graduate-check path fidelity', () => {
  it('preserves a trailing space in a quarantined path', () => {
    // `-z` output is a protocol, not human-readable lines. The space here is
    // the final byte of the path, so `.trim()` rewrites it and the emitted
    // path stops matching its manifest entry — the gate then reports PASS on
    // a touched quarantined file. Interior whitespace does not exercise this;
    // the whitespace has to terminate the path.
    const awkward = 'src/trailing.ts ';
    writeFileSync(join(repo, awkward), 'export const d = 1;\n');
    writeManifest(['src/dirty.ts', awkward]);
    commitAll('add trailing-space path to quarantine');
    git('branch', '-f', 'base-ref');

    writeFileSync(join(repo, awkward), 'export const d = 2;\n');
    commitAll('touch trailing-space path');

    const result = runGate('base-ref');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(awkward);
  });

  it('preserves interior whitespace in a quarantined path', () => {
    const awkward = 'src/two  spaces\tand tab.ts';
    writeFileSync(join(repo, awkward), 'export const e = 1;\n');
    writeManifest(['src/dirty.ts', awkward]);
    commitAll('add interior-whitespace path to quarantine');
    git('branch', '-f', 'base-ref');

    writeFileSync(join(repo, awkward), 'export const e = 2;\n');
    commitAll('touch interior-whitespace path');

    expect(runGate('base-ref').status).toBe(1);
  });
});
