#!/usr/bin/env node
import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import ts from 'typescript';
import {
  buildTouchedFilesReport,
  pairTypeScriptConversions,
  parseChangedFiles,
} from './touched-files-status.js';
const execFile = promisify(execFileCallback);

/**
 * @param {string[]} args
 * @returns {{ baseRef: string, headRef: string, format: string }}
 */
export function parseArgs(args) {
  let baseRef = 'main';
  let headRef = 'HEAD';
  let format = 'markdown';
  for (const arg of args) {
    if (arg.startsWith('--base=')) {
      baseRef = arg.slice('--base='.length);
      continue;
    }
    if (arg.startsWith('--head=')) {
      headRef = arg.slice('--head='.length);
      continue;
    }
    if (arg.startsWith('--format=')) {
      format = arg.slice('--format='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!['markdown', 'json', 'bijou'].includes(format)) {
    throw new Error(`Unsupported format: ${format}`);
  }
  return { baseRef, headRef, format };
}

/**
 * @param {string} path
 * @returns {boolean}
 */
function isCodePath(path) {
  return path.endsWith('.js') || path.endsWith('.ts');
}

/**
 * @param {string} path
 * @returns {{ kind: string, limit: number }}
 */
export function classifyPath(path) {
  if (path.startsWith('test/')) {
    return { kind: 'test', limit: 800 };
  }
  if (path.startsWith('bin/') || path.startsWith('scripts/')) {
    return { kind: 'bin', limit: 300 };
  }
  return { kind: 'source', limit: 500 };
}

/**
 * @param {string} content
 * @param {string} [path]
 * @returns {{ loc: number, freeze: string, unknownCount: number, asCount: number, anyCount: number, typedefCount: number, enumCount: number, exportCount: number }}
 */
export function collectMetrics(content, path = 'scorecard.ts') {
  const sourceFile = ts.createSourceFile('scorecard.ts', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let unknownCount = 0;
  let asCount = 0;
  let anyCount = 0;
  let enumCount = 0;
  /**
   * @param {import('typescript').Node} node
   * @returns {void}
   */
  const visit = node => {
    if (node.kind === ts.SyntaxKind.UnknownKeyword) {
      unknownCount += 1;
    }
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      anyCount += 1;
    }
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      asCount += 1;
    }
    if (ts.isEnumDeclaration(node)) {
      enumCount += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  const typedefCount = (content.match(/@typedef\b/g) ?? []).length;
  const freeze = path.endsWith('.d.ts')
    ? 'n/a'
    : /\bclass\b/.test(content) && /\bconstructor\s*\(/.test(content)
    ? (content.includes('Object.freeze(this)') ? 'yes' : 'review')
    : 'n/a';

  return {
    loc: content.split('\n').length,
    freeze,
    unknownCount,
    asCount,
    anyCount,
    typedefCount,
    enumCount,
    exportCount: countExports(sourceFile),
  };
}

/**
 * @param {import('typescript').SourceFile} sourceFile
 * @returns {number}
 */
function countExports(sourceFile) {
  let exportCount = 0;
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement) || ts.isExportDeclaration(statement)) {
      continue;
    }
    if (!hasExportModifier(statement)) {
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      exportCount += statement.declarationList.declarations.length;
      continue;
    }
    exportCount += 1;
  }
  return exportCount;
}

/**
 * @param {import('typescript').Node} node
 * @returns {boolean}
 */
function hasExportModifier(node) {
  if (!ts.canHaveModifiers(node)) {
    return false;
  }
  return ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

/**
 * @param {string} touch
 * @param {{ loc: number, freeze: string, unknownCount: number, asCount: number, anyCount: number, typedefCount: number, enumCount: number, exportCount: number }} metrics
 * @param {number} limit
 * @returns {string}
 */
export function scoreStatus(touch, metrics, limit) {
  if (touch === 'js-body') {
    return 'red';
  }
  if (
    metrics.loc > limit ||
    metrics.unknownCount > 0 ||
    metrics.asCount > 0 ||
    metrics.anyCount > 0 ||
    metrics.typedefCount > 0 ||
    metrics.enumCount > 0 ||
    metrics.exportCount > 1
  ) {
    return 'red';
  }
  if (touch === 'js-import' || metrics.freeze === 'review') {
    return 'yellow';
  }
  return 'green';
}

/**
 * @param {{ branch: string, baseRef: string, mergeBase: string, convertedToTs: Array<{ path: string }>, alreadyTsModified: Array<{ path: string }>, jsBodyModified: Array<{ path: string }>, jsImportOnly: Array<{ path: string }> }} touchedReport
 * @returns {Promise<Array<{ path: string, kind: string, touch: string, loc: number, limit: number, unknownCount: number, asCount: number, anyCount: number, typedefCount: number, enumCount: number, exportCount: number, freeze: string, status: string }>>}
 */
export async function buildScorecardRows(touchedReport) {
  const touched = [
    ...touchedReport.convertedToTs.map(entry => ({ path: entry.path, touch: 'converted' })),
    ...touchedReport.alreadyTsModified.map(entry => ({ path: entry.path, touch: 'ts' })),
    ...touchedReport.jsBodyModified.map(entry => ({ path: entry.path, touch: 'js-body' })),
    ...touchedReport.jsImportOnly.map(entry => ({ path: entry.path, touch: 'js-import' })),
  ].filter(entry => isCodePath(entry.path));
  const rows = [];
  for (const entry of touched) {
    const content = await readFile(entry.path, 'utf8');
    const { kind, limit } = classifyPath(entry.path);
    const metrics = collectMetrics(content, entry.path);
    rows.push({
      path: entry.path,
      kind,
      touch: entry.touch,
      loc: metrics.loc,
      limit,
      unknownCount: metrics.unknownCount,
      asCount: metrics.asCount,
      anyCount: metrics.anyCount,
      typedefCount: metrics.typedefCount,
      enumCount: metrics.enumCount,
      exportCount: metrics.exportCount,
      freeze: metrics.freeze,
      status: scoreStatus(entry.touch, metrics, limit),
    });
  }
  return rows.sort((left, right) => left.path.localeCompare(right.path));
}

/**
 * @param {{ branch: string, baseRef: string, mergeBase: string }} meta
 * @param {Awaited<ReturnType<typeof buildScorecardRows>>} rows
 * @returns {string}
 */
export function formatMarkdown(meta, rows) {
  const lines = [
    `# Agent Scorecard`,
    '',
    `Touched on ${meta.branch} (vs ${meta.baseRef}, merge-base ${meta.mergeBase.slice(0, 8)})`,
    '',
    '| File | Kind | Touch | LOC | <=Limit | unknown | as | any | typedef | enum | exports | freeze | status |',
    '| --- | --- | --- | ---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: | :---: |',
  ];
  for (const row of rows) {
    lines.push(`| ${row.path} | ${row.kind} | ${row.touch} | ${row.loc} | ${row.loc <= row.limit ? 'yes' : 'no'} | ${row.unknownCount} | ${row.asCount} | ${row.anyCount} | ${row.typedefCount} | ${row.enumCount} | ${row.exportCount} | ${row.freeze} | ${row.status} |`);
  }
  lines.push('');
  lines.push('Manual review still required: runtime-backed forms (P1), boundary validation placement (P2), owning-type behavior (P3), human-readable error branching, and peer concepts that escape simple export counting.');
  return lines.join('\n');
}

/**
 * @param {{ branch: string, baseRef: string, mergeBase: string }} meta
 * @param {Awaited<ReturnType<typeof buildScorecardRows>>} rows
 * @returns {string}
 */
export function formatBijou(meta, rows) {
  const header = `Agent scorecard on ${meta.branch} vs ${meta.baseRef} @ ${meta.mergeBase.slice(0, 8)}`;
  const body = rows.map(row => `${row.status.toUpperCase()} ${row.path} loc=${row.loc}/${row.limit} touch=${row.touch} unknown=${row.unknownCount} as=${row.asCount} any=${row.anyCount} typedef=${row.typedefCount} enum=${row.enumCount} exports=${row.exportCount} freeze=${row.freeze}`).join('\n');
  return `${header}\n${body}\nMANUAL runtime-backed/boundary/owning-type review still required.`;
}

/**
 * @param {string[]} args
 * @returns {Promise<void>}
 */
async function main(args) {
  const options = parseArgs(args);
  const branch = (await runGit(['rev-parse', '--abbrev-ref', options.headRef])).trim();
  const mergeBase = (await runGit(['merge-base', options.headRef, options.baseRef])).trim();
  const range = `${mergeBase}..${options.headRef}`;
  const changedFiles = pairTypeScriptConversions(parseChangedFiles(await runGit(['diff', '--name-status', '--find-renames', range])));
  const touchedReport = await buildTouchedFilesReport(changedFiles, {
    branch,
    baseRef: options.baseRef,
    headRef: options.headRef,
    mergeBase,
    readPatch: async (path, oldPath) => await runGit(['diff', '--unified=0', '--no-color', '--find-renames', range, '--', ...(oldPath === undefined ? [path] : [oldPath, path])]),
    readFileAtRef: async (ref, path) => await readFileAtRef(ref, path),
  });
  const rows = await buildScorecardRows(touchedReport);
  if (options.format === 'json') {
    console.log(JSON.stringify({ meta: { branch, baseRef: options.baseRef, mergeBase }, rows }, null, 2));
    return;
  }
  console.log(options.format === 'bijou' ? formatBijou({ branch, baseRef: options.baseRef, mergeBase }, rows) : formatMarkdown({ branch, baseRef: options.baseRef, mergeBase }, rows));
}

/**
 * @param {string[]} args
 * @returns {Promise<string>}
 */
async function runGit(args) {
  const { stdout } = await execFile('git', args, { encoding: 'utf8' });
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

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch(error => {
    console.error(`agent-scorecard: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
