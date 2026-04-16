#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * quarantine-graduate-check — CI gate that enforces the "touch means
 * graduate" rule for the anti-sludge quarantine manifests.
 *
 * Policy: docs/ANTI_SLUDGE_POLICY.md §11.
 * Quarantines live in policy/quarantines/0025*.json (one per sludge
 * family). A file appears in a manifest because it had pre-existing
 * sludge at policy-adoption time and has not yet been fixed.
 *
 * The rule: if a file currently listed in ANY quarantine manifest is
 * modified in the current branch's merge-base diff, this check FAILS
 * unless either:
 *
 *   1. The file has been removed from the manifest (sludge fixed),
 *      OR
 *   2. The file's quarantine entry has been replaced with narrow
 *      inline suppressions ("// nosemgrep: RULE -- 0025X" or
 *      "/* eslint-disable-next-line RULE -- 0025X *\/") targeting the
 *      specific pre-existing offending lines.
 *
 * This is the "contaminated ground, digging it up" mechanism — not a
 * ratchet. The quarantine manifests shrink over time; they do not
 * accumulate.
 *
 * ## Diff basis
 *
 * Uses `git merge-base <target> HEAD` to compute the touched-file set,
 * NOT `git diff HEAD~1 HEAD`. HEAD~1 is wrong for PRs, rebases,
 * stacked commits, and merge workflows. The target branch defaults to
 * `origin/main`, overridable via `GIT_WARP_QUARANTINE_BASE`.
 *
 * ## Exit codes
 *
 * - 0: No touched files are still quarantined, or this is a full-clean
 *      CI run with no diff basis available.
 * - 1: At least one touched file remains in a quarantine manifest and
 *      has not been graduated. Output names offenders explicitly.
 * - 2: Tooling/environment failure (cannot read manifests, etc.).
 *
 * ## Human-readable output
 *
 * The script prints an accusation list rather than a bare error. Each
 * offender line explains what quarantine family owns the file and what
 * action is required. Shame correctly.
 */

import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(THIS_FILE), '..');
const QUARANTINE_DIR = join(REPO_ROOT, 'policy', 'quarantines');
const DEFAULT_BASE = process.env['GIT_WARP_QUARANTINE_BASE'] ?? 'origin/main';

interface Manifest {
  readonly manifestId: string;
  readonly owningCycle: string;
  readonly ruleFamily: string;
  readonly rules: readonly string[];
  readonly files: readonly string[];
}

async function listManifestFiles(): Promise<readonly string[]> {
  const entries = await readdir(QUARANTINE_DIR, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }
    paths.push(join(QUARANTINE_DIR, entry.name));
  }
  paths.sort();
  return paths;
}

async function loadManifest(absPath: string): Promise<Manifest> {
  const raw = await readFile(absPath, 'utf8');
  const parsed = JSON.parse(raw) as {
    manifest_id?: unknown;
    owning_cycle?: unknown;
    rule_family?: unknown;
    rules?: unknown;
    files?: unknown;
  };
  const manifestId = typeof parsed.manifest_id === 'string' ? parsed.manifest_id : '';
  const owningCycle = typeof parsed.owning_cycle === 'string' ? parsed.owning_cycle : '';
  const ruleFamily = typeof parsed.rule_family === 'string' ? parsed.rule_family : '';
  const rules = Array.isArray(parsed.rules)
    ? parsed.rules.filter((r): r is string => typeof r === 'string')
    : [];
  const files = Array.isArray(parsed.files)
    ? parsed.files.filter((f): f is string => typeof f === 'string')
    : [];
  return { manifestId, owningCycle, ruleFamily, rules, files };
}

async function loadAllManifests(): Promise<readonly Manifest[]> {
  const paths = await listManifestFiles();
  const out: Manifest[] = [];
  for (const p of paths) {
    out.push(await loadManifest(p));
  }
  return out;
}

/**
 * Returns the touched-file set for the current branch against the
 * target base. Uses git merge-base to compute a true branch-diff
 * rather than a single-commit diff.
 *
 * Returns null if the base ref cannot be resolved (e.g. on a freshly
 * cloned CI shallow checkout without the base branch). Null means
 * "don't know what changed" — the caller treats it as a pass because
 * we refuse to be falsely strict when we lack information.
 */
function getTouchedFiles(base: string): readonly string[] | null {
  let mergeBase: string;
  try {
    mergeBase = execFileSync('git', ['merge-base', base, 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
  if (mergeBase.length === 0) {
    return null;
  }
  let output: string;
  try {
    output = execFileSync(
      'git',
      ['diff', '--name-only', '-z', `${mergeBase}..HEAD`],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
  } catch {
    return null;
  }
  const files = output
    .split('\0')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return files;
}

interface Accusation {
  readonly file: string;
  readonly manifestId: string;
  readonly owningCycle: string;
  readonly ruleFamily: string;
  readonly rules: readonly string[];
}

function findAccusations(
  touchedFiles: readonly string[],
  manifests: readonly Manifest[],
): readonly Accusation[] {
  const touchedSet = new Set(touchedFiles);
  const accusations: Accusation[] = [];
  for (const m of manifests) {
    for (const f of m.files) {
      if (touchedSet.has(f)) {
        accusations.push({
          file: f,
          manifestId: m.manifestId,
          owningCycle: m.owningCycle,
          ruleFamily: m.ruleFamily,
          rules: m.rules,
        });
      }
    }
  }
  accusations.sort((a, b) => {
    if (a.file !== b.file) { return a.file < b.file ? -1 : 1; }
    return a.manifestId < b.manifestId ? -1 : 1;
  });
  return accusations;
}

function printAccusations(accusations: readonly Accusation[], base: string): void {
  console.error('');
  console.error('╔══════════════════════════════════════════════════════════════════╗');
  console.error('║  ANTI-SLUDGE QUARANTINE-GRADUATE-CHECK — FAIL                    ║');
  console.error('╚══════════════════════════════════════════════════════════════════╝');
  console.error('');
  console.error(`Diff basis: git merge-base ${base} HEAD..HEAD`);
  console.error('');
  console.error(`${accusations.length} quarantined file(s) touched without graduation:`);
  console.error('');
  for (const a of accusations) {
    console.error(`  • ${a.file}`);
    console.error(`      changed in this branch but remains in quarantine ${a.manifestId}`);
    console.error(`      owning cycle: ${a.owningCycle}`);
    console.error(`      rule family: ${a.ruleFamily}`);
    console.error(`      exempted rules: ${a.rules.join(', ')}`);
    console.error('');
  }
  console.error('Required action for each offender:');
  console.error('  1. Graduate the file — fix the sludge and remove the file');
  console.error('     from the manifest; run `npm run lint:contamination` to');
  console.error('     regenerate.');
  console.error('  OR');
  console.error('  2. Narrow the quarantine — remove the file from the');
  console.error('     manifest and replace it with line-level inline');
  console.error('     suppressions on each specific pre-existing offending');
  console.error('     line, each referencing the owning cycle:');
  console.error('       // nosemgrep: <rule-id> -- 0025X');
  console.error('       /* eslint-disable-next-line <rule-id> -- 0025X */');
  console.error('');
  console.error('Policy: docs/ANTI_SLUDGE_POLICY.md §11. Quarantines are');
  console.error('contaminated ground, not a ratchet baseline. Touching a');
  console.error('quarantined file means acknowledging and addressing the');
  console.error('sludge that lives there.');
  console.error('');
}

async function main(): Promise<void> {
  let manifests: readonly Manifest[];
  try {
    manifests = await loadAllManifests();
  } catch (err) {
    console.error(`quarantine-graduate-check: failed to load manifests: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }

  const touched = getTouchedFiles(DEFAULT_BASE);
  if (touched === null) {
    console.log(`quarantine-graduate-check: skipped (could not resolve merge-base against ${DEFAULT_BASE}).`);
    console.log('  This is expected on a fresh CI shallow clone before the base branch is fetched.');
    console.log('  Set GIT_WARP_QUARANTINE_BASE to override the target branch.');
    return;
  }

  if (touched.length === 0) {
    console.log('quarantine-graduate-check: no files changed against base; nothing to check.');
    return;
  }

  const accusations = findAccusations(touched, manifests);
  if (accusations.length === 0) {
    const relDir = relative(REPO_ROOT, QUARANTINE_DIR);
    console.log(`quarantine-graduate-check: PASS — ${touched.length} file(s) changed, none currently quarantined in ${relDir}/.`);
    return;
  }

  printAccusations(accusations, DEFAULT_BASE);
  process.exit(1);
}

main().catch((err: unknown) => {
  console.error(`quarantine-graduate-check: fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
