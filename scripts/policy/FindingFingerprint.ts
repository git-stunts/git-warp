// SPDX-License-Identifier: Apache-2.0

/**
 * Canonical fingerprints for policy findings.
 *
 * A quarantine entry is addressed by `(engine, rule_id, path)`, but an
 * address alone cannot say how many violations it shelters. Without
 * occurrence-level evidence, quarantining one `unknown` in a file silently
 * licenses every future `unknown` in that same file under the same rule.
 * Fingerprints close that hole: the entry records the exact multiset of
 * findings observed at its address, and the verifier rejects the baseline
 * if an occurrence appears, disappears, or moves.
 *
 * ## What a fingerprint may depend on
 *
 * Only material that is stable across machines and reporter versions:
 * engine, rule id, repository-relative path, and the source span. Absolute
 * paths, the working directory, result ordering, severity, and the rendered
 * diagnostic message are all excluded. A prettier error string is not a
 * change in what the code does wrong, and must not invalidate a baseline.
 *
 * Content is NOT hashed here. The manifest binds file content separately
 * through `base_blob_oid`, which is Git's own content hash. Splitting the
 * two keeps each piece of evidence answerable to one question: the blob OID
 * proves which bytes were scanned, the fingerprint proves which occurrences
 * those bytes produced.
 *
 * ## Versioning
 *
 * `FINGERPRINT_NORMALIZATION_VERSION` participates in the policy digest.
 * Changing how a fingerprint is derived invalidates every recorded baseline,
 * which is correct: the recorded evidence was produced by a different
 * function and can no longer be compared against fresh output.
 *
 * @module scripts/policy/FindingFingerprint
 */

import { createHash } from 'node:crypto';

export const FINGERPRINT_NORMALIZATION_VERSION = 1;

/** Engines whose findings can be quarantined. */
export const POLICY_ENGINES = Object.freeze(['eslint', 'semgrep'] as const);

export type PolicyEngine = (typeof POLICY_ENGINES)[number];

export function isPolicyEngine(value: string): value is PolicyEngine {
  return (POLICY_ENGINES as readonly string[]).includes(value);
}

/**
 * One violation as reported by an engine, reduced to the fields a
 * fingerprint may depend on.
 */
export class PolicyFinding {
  readonly engine: PolicyEngine;
  readonly ruleId: string;
  readonly path: string;
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;

  constructor({ engine, ruleId, path, startLine, startColumn, endLine, endColumn }: {
    readonly engine: PolicyEngine;
    readonly ruleId: string;
    readonly path: string;
    readonly startLine: number;
    readonly startColumn: number;
    readonly endLine: number;
    readonly endColumn: number;
  }) {
    if (ruleId.length === 0) {
      throw new Error('A policy finding requires a rule id');
    }
    if (path.length === 0) {
      throw new Error('A policy finding requires a repository-relative path');
    }
    this.engine = engine;
    this.ruleId = ruleId;
    this.path = path;
    this.startLine = startLine;
    this.startColumn = startColumn;
    this.endLine = endLine;
    this.endColumn = endColumn;
  }

  /** `(engine, rule_id, path)`, the quarantine address this finding sits at. */
  address(): string {
    return `${this.engine} ${this.ruleId} ${this.path}`;
  }

  /**
   * Stable digest of this occurrence.
   *
   * Field order is fixed by this function, not by object key order, so the
   * digest cannot drift with serializer behaviour.
   */
  fingerprint(): string {
    const canonical = [
      String(FINGERPRINT_NORMALIZATION_VERSION),
      this.engine,
      this.ruleId,
      this.path,
      String(this.startLine),
      String(this.startColumn),
      String(this.endLine),
      String(this.endColumn),
    ].join(' ');
    return `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
  }
}

/**
 * Fingerprints for one address as a sorted multiset.
 *
 * Sorted so ordering cannot leak in from reporter output. A multiset, not a
 * set: two identical-looking violations at the same coordinates would be a
 * genuine duplicate and must not silently collapse into one.
 */
export function fingerprintMultiset(
  findings: readonly PolicyFinding[],
): readonly string[] {
  return Object.freeze(findings.map((finding) => finding.fingerprint()).sort());
}

/** Groups findings by their quarantine address. */
export function groupByAddress(
  findings: readonly PolicyFinding[],
): ReadonlyMap<string, readonly PolicyFinding[]> {
  const grouped = new Map<string, PolicyFinding[]>();
  for (const finding of findings) {
    const key = finding.address();
    const bucket = grouped.get(key);
    if (bucket === undefined) {
      grouped.set(key, [finding]);
    } else {
      bucket.push(finding);
    }
  }
  return grouped;
}

/** True when two multisets hold the same fingerprints the same number of times. */
export function multisetsMatch(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}
