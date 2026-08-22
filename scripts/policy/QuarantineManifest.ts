// SPDX-License-Identifier: Apache-2.0

/**
 * Quarantine manifest, schema version 2.
 *
 * Version 1 was a suppression list: `rules[] x files[]`, a cross product.
 * A file listed for a family was exempt from every rule in that family,
 * including rules it had never violated, and nothing recorded how many
 * violations an entry sheltered or when they were observed. That shape
 * cannot support the invariant the gate depends on.
 *
 * Version 2 is recorded evidence. Each entry is addressed by
 * `(engine, rule_id, path)` and carries the exact multiset of finding
 * fingerprints observed at that address, plus the Git blob OID of the file
 * that produced them. The manifest as a whole records the baseline commit
 * and a digest of the policy that generated the evidence.
 *
 * ## The claim a manifest makes
 *
 * Let `P` be the policy at the pull-request head, `B` the recorded baseline
 * commit, `H` the head, and `F(P, X)` the unsuppressed findings from running
 * `P` over tree `X`. For every entry at address `a`, the manifest asserts:
 *
 *     recorded_fingerprints(a) = fingerprints(F(P, B)[a]) = fingerprints(F(P, H)[a])
 *
 * A manifest is a cached proof, never testimony. `baseline_sha` on its own
 * proves nothing: a contributor can stamp any commit onto evidence generated
 * entirely from the head. The verifier must rederive by running the HEAD
 * policy against the BASE tree. Recording the policy digest is what makes
 * that rederivation meaningful, because it pins which rules and which
 * applicability model produced the recorded numbers.
 *
 * ## What `generated_at` is worth
 *
 * Nothing, as provenance. It is retained for human bookkeeping only. The
 * generator deliberately preserves it across regenerations, so it does not
 * record when anything was observed.
 *
 * @module scripts/policy/QuarantineManifest
 */

import { createHash } from 'node:crypto';
import { isPolicyEngine, type PolicyEngine } from './FindingFingerprint.ts';

export const QUARANTINE_SCHEMA_VERSION = 2;

const FULL_SHA = /^[0-9a-f]{40}$/u;
const BLOB_OID = /^[0-9a-f]{40}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

/** One quarantined `(engine, rule_id, path)` address and its evidence. */
export class QuarantineEntry {
  readonly engine: PolicyEngine;
  readonly ruleId: string;
  readonly path: string;
  readonly baseBlobOid: string;
  readonly fingerprints: readonly string[];

  constructor({ engine, ruleId, path, baseBlobOid, fingerprints }: {
    readonly engine: PolicyEngine;
    readonly ruleId: string;
    readonly path: string;
    readonly baseBlobOid: string;
    readonly fingerprints: readonly string[];
  }) {
    if (!BLOB_OID.test(baseBlobOid)) {
      throw new QuarantineSchemaError(
        `entry ${engine}/${ruleId}/${path} has a malformed base_blob_oid`,
      );
    }
    if (fingerprints.length === 0) {
      throw new QuarantineSchemaError(
        `entry ${engine}/${ruleId}/${path} records no findings; `
        + 'an entry with no evidence is a suppression, not a quarantine',
      );
    }
    for (const fingerprint of fingerprints) {
      if (!DIGEST.test(fingerprint)) {
        throw new QuarantineSchemaError(
          `entry ${engine}/${ruleId}/${path} has a malformed fingerprint`,
        );
      }
    }
    const sorted = [...fingerprints].sort();
    if (sorted.some((value, index) => value !== fingerprints[index])) {
      throw new QuarantineSchemaError(
        `entry ${engine}/${ruleId}/${path} lists fingerprints out of order; `
        + 'order must not carry information',
      );
    }
    this.engine = engine;
    this.ruleId = ruleId;
    this.path = path;
    this.baseBlobOid = baseBlobOid;
    this.fingerprints = Object.freeze([...fingerprints]);
  }

  address(): string {
    return `${this.engine} ${this.ruleId} ${this.path}`;
  }
}

export class QuarantineSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuarantineSchemaError';
  }
}

/** A whole manifest: baseline provenance plus its entries. */
export class QuarantineManifest {
  readonly manifestId: string;
  readonly owningCycle: string;
  readonly ruleFamily: string;
  readonly baselineSha: string;
  readonly policyDigest: string;
  readonly entries: readonly QuarantineEntry[];

  constructor({ manifestId, owningCycle, ruleFamily, baselineSha, policyDigest, entries }: {
    readonly manifestId: string;
    readonly owningCycle: string;
    readonly ruleFamily: string;
    readonly baselineSha: string;
    readonly policyDigest: string;
    readonly entries: readonly QuarantineEntry[];
  }) {
    if (!FULL_SHA.test(baselineSha)) {
      throw new QuarantineSchemaError(
        `${manifestId}: baseline_sha must be a full 40-character commit sha`,
      );
    }
    if (!DIGEST.test(policyDigest)) {
      throw new QuarantineSchemaError(`${manifestId}: malformed policy_digest`);
    }
    const seen = new Set<string>();
    for (const entry of entries) {
      const address = entry.address();
      if (seen.has(address)) {
        throw new QuarantineSchemaError(
          `${manifestId}: duplicate quarantine address ${address}; `
          + 'one address carries exactly one evidence multiset',
        );
      }
      seen.add(address);
    }
    this.manifestId = manifestId;
    this.owningCycle = owningCycle;
    this.ruleFamily = ruleFamily;
    this.baselineSha = baselineSha;
    this.policyDigest = policyDigest;
    this.entries = Object.freeze([...entries]);
  }

  /** Repository-relative paths this manifest quarantines, deduplicated. */
  quarantinedPaths(): ReadonlySet<string> {
    return new Set(this.entries.map((entry) => entry.path));
  }

  entryAt(address: string): QuarantineEntry | undefined {
    return this.entries.find((entry) => entry.address() === address);
  }
}

/**
 * Parses a manifest document.
 *
 * Rejects version 1 explicitly rather than attempting a silent upgrade: a v1
 * cross product cannot be converted into occurrence evidence without
 * rerunning the engines, and inventing fingerprints during a migration would
 * fabricate exactly the provenance this schema exists to require.
 */
export function parseQuarantineManifest(value: unknown, source: string): QuarantineManifest {
  const doc = asRecord(value, source);
  const schemaVersion = doc['schema_version'];
  if (schemaVersion !== QUARANTINE_SCHEMA_VERSION) {
    throw new QuarantineSchemaError(
      `${source}: expected schema_version ${String(QUARANTINE_SCHEMA_VERSION)}, `
      + `found ${JSON.stringify(schemaVersion)}. Version 1 manifests are `
      + 'suppression lists and must be regenerated as evidence, not upgraded.',
    );
  }
  const rawEntries = doc['entries'];
  if (!Array.isArray(rawEntries)) {
    throw new QuarantineSchemaError(`${source}: entries must be an array`);
  }
  return new QuarantineManifest({
    manifestId: requireString(doc, 'manifest_id', source),
    owningCycle: requireString(doc, 'owning_cycle', source),
    ruleFamily: requireString(doc, 'rule_family', source),
    baselineSha: requireString(doc, 'baseline_sha', source),
    policyDigest: requireString(doc, 'policy_digest', source),
    entries: rawEntries.map((entry, index) => parseEntry(entry, `${source}[${String(index)}]`)),
  });
}

function parseEntry(value: unknown, source: string): QuarantineEntry {
  const doc = asRecord(value, source);
  const engine = requireString(doc, 'engine', source);
  if (!isPolicyEngine(engine)) {
    throw new QuarantineSchemaError(`${source}: unknown engine ${engine}`);
  }
  const fingerprints = doc['finding_fingerprints'];
  if (!Array.isArray(fingerprints)) {
    throw new QuarantineSchemaError(`${source}: finding_fingerprints must be an array`);
  }
  return new QuarantineEntry({
    engine,
    ruleId: requireString(doc, 'rule_id', source),
    path: requireString(doc, 'path', source),
    baseBlobOid: requireString(doc, 'base_blob_oid', source),
    fingerprints: fingerprints.map((fingerprint, index) => {
      if (typeof fingerprint !== 'string') {
        throw new QuarantineSchemaError(
          `${source}: finding_fingerprints[${String(index)}] must be a string`,
        );
      }
      return fingerprint;
    }),
  });
}

/**
 * Transport shape of a decoded JSON object.
 *
 * Declared as a named alias with a type-guard predicate rather than reached
 * through a cast. This is the sanctioned boundary-decoder pattern: it is the
 * only way to cross from `unknown` into typed code without an `as`.
 */
type JsonRecord = { readonly [key: string]: unknown };

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, source: string): JsonRecord {
  if (!isJsonRecord(value)) {
    throw new QuarantineSchemaError(`${source}: expected an object`);
  }
  return value;
}

function requireString(
  doc: JsonRecord,
  key: string,
  source: string,
): string {
  const value = doc[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new QuarantineSchemaError(`${source}: ${key} must be a non-empty string`);
  }
  return value;
}

/**
 * Digest of everything that decides which findings an engine emits.
 *
 * Recorded evidence is only comparable to fresh output when both came from
 * the same policy. Rule text, path applicability, rule-specific exclusions,
 * wrapper behaviour and the fingerprint normalization version all belong
 * here: change any of them and the recorded numbers describe a different
 * question.
 */
export function policyDigest(inputs: readonly { name: string; content: string }[]): string {
  const hash = createHash('sha256');
  for (const input of [...inputs].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    hash.update(input.name, 'utf8');
    hash.update('\0', 'utf8');
    hash.update(input.content, 'utf8');
    hash.update('\0', 'utf8');
  }
  return `sha256:${hash.digest('hex')}`;
}
