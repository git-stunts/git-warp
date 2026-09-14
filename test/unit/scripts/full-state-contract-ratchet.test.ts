import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const sourceRoot = join(repoRoot, 'src');

/**
 * Contracts that hand a complete graph state across a production boundary.
 *
 * A real Think migration promoted its refs and then failed verification because
 * a 23,995,927-byte replay basis met the 5 MiB production CBOR ceiling. Bounded
 * reading elsewhere did not help, because these contracts are the escape hatch
 * that reconstitutes the whole graph regardless. Renaming one of them does not
 * satisfy this ratchet; the operation has to stop existing in production.
 */
const FORBIDDEN_FULL_STATE_CONTRACTS = Object.freeze([
  'encodeWarpFullState',
  'decodeWarpFullState',
  'decodeCanonicalWarpFullState',
  'loadReplayBasis',
  '_materializeGraph',
]);

function typeScriptSourcesUnder(directory: string): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...typeScriptSourcesUnder(absolute));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      found.push(absolute);
    }
  }
  return found;
}

describe('full state contract ratchet', () => {
  const sources = typeScriptSourcesUnder(sourceRoot);

  it('reads a non-trivial production source set', () => {
    expect(sources.length).toBeGreaterThan(500);
  });

  for (const contract of FORBIDDEN_FULL_STATE_CONTRACTS) {
    it(`keeps ${contract} out of production source`, () => {
      const offenders = sources
        .filter((path) => readFileSync(path, 'utf8').includes(contract))
        .map((path) => relative(repoRoot, path))
        .sort();

      expect(offenders).toStrictEqual([]);
    });
  }
});
