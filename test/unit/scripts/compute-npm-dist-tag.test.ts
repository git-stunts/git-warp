/**
 * Which dist-tag a release may claim.
 *
 * `latest` is what a bare `npm install` resolves to. The release workflow used
 * to hand it to every non-prerelease tag, so a maintenance release of an older
 * major would have moved every new install backwards — irreversibly, since a
 * published version cannot be withdrawn.
 *
 * The decision lives in a script rather than inline in YAML so that it can be
 * exercised against the cases that matter, including the ones where the
 * registry does not answer.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../../../scripts/compute-npm-dist-tag.sh', import.meta.url));

/** Runs the decision with an injected registry answer. */
function decide(
  tagVersion: string,
  probe?: { out: string; status?: number },
): { tag: string | null; status: number; stderr: string } {
  const env: Record<string, string | undefined> = { ...process.env };
  if (probe !== undefined) {
    env['NPM_DIST_TAG_PROBE_OUT'] = probe.out;
    env['NPM_DIST_TAG_PROBE_STATUS'] = String(probe.status ?? 0);
  }
  try {
    const stdout = execFileSync(SCRIPT, [tagVersion], { env, encoding: 'utf8' });
    return { tag: stdout.trim(), status: 0, stderr: '' };
  } catch (error) {
    const err = error as { status?: number; stderr?: string };
    return { tag: null, status: err.status ?? -1, stderr: err.stderr ?? '' };
  }
}

describe('npm dist-tag decision', () => {
  describe('prereleases keep their own channels', () => {
    it.each([
      ['19.2.0-rc.1', 'next'],
      ['19.2.0-beta.3', 'beta'],
      ['19.2.0-alpha.7', 'alpha'],
    ])('%s publishes to %s', (version, expected) => {
      expect(decide(version).tag).toBe(expected);
    });

    it('does not consult the registry for a prerelease', () => {
      // An unreachable registry must not block a prerelease, which can never
      // claim `latest` anyway.
      expect(decide('19.2.0-rc.1', { out: 'network timeout', status: 1 }).tag).toBe('next');
    });
  });

  describe('a stable tag claims latest only when it is at or above it', () => {
    it.each([
      ['20.0.0', '19.1.0', 'latest'],
      ['19.2.0', '19.1.0', 'latest'],
      ['19.1.1', '19.1.0', 'latest'],
      ['19.1.0', '19.1.0', 'latest'],
    ])('%s over published %s -> %s', (version, published, expected) => {
      expect(decide(version, { out: published }).tag).toBe(expected);
    });

    it.each([
      ['16.0.1', '19.1.0', 'maintenance-v16'],
      ['16.0.2', '19.1.0', 'maintenance-v16'],
      ['17.3.9', '19.1.0', 'maintenance-v17'],
      ['18.0.0', '19.1.0', 'maintenance-v18'],
    ])('%s under published %s -> %s', (version, published, expected) => {
      expect(decide(version, { out: published }).tag).toBe(expected);
    });

    it('orders by version, not lexically', () => {
      // A lexical compare puts 9.0.0 above 10.0.0 and would demote a real release.
      expect(decide('10.0.0', { out: '9.0.0' }).tag).toBe('latest');
      expect(decide('9.0.0', { out: '10.0.0' }).tag).toBe('maintenance-v9');
    });
  });

  describe('the maintenance tag cannot be read as a version range', () => {
    it('is not a bare major, which npm would resolve as a range', () => {
      // `v16` and `16.x` both parse as >=16.0.0 <17.0.0-0, so installing
      // `pkg@v16` would resolve as a range and never read the dist-tag.
      const tag = decide('16.0.1', { out: '19.1.0' }).tag;
      expect(tag).not.toBe('v16');
      expect(tag).not.toBe('16.x');
      expect(tag).toBe('maintenance-v16');
    });
  });

  describe('it refuses rather than guessing', () => {
    it('refuses when the registry cannot be read', () => {
      const result = decide('16.0.1', { out: 'network timeout', status: 1 });
      expect(result.tag).toBeNull();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Refusing');
    });

    it('refuses when the registry answers with no usable version', () => {
      // An empty answer would sort below every tag and hand out `latest`.
      const result = decide('16.0.1', { out: '' });
      expect(result.tag).toBeNull();
      expect(result.status).toBe(1);
    });

    it('refuses when the answer is not a version at all', () => {
      const result = decide('16.0.1', { out: 'undefined' });
      expect(result.tag).toBeNull();
      expect(result.status).toBe(1);
    });

    it('treats an unpublished package as a first release, not a failure', () => {
      // E404 means there is nothing to demote.
      expect(decide('1.0.0', { out: 'npm error code E404', status: 1 }).tag).toBe('latest');
    });

    it('rejects a missing argument instead of defaulting', () => {
      expect(decide('').status).toBe(2);
    });
  });
});
