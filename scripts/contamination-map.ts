#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Contamination-map generator — walks src/ and writes one
 * quarantine manifest per sludge family under
 * policy/quarantines/0025{A,B,C,D}-*.json.
 *
 * This script does not decide policy; it reports reality. Each
 * family's detection pattern mirrors a rule in
 * semgrep/typescript-anti-sludge.yml or eslint.config.js. If the
 * detection and the enforcement drift, CI breaks until both agree.
 *
 * Run: npm run lint:contamination
 *
 * Design notes:
 * - Detection uses simple regex walks over file content rather than
 *   the TypeScript AST. That's sufficient for these rules and avoids
 *   a tsc-vs-regex discrepancy — Semgrep uses regex here too.
 * - Adapter carve-outs (for unknown / Record<string, unknown>) are
 *   enforced by scope: those rules only run against src/domain/**
 *   and src/ports/**, not src/infrastructure/**.
 * - Manifests are sorted. Regeneration must be deterministic.
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(THIS_FILE), '..');
const QUARANTINE_DIR = join(REPO_ROOT, 'policy', 'quarantines');

/** Scopes for applying detection rules. */
type Scope =
  | 'all-src'           // every *.ts under src/
  | 'core-only'         // src/domain/** and src/ports/**
  | 'domain-only';      // src/domain/** only

interface DetectionRule {
  readonly id: string;
  readonly pattern: RegExp;
  readonly scope: Scope;
}

interface FamilyDefinition {
  readonly manifestId: string;
  readonly owningCycle: string;
  readonly ruleFamily: string;
  readonly rules: readonly string[];
  readonly rationale: string;
  readonly detections: readonly DetectionRule[];
}

const FAMILIES: readonly FamilyDefinition[] = [
  {
    manifestId: '0025A-casts',
    owningCycle: '0025A',
    ruleFamily: 'casts',
    rules: ['ts-no-double-cast'],
    rationale:
      'Pre-existing `as unknown as` uses discovered at anti-sludge policy adoption time. Each entry grants file-level exemption from ts-no-double-cast ONLY. Graduate by removing the cast (prefer decoder / type guard / narrower port), not by adding an inline suppression unless the specific line has a documented reason that cannot be refactored away.',
    detections: [
      { id: 'as-unknown-as', pattern: /\bas\s+unknown\s+as\b/, scope: 'all-src' },
    ],
  },
  {
    manifestId: '0025B-boundary',
    owningCycle: '0025B',
    ruleFamily: 'boundary',
    rules: [
      'ts-no-unknown-outside-adapters',
      'ts-no-record-string-unknown-outside-adapters',
      'ts-no-json-parse-in-core',
      'ts-no-json-stringify-in-core',
      'ts-no-fetch-in-core',
      'ts-no-process-env-in-core',
    ],
    rationale:
      'Pre-existing raw-shape or I/O leaks in core (src/domain/** and src/ports/**). Root cause: the boundary did not decode into a runtime-backed domain type. Graduate by moving decode/encode to src/infrastructure/adapters/** and by introducing domain types for what was previously passed as `unknown` or `Record<string, unknown>`.',
    detections: [
      { id: 'unknown-keyword', pattern: /\bunknown\b/, scope: 'core-only' },
      { id: 'record-string-unknown', pattern: /Record\s*<\s*string\s*,\s*unknown\s*>/, scope: 'core-only' },
      { id: 'json-parse', pattern: /\bJSON\.parse\s*\(/, scope: 'core-only' },
      { id: 'json-stringify', pattern: /\bJSON\.stringify\s*\(/, scope: 'core-only' },
      { id: 'fetch-call', pattern: /\bfetch\s*\(/, scope: 'core-only' },
      { id: 'process-env', pattern: /\bprocess\.env\b/, scope: 'core-only' },
    ],
  },
  {
    manifestId: '0025C-fake-models',
    owningCycle: '0025C',
    ruleFamily: 'fake-models',
    rules: ['ts-no-like-types'],
    rationale:
      'Pre-existing *Like placeholder types in src/**. Each *Like name is shape-talk hiding either (a) a missing boundary decoder, (b) a duck-typed narrow slice of a real type, or (c) a real domain concept that was never named. Cycle 0023 retro documents the cautionary tale. Graduate by giving the concept a real name (class with validated constructor) or removing the alias in favor of the real type.',
    detections: [
      { id: 'like-suffix', pattern: /\b[A-Z][A-Za-z0-9]*Like\b/, scope: 'all-src' },
    ],
  },
  {
    manifestId: '0025D-import-law',
    owningCycle: '0025D',
    ruleFamily: 'import-law',
    rules: ['no-restricted-imports:core-infrastructure', 'no-restricted-imports:core-node-platform'],
    rationale:
      'Pre-existing domain/ports imports of forbidden paths: src/infrastructure/** (adapters — should be behind a port), Node platform APIs (node:*, fs, http, etc. — should be mediated by a port), or framework libraries. Graduate by routing the capability through a port instead of a direct import.',
    detections: [
      // from src/domain/ or src/ports/ importing from infrastructure
      { id: 'core-imports-infrastructure', pattern: /from\s+['"]\S*\/infrastructure\//, scope: 'core-only' },
      // Node platform modules by name or node: protocol
      { id: 'core-imports-node-platform', pattern: /from\s+['"](?:node:|fs|path|http|https|net|tls|stream|child_process|crypto|os|buffer)(?:\/|['"])/, scope: 'core-only' },
    ],
  },
] as const;

async function* walkTs(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkTs(full);
    } else if (entry.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) {
      yield full;
    }
  }
}

function inScope(relPath: string, scope: Scope): boolean {
  const norm = relPath.replace(/\\/g, '/');
  if (scope === 'all-src') {
    return norm.startsWith('src/');
  }
  if (scope === 'core-only') {
    return norm.startsWith('src/domain/') || norm.startsWith('src/ports/');
  }
  if (scope === 'domain-only') {
    return norm.startsWith('src/domain/');
  }
  return false;
}

function lineIsCommentOnly(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('/**') ||
    trimmed === '*/'
  );
}

async function scanFile(absPath: string, relPath: string): Promise<ReadonlySet<string>> {
  const hits = new Set<string>();
  const content = await readFile(absPath, 'utf8');
  const lines = content.split('\n');

  for (const family of FAMILIES) {
    for (const detection of family.detections) {
      if (!inScope(relPath, detection.scope)) {
        continue;
      }
      if (hits.has(family.manifestId)) {
        continue;
      }
      for (const line of lines) {
        if (lineIsCommentOnly(line)) {
          continue;
        }
        if (detection.pattern.test(line)) {
          hits.add(family.manifestId);
          break;
        }
      }
    }
  }

  return hits;
}

async function scanTree(): Promise<Map<string, string[]>> {
  const byManifest = new Map<string, string[]>();
  for (const family of FAMILIES) {
    byManifest.set(family.manifestId, []);
  }

  const srcRoot = join(REPO_ROOT, 'src');
  for await (const absPath of walkTs(srcRoot)) {
    const relPath = relative(REPO_ROOT, absPath).replace(/\\/g, '/');
    const hits = await scanFile(absPath, relPath);
    for (const manifestId of hits) {
      const list = byManifest.get(manifestId);
      if (list) {
        list.push(relPath);
      }
    }
  }

  for (const list of byManifest.values()) {
    list.sort();
  }

  return byManifest;
}

async function readExistingFiles(outPath: string): Promise<readonly string[] | null> {
  try {
    const raw = await readFile(outPath, 'utf8');
    const parsed = JSON.parse(raw) as { files?: unknown };
    if (!Array.isArray(parsed.files)) {
      return null;
    }
    const out: string[] = [];
    for (const entry of parsed.files) {
      if (typeof entry === 'string') {
        out.push(entry);
      }
    }
    return out;
  } catch {
    return null;
  }
}

function filesEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

async function writeManifest(family: FamilyDefinition, files: readonly string[], nowIso: string): Promise<void> {
  const outPath = join(QUARANTINE_DIR, `${family.manifestId}.json`);
  const existing = await readExistingFiles(outPath);

  // Only update generated_at when the file set actually changes. This
  // lets CI run `lint:contamination` on every push and assert
  // `git diff --exit-code` without timestamp churn producing false
  // positives.
  let generatedAt = nowIso;
  if (existing !== null && filesEqual(existing, files)) {
    try {
      const raw = await readFile(outPath, 'utf8');
      const parsed = JSON.parse(raw) as { generated_at?: unknown };
      if (typeof parsed.generated_at === 'string') {
        generatedAt = parsed.generated_at;
      }
    } catch {
      // fall through to nowIso
    }
  }

  const payload = {
    manifest_id: family.manifestId,
    owning_cycle: family.owningCycle,
    rule_family: family.ruleFamily,
    rules: [...family.rules],
    rationale: family.rationale,
    generated_at: generatedAt,
    generator: 'scripts/contamination-map.ts v1',
    files: [...files],
  };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  await writeFile(outPath, serialized, 'utf8');
}

async function main(): Promise<void> {
  await mkdir(QUARANTINE_DIR, { recursive: true });

  const generatedAt = new Date().toISOString();
  const hitsByManifest = await scanTree();

  let totalFiles = 0;
  for (const family of FAMILIES) {
    const files = hitsByManifest.get(family.manifestId) ?? [];
    await writeManifest(family, files, generatedAt);
    totalFiles += files.length;
    console.log(`${family.manifestId}: ${files.length} file(s)`);
  }

  console.log(`\nTotal quarantined file-entries: ${totalFiles}`);
  console.log(`Manifests written to: ${relative(REPO_ROOT, QUARANTINE_DIR)}/`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
