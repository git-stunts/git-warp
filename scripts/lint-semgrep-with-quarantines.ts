#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Semgrep wrapper that applies rule-scoped quarantines from
 * policy/quarantines/0025*.json.
 *
 * Workflow:
 *   1. Run semgrep with the anti-sludge rule config, emit JSON.
 *   2. Subtract results whose (rule_id, file) tuple is quarantined.
 *   3. Print the remaining violations in a readable form.
 *   4. Exit 0 if no unquarantined violations; 1 otherwise.
 *
 * The manifests declare `rules: [...]` — a list of rule IDs the
 * manifest exempts. Only results whose semgrep rule ID matches one
 * of those (and whose file is in the manifest's file list) are
 * filtered out. This is the rule-scoped quarantine mechanism in
 * practice: a file exempted for ts-no-double-cast does NOT get a
 * free pass on ts-no-like-types.
 *
 * Semgrep emits rule IDs as `semgrep/<rule-id>` in its JSON output.
 * We strip the prefix before matching against manifest `rules`.
 */

import { readdir, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(THIS_FILE), '..');
const QUARANTINE_DIR = join(REPO_ROOT, 'policy', 'quarantines');
const SEMGREP_CONFIG = join(REPO_ROOT, 'semgrep', 'typescript-anti-sludge.yml');

interface Manifest {
  readonly manifestId: string;
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
    rule_family?: unknown;
    rules?: unknown;
    files?: unknown;
  };
  const manifestId = typeof parsed.manifest_id === 'string' ? parsed.manifest_id : '';
  const ruleFamily = typeof parsed.rule_family === 'string' ? parsed.rule_family : '';
  const rules = Array.isArray(parsed.rules)
    ? parsed.rules.filter((r): r is string => typeof r === 'string')
    : [];
  const files = Array.isArray(parsed.files)
    ? parsed.files.filter((f): f is string => typeof f === 'string')
    : [];
  return { manifestId, ruleFamily, rules, files };
}

interface QuarantineIndex {
  /** rule-id → set of file paths exempted for that rule */
  readonly byRule: ReadonlyMap<string, ReadonlySet<string>>;
}

async function buildQuarantineIndex(): Promise<QuarantineIndex> {
  const byRule = new Map<string, Set<string>>();
  const manifestPaths = await listManifestFiles();
  for (const p of manifestPaths) {
    const m = await loadManifest(p);
    for (const ruleId of m.rules) {
      let set = byRule.get(ruleId);
      if (set === undefined) {
        set = new Set<string>();
        byRule.set(ruleId, set);
      }
      for (const f of m.files) {
        set.add(f);
      }
    }
  }
  return { byRule };
}

interface SemgrepResult {
  readonly check_id?: string;
  readonly path?: string;
  readonly start?: { readonly line?: number };
  readonly extra?: { readonly message?: string; readonly severity?: string };
}

interface SemgrepOutput {
  readonly results?: readonly SemgrepResult[];
  readonly errors?: readonly unknown[];
}

function runSemgrep(): { stdout: string; stderr: string; status: number } {
  const res = spawnSync(
    'semgrep',
    [
      'scan',
      '--config', SEMGREP_CONFIG,
      '--json',
      '--quiet',
      '--disable-version-check',
      '.',
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  if (res.error) {
    throw res.error;
  }
  return {
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    status: res.status ?? -1,
  };
}

/**
 * Semgrep rule IDs in JSON output are typically of the form
 * `semgrep.typescript-anti-sludge.ts-no-like-types` — a dot-separated
 * path ending in the rule id. Normalize by taking the last segment.
 */
function normalizeRuleId(checkId: string | undefined): string {
  if (checkId === undefined || checkId.length === 0) {
    return '';
  }
  const parts = checkId.split('.');
  return parts[parts.length - 1] ?? checkId;
}

function isQuarantined(index: QuarantineIndex, ruleId: string, filePath: string): boolean {
  const set = index.byRule.get(ruleId);
  if (set === undefined) {
    return false;
  }
  // Manifest entries are repo-relative; semgrep paths may be absolute
  // or repo-relative. Normalize both sides to repo-relative.
  const rel = filePath.startsWith(REPO_ROOT)
    ? relative(REPO_ROOT, filePath).replace(/\\/g, '/')
    : filePath.replace(/\\/g, '/');
  return set.has(rel);
}

interface FilteredReport {
  readonly reported: readonly {
    readonly ruleId: string;
    readonly path: string;
    readonly line: number;
    readonly message: string;
  }[];
  readonly quarantineHits: number;
  readonly inlineSuppressionHits: number;
}

const lineCache = new Map<string, readonly string[]>();

function repoRelativePath(filePath: string): string {
  return filePath.startsWith(REPO_ROOT)
    ? relative(REPO_ROOT, filePath).replace(/\\/g, '/')
    : filePath.replace(/\\/g, '/');
}

function sourceLine(filePath: string, line: number): string {
  const rel = repoRelativePath(filePath);
  let lines = lineCache.get(rel);
  if (lines === undefined) {
    lines = readFileSync(join(REPO_ROOT, rel), 'utf8').split('\n');
    lineCache.set(rel, lines);
  }
  return lines[line - 1] ?? '';
}

function hasInlineSuppression(ruleId: string, filePath: string, line: number): boolean {
  const text = sourceLine(filePath, line);
  if (!text.includes('nosemgrep')) {
    return false;
  }
  if (!text.includes('nosemgrep:')) {
    return true;
  }
  return text.includes(`nosemgrep: ${ruleId}`) || text.includes(`nosemgrep:${ruleId}`);
}

function filterResults(output: SemgrepOutput, index: QuarantineIndex): FilteredReport {
  const results = Array.isArray(output.results) ? output.results : [];
  const reported: { ruleId: string; path: string; line: number; message: string }[] = [];
  let quarantineHits = 0;
  let inlineSuppressionHits = 0;
  for (const r of results) {
    const ruleId = normalizeRuleId(r.check_id);
    const path = typeof r.path === 'string' ? r.path : '';
    const line = typeof r.start?.line === 'number' ? r.start.line : 0;
    const message = typeof r.extra?.message === 'string' ? r.extra.message : '';
    if (line > 0 && hasInlineSuppression(ruleId, path, line)) {
      inlineSuppressionHits++;
      continue;
    }
    if (isQuarantined(index, ruleId, path)) {
      quarantineHits++;
      continue;
    }
    reported.push({ ruleId, path, line, message });
  }
  reported.sort((a, b) => {
    if (a.path !== b.path) { return a.path < b.path ? -1 : 1; }
    if (a.line !== b.line) { return a.line - b.line; }
    return a.ruleId < b.ruleId ? -1 : 1;
  });
  return { reported, quarantineHits, inlineSuppressionHits };
}

function printReport(report: FilteredReport): void {
  if (report.reported.length === 0) {
    console.log(`semgrep anti-sludge: PASS (${report.quarantineHits} quarantined hit(s), ${report.inlineSuppressionHits} inline hit(s) suppressed).`);
    return;
  }
  console.error('');
  console.error('╔══════════════════════════════════════════════════════════════════╗');
  console.error('║  SEMGREP ANTI-SLUDGE — FAIL                                      ║');
  console.error('╚══════════════════════════════════════════════════════════════════╝');
  console.error('');
  for (const r of report.reported) {
    console.error(`  ${r.path}:${r.line}  [${r.ruleId}]`);
    for (const msgLine of r.message.split('\n')) {
      console.error(`      ${msgLine}`);
    }
    console.error('');
  }
  console.error(`${report.reported.length} unquarantined violation(s).`);
  if (report.quarantineHits > 0) {
    console.error(`(${report.quarantineHits} additional hit(s) suppressed by policy/quarantines/ — those are paydown-tracked by cycle 0025.)`);
  }
  if (report.inlineSuppressionHits > 0) {
    console.error(`(${report.inlineSuppressionHits} additional hit(s) suppressed inline with owning-cycle references.)`);
  }
  console.error('');
  console.error('Policy: docs/ANTI_SLUDGE_POLICY.md');
}

async function main(): Promise<void> {
  let index: QuarantineIndex;
  try {
    index = await buildQuarantineIndex();
  } catch (err) {
    console.error(`lint-semgrep-with-quarantines: failed to load manifests: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }

  let run;
  try {
    run = runSemgrep();
  } catch (err) {
    console.error(`lint-semgrep-with-quarantines: semgrep invocation failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error('Ensure semgrep is installed (python -m pip install semgrep).');
    process.exit(2);
  }

  // Semgrep exits non-zero when findings exist. We parse its JSON
  // regardless of exit status — the status just tells us "findings
  // present." The filter decides pass/fail in our wrapper.
  if (run.stdout.length === 0) {
    console.error('lint-semgrep-with-quarantines: semgrep produced no output.');
    console.error(run.stderr);
    process.exit(2);
  }

  let output: SemgrepOutput;
  try {
    output = JSON.parse(run.stdout) as SemgrepOutput;
  } catch (err) {
    console.error(`lint-semgrep-with-quarantines: failed to parse semgrep JSON: ${err instanceof Error ? err.message : String(err)}`);
    console.error('stdout head:', run.stdout.slice(0, 512));
    process.exit(2);
  }

  const report = filterResults(output, index);
  printReport(report);
  if (report.reported.length > 0) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(`lint-semgrep-with-quarantines: fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
