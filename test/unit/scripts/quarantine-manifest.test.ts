import { describe, expect, it } from 'vitest';
import {
  PolicyFinding,
  fingerprintMultiset,
  groupByAddress,
  multisetsMatch,
} from '../../../scripts/policy/FindingFingerprint.ts';
import {
  QuarantineEntry,
  QuarantineManifest,
  QuarantineSchemaError,
  parseQuarantineManifest,
  policyDigest,
} from '../../../scripts/policy/QuarantineManifest.ts';

/**
 * The quarantine schema exists to make a specific class of dishonesty
 * impossible: recording an exemption that is not backed by an observed
 * violation. These tests pin the shapes that would let one through.
 */

const OID = 'a'.repeat(40);
const SHA = 'b'.repeat(40);

function finding(overrides: Partial<{
  ruleId: string;
  path: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}> = {}): PolicyFinding {
  return new PolicyFinding({
    engine: 'semgrep',
    ruleId: overrides.ruleId ?? 'ts-no-unknown-outside-adapters',
    path: overrides.path ?? 'scripts/example.ts',
    startLine: overrides.startLine ?? 10,
    startColumn: overrides.startColumn ?? 3,
    endLine: overrides.endLine ?? 10,
    endColumn: overrides.endColumn ?? 20,
  });
}

function entry(overrides: Partial<{
  ruleId: string;
  path: string;
  fingerprints: readonly string[];
}> = {}): QuarantineEntry {
  return new QuarantineEntry({
    engine: 'semgrep',
    ruleId: overrides.ruleId ?? 'ts-no-unknown-outside-adapters',
    path: overrides.path ?? 'scripts/example.ts',
    baseBlobOid: OID,
    fingerprints: overrides.fingerprints ?? [finding().fingerprint()],
  });
}

/** Transport shape of a decoded manifest document, spelled without a cast. */
type JsonRecord = { readonly [key: string]: unknown };

function manifestDocument(
  entries: readonly unknown[],
  overrides: JsonRecord = {},
): unknown {
  return {
    schema_version: 2,
    manifest_id: 'TEST-family',
    owning_cycle: 'TEST',
    rule_family: 'test',
    baseline_sha: SHA,
    policy_digest: `sha256:${'c'.repeat(64)}`,
    entries,
    ...overrides,
  };
}

function entryDocument(overrides: JsonRecord = {}): unknown {
  return {
    engine: 'semgrep',
    rule_id: 'ts-no-unknown-outside-adapters',
    path: 'scripts/example.ts',
    base_blob_oid: OID,
    finding_fingerprints: [finding().fingerprint()],
    ...overrides,
  };
}

describe('finding fingerprints', () => {
  it('is stable for the same occurrence', () => {
    expect(finding().fingerprint()).toBe(finding().fingerprint());
  });

  it('distinguishes two occurrences of one rule in one file', () => {
    // Without this, quarantining one violation licenses every future
    // violation of the same rule in the same file.
    const first = finding({ startLine: 10 });
    const second = finding({ startLine: 42 });

    expect(first.fingerprint()).not.toBe(second.fingerprint());
    expect(first.address()).toBe(second.address());
  });

  it('distinguishes occurrences that differ only by column', () => {
    expect(finding({ startColumn: 3 }).fingerprint())
      .not.toBe(finding({ startColumn: 9 }).fingerprint());
  });

  it('sorts fingerprints so reporter ordering cannot leak in', () => {
    const findings = [finding({ startLine: 50 }), finding({ startLine: 2 })];
    const reversed = [...findings].reverse();

    expect(fingerprintMultiset(findings)).toEqual(fingerprintMultiset(reversed));
  });

  it('keeps duplicates rather than collapsing them into a set', () => {
    const duplicated = [finding(), finding()];

    expect(fingerprintMultiset(duplicated)).toHaveLength(2);
  });

  it('treats multisets with different occurrence counts as different', () => {
    const one = fingerprintMultiset([finding()]);
    const two = fingerprintMultiset([finding(), finding()]);

    expect(multisetsMatch(one, two)).toBe(false);
    expect(multisetsMatch(one, [...one])).toBe(true);
  });

  it('groups findings by (engine, rule, path)', () => {
    const grouped = groupByAddress([
      finding({ startLine: 1 }),
      finding({ startLine: 2 }),
      finding({ path: 'scripts/other.ts' }),
    ]);

    expect(grouped.size).toBe(2);
    expect(grouped.get('semgrep ts-no-unknown-outside-adapters scripts/example.ts'))
      .toHaveLength(2);
  });
});

describe('quarantine entry evidence', () => {
  it('refuses an entry that records no findings', () => {
    // An address with no evidence is a suppression wearing a quarantine
    // costume: nothing proves a violation was ever there.
    expect(() => entry({ fingerprints: [] }))
      .toThrow(/records no findings/u);
  });

  it('refuses fingerprints listed out of order', () => {
    const sorted = fingerprintMultiset([finding({ startLine: 1 }), finding({ startLine: 2 })]);

    expect(() => entry({ fingerprints: [...sorted].reverse() }))
      .toThrow(/out of order/u);
  });

  it('refuses a malformed blob oid', () => {
    expect(() => new QuarantineEntry({
      engine: 'semgrep',
      ruleId: 'r',
      path: 'p',
      baseBlobOid: 'not-an-oid',
      fingerprints: [finding().fingerprint()],
    })).toThrow(/base_blob_oid/u);
  });

  it('refuses a malformed fingerprint', () => {
    expect(() => entry({ fingerprints: ['md5:whatever'] }))
      .toThrow(/malformed fingerprint/u);
  });
});

describe('quarantine manifest', () => {
  it('accepts a well-formed version 2 document', () => {
    const parsed = parseQuarantineManifest(
      manifestDocument([entryDocument()]),
      'fixture',
    );

    expect(parsed.baselineSha).toBe(SHA);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.quarantinedPaths()).toEqual(new Set(['scripts/example.ts']));
  });

  it('rejects a version 1 manifest instead of upgrading it', () => {
    // A v1 cross product carries no occurrence evidence. Synthesising
    // fingerprints during a migration would fabricate the exact provenance
    // this schema exists to demand.
    const v1 = {
      schema_version: 1,
      manifest_id: 'TEST-family',
      owning_cycle: 'TEST',
      rule_family: 'test',
      rules: ['ts-no-unknown-outside-adapters'],
      files: ['scripts/example.ts'],
    };

    expect(() => parseQuarantineManifest(v1, 'fixture'))
      .toThrow(QuarantineSchemaError);
    expect(() => parseQuarantineManifest(v1, 'fixture'))
      .toThrow(/must be regenerated as evidence, not upgraded/u);
  });

  it('rejects duplicate addresses', () => {
    expect(() => parseQuarantineManifest(
      manifestDocument([entryDocument(), entryDocument()]),
      'fixture',
    )).toThrow(/duplicate quarantine address/u);
  });

  it('allows one path to be quarantined under different rules', () => {
    const parsed = parseQuarantineManifest(
      manifestDocument([
        entryDocument(),
        entryDocument({ rule_id: 'ts-no-json-parse-in-core' }),
      ]),
      'fixture',
    );

    expect(parsed.entries).toHaveLength(2);
    expect(parsed.quarantinedPaths().size).toBe(1);
  });

  it('rejects an abbreviated baseline sha', () => {
    expect(() => parseQuarantineManifest(
      manifestDocument([entryDocument()], { baseline_sha: 'abc1234' }),
      'fixture',
    )).toThrow(/full 40-character commit sha/u);
  });

  it('rejects an unknown engine', () => {
    expect(() => parseQuarantineManifest(
      manifestDocument([entryDocument({ engine: 'tsc' })]),
      'fixture',
    )).toThrow(/unknown engine tsc/u);
  });

  it('rejects a duplicate address built directly, not only when parsed', () => {
    expect(() => new QuarantineManifest({
      manifestId: 'TEST',
      owningCycle: 'TEST',
      ruleFamily: 'test',
      baselineSha: SHA,
      policyDigest: `sha256:${'c'.repeat(64)}`,
      entries: [entry(), entry()],
    })).toThrow(/duplicate quarantine address/u);
  });
});

describe('policy digest', () => {
  it('is independent of input ordering', () => {
    const a = { name: 'rules.yml', content: 'x' };
    const b = { name: 'applicability.json', content: 'y' };

    expect(policyDigest([a, b])).toBe(policyDigest([b, a]));
  });

  it('changes when any policy input changes', () => {
    const base = [{ name: 'rules.yml', content: 'x' }];

    expect(policyDigest(base))
      .not.toBe(policyDigest([{ name: 'rules.yml', content: 'x2' }]));
    expect(policyDigest(base))
      .not.toBe(policyDigest([{ name: 'rules2.yml', content: 'x' }]));
  });

  it('cannot be spoofed by moving content between inputs', () => {
    // Framing each field prevents `{a: "xy"}` and `{ax: "y"}` colliding.
    expect(policyDigest([{ name: 'a', content: 'xy' }]))
      .not.toBe(policyDigest([{ name: 'ax', content: 'y' }]));
  });
});
