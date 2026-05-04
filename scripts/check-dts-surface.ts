#!/usr/bin/env node

/**
 * B41 — Publication Surface Validator
 *
 * v17 publishes compiled JavaScript + generated declarations to npm and
 * TypeScript source to JSR. The old declaration manifest/index.js/index.d.ts
 * check is still kept below as parser helpers for historical tests, but the
 * executable gate now verifies that package and JSR publication surfaces point
 * at existing files rather than stale generated artifacts.
 *
 * Exits non-zero on any broken publication target.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

type JsonObject = Record<string, unknown>;

interface SurfaceErrorReport {
  readonly errors: string[];
  readonly warnings: string[];
}

interface LabeledTarget {
  readonly label: string;
  readonly target: string;
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function readRequired(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      process.stderr.write(
        `ERROR: Cannot find ${filePath}\nEnsure you are running from the repository root.\n`
      );
      process.exit(1);
    }
    throw err;
  }
}

function readJsonObject(filePath: string): JsonObject {
  const parsed = JSON.parse(readRequired(filePath));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON object`);
  }
  return parsed as JsonObject;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function relativeTargetToPath(target: string): string {
  return target.startsWith('./') ? target.slice(2) : target;
}

function targetExists(target: string): boolean {
  return existsSync(resolve(root, relativeTargetToPath(target)));
}

function collectExportTargets(value: unknown, label: string): LabeledTarget[] {
  if (typeof value === 'string') {
    return [{ label, target: value }];
  }
  if (!isJsonObject(value)) {
    return [];
  }

  const targets: LabeledTarget[] = [];
  for (const [condition, nested] of Object.entries(value)) {
    targets.push(...collectExportTargets(nested, `${label}.${condition}`));
  }
  return targets;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function listFilesUnder(directory: string): string[] {
  const absoluteDirectory = resolve(root, directory);
  if (!existsSync(absoluteDirectory)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of readdirSync(absoluteDirectory)) {
    const absoluteEntry = resolve(absoluteDirectory, entry);
    const relativeEntry = `${directory}/${entry}`;
    if (statSync(absoluteEntry).isDirectory()) {
      files.push(...listFilesUnder(relativeEntry));
      continue;
    }
    files.push(relativeEntry);
  }
  return files;
}

function globHasMatch(pattern: string): boolean {
  const recursiveMarker = '/**/*';
  if (!pattern.includes(recursiveMarker)) {
    return targetExists(pattern);
  }

  const [directory = '', suffix = ''] = pattern.split(recursiveMarker);
  return listFilesUnder(relativeTargetToPath(directory)).some((file) => file.endsWith(suffix));
}

function checkTarget(target: LabeledTarget, report: SurfaceErrorReport): void {
  if (!target.target.startsWith('./')) {
    report.errors.push(`${target.label} target "${target.target}" must be package-relative`);
    return;
  }
  if (!targetExists(target.target)) {
    report.errors.push(`${target.label} target "${target.target}" does not exist`);
  }
}

function checkStringField(source: JsonObject, field: string, report: SurfaceErrorReport): void {
  const value = source[field];
  if (typeof value !== 'string') {
    report.errors.push(`package.json ${field} must be a string`);
    return;
  }
  checkTarget({ label: `package.json ${field}`, target: value }, report);
}

function checkPackageExports(packageJson: JsonObject, report: SurfaceErrorReport): void {
  const exportsField = packageJson['exports'];
  if (!isJsonObject(exportsField)) {
    report.errors.push('package.json exports must be an object');
    return;
  }

  for (const [subpath, value] of Object.entries(exportsField)) {
    for (const target of collectExportTargets(value, `package.json exports.${subpath}`)) {
      checkTarget(target, report);
    }
  }
}

function checkPackageBins(packageJson: JsonObject, report: SurfaceErrorReport): void {
  const bin = packageJson['bin'];
  if (!isJsonObject(bin)) {
    report.errors.push('package.json bin must be an object');
    return;
  }

  for (const [command, target] of Object.entries(bin)) {
    if (typeof target !== 'string') {
      report.errors.push(`package.json bin.${command} must be a string`);
      continue;
    }
    checkTarget({ label: `package.json bin.${command}`, target }, report);
  }
}

function checkIncludedTargets(label: string, entries: string[], report: SurfaceErrorReport): void {
  for (const entry of entries) {
    if (entry.includes('*')) {
      if (!globHasMatch(entry)) {
        report.errors.push(`${label} include "${entry}" does not match any files`);
      }
      continue;
    }
    if (!targetExists(entry)) {
      report.errors.push(`${label} include "${entry}" does not exist`);
    }
  }
}

function checkJsrExports(jsrJson: JsonObject, report: SurfaceErrorReport): void {
  const exportsField = jsrJson['exports'];
  if (!isJsonObject(exportsField)) {
    report.errors.push('jsr.json exports must be an object');
    return;
  }

  for (const [subpath, value] of Object.entries(exportsField)) {
    if (typeof value !== 'string') {
      report.errors.push(`jsr.json exports.${subpath} must be a string target`);
      continue;
    }
    checkTarget({ label: `jsr.json exports.${subpath}`, target: value }, report);
  }
}

function checkJsrPublish(jsrJson: JsonObject, report: SurfaceErrorReport): void {
  const publish = jsrJson['publish'];
  if (!isJsonObject(publish)) {
    report.errors.push('jsr.json publish must be an object');
    return;
  }
  checkIncludedTargets('jsr.json publish', readStringArray(publish['include']), report);
}

function runSourceSurfaceCheck(): SurfaceErrorReport {
  const report: SurfaceErrorReport = { errors: [], warnings: [] };
  const packageJson = readJsonObject(resolve(root, 'package.json'));
  const jsrJson = readJsonObject(resolve(root, 'jsr.json'));

  checkStringField(packageJson, 'main', report);
  checkStringField(packageJson, 'types', report);
  checkPackageExports(packageJson, report);
  checkPackageBins(packageJson, report);
  checkIncludedTargets('package.json files', readStringArray(packageJson['files']), report);
  checkJsrExports(jsrJson, report);
  checkJsrPublish(jsrJson, report);

  return report;
}

// ---------------------------------------------------------------------------
// Parsers (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Parse the body of an `export { ... }` block and return the exported names.
 * Handles single-line comments, `type` keyword prefix, and `as` aliases.
 * @param {string} blockBody - The content inside the braces (e.g., 'Foo, Bar as Baz')
 * @returns {Set<string>}
 */
export function parseExportBlock(blockBody: string): Set<string> {
  const names = new Set<string>();
  // Strip single-line comments before splitting on commas
  const cleaned = blockBody.replace(/\/\/[^\n]*/g, '');
  for (const item of cleaned.split(',')) {
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }
    // Handle `type Foo` — strip leading `type` keyword
    const withoutTypeKeyword = trimmed.replace(/^type\s+/, '');
    // Handle `Foo as Bar` — the exported name is Bar
    const asParts = withoutTypeKeyword.split(/\s+as\s+/);
    const exportedName = (asParts.length > 1 ? asParts[1] ?? '' : asParts[0] ?? '').trim();
    if (exportedName) {
      names.add(exportedName);
    }
  }
  return names;
}

/**
 * Find all `export { ... }` blocks in source and parse their contents.
 * @param {string} src - Full source text
 * @returns {Set<string>}
 */
function collectExportBlocks(src: string): Set<string> {
  const names = new Set<string>();
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const name of parseExportBlock(m[1] ?? '')) {
      names.add(name);
    }
  }
  return names;
}

/**
 * Extract names from `export { A, B, C };` blocks and `export default`.
 * @param {string} src
 * @returns {Set<string>}
 */
export function extractJsExports(src: string): Set<string> {
  const names = collectExportBlocks(src);
  // Match standalone `export const Foo` / `export function Foo` / `export class Foo`
  for (const m of src.matchAll(/export\s+(?:const|function|class)\s+(\w+)/g)) {
    names.add(m[1] ?? '');
  }
  // Match `export default class Foo` / `export default function Foo`
  for (const m of src.matchAll(/export\s+default\s+(?:class|function)\s+(\w+)/g)) {
    names.add(m[1] ?? '');
  }
  // Match `export default Foo` (standalone identifier)
  for (const m of src.matchAll(/export\s+default\s+([A-Z_$][\w$]*)/g)) {
    names.add(m[1] ?? '');
  }
  return names;
}

/**
 * @param {string} src
 * @returns {Set<string>}
 */
export function extractDtsExports(src: string): Set<string> {
  const names = new Set<string>();

  // export class Foo / export abstract class Foo
  for (const m of src.matchAll(/export\s+(?:declare\s+)?(?:abstract\s+)?class\s+(\w+)/g)) {
    names.add(m[1]!);
  }
  // export interface Foo / export declare interface Foo
  for (const m of src.matchAll(/export\s+(?:declare\s+)?interface\s+(\w+)/g)) {
    names.add(m[1]!);
  }
  // export type Foo = / export declare type Foo =
  for (const m of src.matchAll(/export\s+(?:declare\s+)?type\s+(\w+)\s*=/g)) {
    names.add(m[1]!);
  }
  // export const Foo / export function Foo
  for (const m of src.matchAll(/export\s+(?:declare\s+)?(?:const|function)\s+(\w+)/g)) {
    names.add(m[1]!);
  }
  // export namespace Foo / export declare namespace Foo
  for (const m of src.matchAll(/export\s+(?:declare\s+)?namespace\s+(\w+)/g)) {
    names.add(m[1]!);
  }
  // export default class Foo / export default function Foo
  for (const m of src.matchAll(/export\s+(?:declare\s+)?default\s+(?:class|function)\s+(\w+)/g)) {
    names.add(m[1]!);
  }
  // export default Foo  (standalone identifier — class declared separately)
  for (const m of src.matchAll(
    /export\s+(?:declare\s+)?default\s+(?!(?:class|function)\b)([A-Z_$][\w$]*)/g
  )) {
    names.add(m[1]!);
  }
  // export { A as B } — exported name is B
  for (const name of collectExportBlocks(src)) {
    names.add(name);
  }
  return names;
}

const TYPE_ONLY_KINDS = new Set(['interface', 'type']);

/**
 * Splits manifest exports into runtime-backed and type-only names using the
 * explicit `exports` and `typeExports` sections.
 *
 * `exports` should contain only runtime-backed declarations.
 * `typeExports` should contain only `interface` and `type` declarations.
 *
 * @param {{ exports?: Record<string, { kind?: string }>, typeExports?: Record<string, { kind?: string }> }} manifest
 * @returns {{ manifestNames: Set<string>, runtimeNames: Set<string>, typeOnlyNames: Set<string>, duplicateNames: Set<string>, invalidRuntimeTypeOnly: Set<string>, invalidTypeSectionRuntime: Set<string> }}
 */
export function classifyManifestExports(manifest: { exports?: Record<string, { kind?: string }>, typeExports?: Record<string, { kind?: string }> }) {
  const manifestNames = new Set<string>();
  const runtimeNames = new Set<string>();
  const typeOnlyNames = new Set<string>();
  const duplicateNames = new Set<string>();
  const invalidRuntimeTypeOnly = new Set<string>();
  const invalidTypeSectionRuntime = new Set<string>();

  for (const [name, meta] of Object.entries(manifest.exports || {})) {
    if (manifestNames.has(name)) {
      duplicateNames.add(name);
    }
    manifestNames.add(name);
    runtimeNames.add(name);
    if (TYPE_ONLY_KINDS.has(meta.kind || '')) {
      invalidRuntimeTypeOnly.add(name);
    }
  }

  for (const [name, meta] of Object.entries(manifest.typeExports || {})) {
    if (manifestNames.has(name)) {
      duplicateNames.add(name);
    }
    manifestNames.add(name);
    typeOnlyNames.add(name);
    if (!TYPE_ONLY_KINDS.has(meta.kind || '')) {
      invalidTypeSectionRuntime.add(name);
    }
  }

  return {
    manifestNames,
    runtimeNames,
    typeOnlyNames,
    duplicateNames,
    invalidRuntimeTypeOnly,
    invalidTypeSectionRuntime,
  };
}

// ---------------------------------------------------------------------------
// Main — runs only when executed directly
// ---------------------------------------------------------------------------
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const quiet = process.argv.includes('--quiet');
  const report = runSourceSurfaceCheck();
  if (!quiet) {
    process.stdout.write('\nPublication surface check:\n');
    process.stdout.write(`  Errors:   ${report.errors.length}\n`);
    process.stdout.write(`  Warnings: ${report.warnings.length}\n\n`);
  }

  for (const warning of report.warnings) {
    process.stderr.write(`WARN: ${warning}\n`);
  }
  for (const error of report.errors) {
    process.stderr.write(`ERROR: ${error}\n`);
  }

  if (report.errors.length > 0) {
    process.stderr.write(`FAIL: ${report.errors.length} surface error(s)\n`);
    process.exit(1);
  }

  if (!quiet) {
    process.stdout.write('PASS: package and JSR surface targets exist\n');
  }
}
