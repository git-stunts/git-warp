#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const DEFAULT_BASE_REF = 'main';
const DEFAULT_HEAD_REF = 'HEAD';

/**
 * @typedef {{ status: string, path: string, oldPath?: string }} ChangedFile
 */

/**
 * @typedef {{ added: number, deleted: number, oldChangedLines: number[], newChangedLines: number[] }} DiffStats
 */

/**
 * @typedef {{ path: string, status: string, oldPath?: string }} TouchedFileEntry
 */

/**
 * @typedef {{ path: string, status: string, oldPath?: string, added: number, deleted: number }} JavaScriptTouchedFileEntry
 */

/**
 * @typedef {{
 *   branch: string,
 *   baseRef: string,
 *   headRef: string,
 *   mergeBase: string,
 *   convertedToTs: TouchedFileEntry[],
 *   alreadyTsModified: TouchedFileEntry[],
 *   jsBodyModified: JavaScriptTouchedFileEntry[],
 *   jsImportOnly: JavaScriptTouchedFileEntry[],
 *   otherChangedFiles: TouchedFileEntry[],
 * }} TouchedFilesReport
 */

/**
 * @param {string[]} args
 * @returns {{ baseRef: string, headRef: string, json: boolean, help: boolean }}
 */
export function parseArgs(args) {
  let baseRef = DEFAULT_BASE_REF;
  let headRef = DEFAULT_HEAD_REF;
  let json = false;
  let help = false;

  for (const arg of args) {
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg.startsWith('--base=')) {
      baseRef = arg.slice('--base='.length);
      continue;
    }
    if (arg.startsWith('--head=')) {
      headRef = arg.slice('--head='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { baseRef, headRef, json, help };
}

/**
 * @param {string} output
 * @returns {ChangedFile[]}
 */
export function parseChangedFiles(output) {
  return output
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const parts = line.split('\t');
      const status = parts[0] ?? '';
      if (status.startsWith('R') || status.startsWith('C')) {
        const oldPath = parts[1];
        const path = parts[2];
        if (oldPath === undefined || path === undefined) {
          throw new Error(`Malformed rename/copy diff line: ${line}`);
        }
        return { status, path, oldPath };
      }
      const path = parts[1];
      if (path === undefined) {
        throw new Error(`Malformed diff line: ${line}`);
      }
      return { status, path };
    });
}

/**
 * @param {string} patch
 * @returns {DiffStats}
 */
export function parseUnifiedDiff(patch) {
  /** @type {number[]} */
  const oldChangedLines = [];
  /** @type {number[]} */
  const newChangedLines = [];
  let added = 0;
  let deleted = 0;
  let oldLine = 0;
  let newLine = 0;

  for (const line of patch.split('\n')) {
    const hunkMatch = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunkMatch !== null) {
      oldLine = Number.parseInt(hunkMatch[1] ?? '0', 10);
      newLine = Number.parseInt(hunkMatch[3] ?? '0', 10);
      continue;
    }
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff --git')) {
      continue;
    }
    if (line.startsWith('+')) {
      added += 1;
      newChangedLines.push(newLine);
      newLine += 1;
      continue;
    }
    if (line.startsWith('-')) {
      deleted += 1;
      oldChangedLines.push(oldLine);
      oldLine += 1;
      continue;
    }
    if (line.startsWith(' ')) {
      oldLine += 1;
      newLine += 1;
    }
  }

  return { added, deleted, oldChangedLines, newChangedLines };
}

/**
 * @param {string | null} content
 * @returns {number}
 */
export function getImportRegionEnd(content) {
  if (content === null) {
    return 0;
  }

  const lines = content.split('\n');
  let end = 0;
  let inImportStatement = false;
  let inBlockComment = false;

  for (const [index, rawLine] of lines.entries()) {
    const lineNumber = index + 1;
    const line = rawLine ?? '';
    const trimmed = line.trim();

    if (index === 0 && trimmed.startsWith('#!')) {
      end = lineNumber;
      continue;
    }

    if (inImportStatement) {
      end = lineNumber;
      if (trimmed.endsWith(';')) {
        inImportStatement = false;
      }
      continue;
    }

    if (inBlockComment) {
      end = lineNumber;
      if (trimmed.includes('*/')) {
        inBlockComment = false;
      }
      continue;
    }

    if (trimmed.length === 0 || trimmed.startsWith('//')) {
      end = lineNumber;
      continue;
    }

    if (trimmed.startsWith('/*')) {
      end = lineNumber;
      if (!trimmed.includes('*/')) {
        inBlockComment = true;
      }
      continue;
    }

    if (/^import\b/.test(trimmed) || /^export\s+(?:\*|\{)/.test(trimmed)) {
      end = lineNumber;
      if (!trimmed.endsWith(';')) {
        inImportStatement = true;
      }
      continue;
    }

    break;
  }

  return end;
}

/**
 * @param {{
 *   status: string,
 *   patch: string,
 *   baseContent: string | null,
 *   headContent: string | null,
 * }} input
 * @returns {{ kind: 'import-only' | 'body-modified', added: number, deleted: number }}
 */
export function classifyJavaScriptChange(input) {
  const { status, patch, baseContent, headContent } = input;
  if (status === 'A') {
    const addedOnlyStats = parseUnifiedDiff(patch);
    return { kind: 'body-modified', added: addedOnlyStats.added, deleted: addedOnlyStats.deleted };
  }

  const stats = parseUnifiedDiff(patch);
  const baseImportRegionEnd = getImportRegionEnd(baseContent);
  const headImportRegionEnd = getImportRegionEnd(headContent);
  const oldWithinImportRegion = stats.oldChangedLines.every(line => line <= baseImportRegionEnd);
  const newWithinImportRegion = stats.newChangedLines.every(line => line <= headImportRegionEnd);
  const kind = oldWithinImportRegion && newWithinImportRegion ? 'import-only' : 'body-modified';

  return { kind, added: stats.added, deleted: stats.deleted };
}

/**
 * @param {TouchedFilesReport} report
 * @returns {string}
 */
export function formatTouchedFilesReport(report) {
  const lines = [];
  lines.push(`Touched on ${report.branch} (vs ${report.baseRef}, merge-base ${report.mergeBase.slice(0, 8)}):`);
  lines.push('');
  appendBucket(lines, 'Converted to .ts', '✅', report.convertedToTs);
  appendBucket(lines, 'Already .ts, modified', '✅', report.alreadyTsModified);
  appendBucket(lines, 'Still .js, body modified', '⚠', report.jsBodyModified, true);
  appendBucket(lines, 'Still .js, import-only changes', '🟡', report.jsImportOnly, true);
  appendBucket(lines, 'Other changed files', 'ℹ', report.otherChangedFiles);

  if (lines.at(-1) === '') {
    lines.pop();
  }
  return lines.join('\n');
}

/**
 * Pairs deleted `.js` files with same-path `.ts` additions or modifications so
 * conversion work stays visible as a single migration step instead of separate
 * add/delete noise.
 *
 * @param {ChangedFile[]} changedFiles
 * @returns {ChangedFile[]}
 */
export function pairTypeScriptConversions(changedFiles) {
  const deletedJsByTargetTsPath = new Map(
    changedFiles
      .filter(file => file.status === 'D' && file.path.endsWith('.js'))
      .map(file => [`${file.path.slice(0, -3)}.ts`, file]),
  );
  const convertedTsPaths = new Map(
    changedFiles
      .filter(file => file.path.endsWith('.ts') && file.oldPath === undefined)
      .map(file => [file.path, deletedJsByTargetTsPath.get(file.path)?.path])
      .filter((entry) => entry[1] !== undefined),
  );

  return changedFiles.flatMap(file => {
    if (file.path.endsWith('.ts') && file.oldPath === undefined) {
      const oldPath = convertedTsPaths.get(file.path);
      if (oldPath !== undefined) {
        return [{ ...file, oldPath }];
      }
    }

    const convertedTargetPath = `${file.path.slice(0, -3)}.ts`;
    if (file.status === 'D' && file.path.endsWith('.js') && convertedTsPaths.has(convertedTargetPath)) {
      return [];
    }

    return [file];
  });
}

/**
 * @param {string[]} lines
 * @param {string} label
 * @param {string} emoji
 * @param {TouchedFileEntry[] | JavaScriptTouchedFileEntry[]} entries
 * @param {boolean} [showLineDelta]
 * @returns {void}
 */
function appendBucket(lines, label, emoji, entries, showLineDelta = false) {
  lines.push(`  ${label} ${emoji} (${entries.length})`);
  if (entries.length === 0) {
    lines.push('    (none)');
    lines.push('');
    return;
  }

  const sortedEntries = [...entries].sort((left, right) => left.path.localeCompare(right.path));
  for (const entry of sortedEntries) {
    const renameNote = entry.oldPath === undefined ? '' : ` (from ${entry.oldPath})`;
    const lineDelta = showLineDelta && 'added' in entry
      ? ` (+${entry.added}/-${entry.deleted})`
      : '';
    lines.push(`    ${entry.path}${renameNote}${lineDelta}`);
  }
  lines.push('');
}

/**
 * @param {ChangedFile[]} changedFiles
 * @param {{
 *   branch: string,
 *   baseRef: string,
 *   headRef: string,
 *   mergeBase: string,
 *   readPatch: (path: string, oldPath?: string) => Promise<string>,
 *   readFileAtRef: (ref: string, path: string) => Promise<string | null>,
 * }} dependencies
 * @returns {Promise<TouchedFilesReport>}
 */
export async function buildTouchedFilesReport(changedFiles, dependencies) {
  const report = {
    branch: dependencies.branch,
    baseRef: dependencies.baseRef,
    headRef: dependencies.headRef,
    mergeBase: dependencies.mergeBase,
    convertedToTs: [],
    alreadyTsModified: [],
    jsBodyModified: [],
    jsImportOnly: [],
    otherChangedFiles: [],
  };

  for (const changedFile of changedFiles) {
    if (changedFile.status === 'D') {
      report.otherChangedFiles.push(changedFile);
      continue;
    }

    if (
      changedFile.oldPath !== undefined &&
      changedFile.oldPath.endsWith('.js') &&
      changedFile.path.endsWith('.ts')
    ) {
      report.convertedToTs.push(changedFile);
      continue;
    }

    if (changedFile.path.endsWith('.ts')) {
      report.alreadyTsModified.push(changedFile);
      continue;
    }

    if (changedFile.path.endsWith('.js')) {
      const patch = await dependencies.readPatch(changedFile.path, changedFile.oldPath);
      const basePath = changedFile.oldPath ?? changedFile.path;
      const [baseContent, headContent] = await Promise.all([
        dependencies.readFileAtRef(dependencies.mergeBase, basePath),
        dependencies.readFileAtRef(dependencies.headRef, changedFile.path),
      ]);
      const classification = classifyJavaScriptChange({
        status: changedFile.status,
        patch,
        baseContent,
        headContent,
      });
      const entry = {
        ...changedFile,
        added: classification.added,
        deleted: classification.deleted,
      };
      if (classification.kind === 'import-only') {
        report.jsImportOnly.push(entry);
      } else {
        report.jsBodyModified.push(entry);
      }
      continue;
    }

    report.otherChangedFiles.push(changedFile);
  }

  return report;
}

/**
 * @param {string[]} args
 * @returns {Promise<string>}
 */
async function runGit(args) {
  const { stdout } = await execFile('git', args, {
    encoding: 'utf8',
  });
  return stdout;
}

/**
 * @param {string} ref
 * @param {string} path
 * @returns {Promise<string | null>}
 */
async function readFileAtRef(ref, path) {
  try {
    return await runGit(['show', `${ref}:${path}`]);
  } catch {
    return null;
  }
}

/**
 * @param {string} path
 * @param {string | undefined} oldPath
 * @param {string} range
 * @returns {Promise<string>}
 */
async function readPatch(path, oldPath, range) {
  const patchPaths = oldPath === undefined ? [path] : [oldPath, path];
  return await runGit(['diff', '--unified=0', '--no-color', '--find-renames', range, '--', ...patchPaths]);
}

/**
 * @returns {Promise<void>}
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node scripts/touched-files-status.js [--base=<ref>] [--head=<ref>] [--json]');
    process.exit(0);
  }

  const branch = (await runGit(['rev-parse', '--abbrev-ref', options.headRef])).trim();
  const mergeBase = (await runGit(['merge-base', options.headRef, options.baseRef])).trim();
  const range = `${mergeBase}..${options.headRef}`;
  const changedFiles = parseChangedFiles(await runGit(['diff', '--name-status', '--find-renames', range]));
  const report = await buildTouchedFilesReport(pairTypeScriptConversions(changedFiles), {
    branch,
    baseRef: options.baseRef,
    headRef: options.headRef,
    mergeBase,
    readPatch: async (path, oldPath) => await readPatch(path, oldPath, range),
    readFileAtRef,
  });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(formatTouchedFilesReport(report));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`touched-files-status: ${message}`);
    process.exit(1);
  });
}
