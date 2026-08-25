import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = new URL('../../../', import.meta.url);

type LockedPackage = Readonly<{
  version?: string;
}>;

type PackageLock = Readonly<{
  packages: Readonly<Record<string, LockedPackage>>;
}>;

type Version = readonly [major: number, minor: number, patch: number];

async function repositoryText(relativePath: string): Promise<string> {
  return await readFile(new URL(relativePath, REPO_ROOT), 'utf8');
}

function parseVersion(value: string): Version {
  const match = /^(\d+)\.(\d+)\.(\d+)/u.exec(value);
  if (match === null) {
    throw new Error(`Expected a three-part package version, received ${value}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isAtLeast(actual: Version, minimum: Version): boolean {
  for (let index = 0; index < actual.length; index += 1) {
    const actualPart = actual[index];
    const minimumPart = minimum[index];
    if (actualPart === undefined || minimumPart === undefined) {
      throw new Error('Version tuples must have equal cardinality');
    }
    if (actualPart !== minimumPart) {
      return actualPart > minimumPart;
    }
  }
  return true;
}

function lockedVersions(lock: PackageLock, packageName: string): readonly Version[] {
  return Object.entries(lock.packages)
    .filter(([path]) => path.endsWith(`/node_modules/${packageName}`) || path === `node_modules/${packageName}`)
    .map(([, entry]) => parseVersion(entry.version ?? ''));
}

function expectMinimumByMajor(
  versions: readonly Version[],
  minimums: Readonly<Record<number, Version>>
): void {
  expect(versions.length).toBeGreaterThan(0);
  for (const version of versions) {
    const minimum = minimums[version[0]];
    if (minimum !== undefined) {
      expect(isAtLeast(version, minimum)).toBe(true);
    }
  }
}

describe('development-tool audit lock', () => {
  it('keeps every currently affected transitive package at a fixed version floor', async () => {
    const lock = JSON.parse(await repositoryText('package-lock.json')) as PackageLock;

    expectMinimumByMajor(lockedVersions(lock, 'brace-expansion'), {
      1: [1, 1, 18],
      2: [2, 1, 4],
      4: [5, 0, 9],
      5: [5, 0, 9],
    });
    expectMinimumByMajor(lockedVersions(lock, 'js-yaml'), { 4: [4, 3, 1] });
    expectMinimumByMajor(lockedVersions(lock, 'nanoid'), { 3: [3, 3, 18] });
    expectMinimumByMajor(lockedVersions(lock, 'dompurify'), { 3: [3, 4, 13] });
    expectMinimumByMajor(lockedVersions(lock, 'mermaid'), { 11: [11, 16, 1] });
  });

  it('makes the full locked dependency audit a required CI and release gate', async () => {
    const [packageJsonText, ci, preflight] = await Promise.all([
      repositoryText('package.json'),
      repositoryText('.github/workflows/ci.yml'),
      repositoryText('scripts/release-preflight.sh'),
    ]);
    const packageJson = JSON.parse(packageJsonText) as {
      readonly scripts: Readonly<Record<string, string>>;
    };

    expect(packageJson.scripts['audit:locked']).toBe('npm audit --audit-level=low');
    expect(ci).toContain('type-firewall-audit:');
    expect(ci).toContain('- type-firewall-audit');
    expect(ci).toContain("test \"${{ needs['type-firewall-audit'].result }}\" = \"success\"");
    expect(ci).not.toContain('type-firewall-audit-advisory:');
    expect(preflight).toContain('npm run audit:locked');
  });
});
