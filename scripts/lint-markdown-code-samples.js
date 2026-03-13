#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const repoTsconfigPath = resolve(root, 'tsconfig.base.json');

const IGNORED_DIRS = new Set(['.git', 'node_modules', 'coverage']);
const CODE_SAMPLE_LANGUAGES = new Set(['js', 'javascript', 'ts', 'typescript']);
const ANY_FENCE_PATTERN = /^ {0,3}([`~]{3,})(.*)$/;
const OPENING_FENCE_PATTERN = /^ {0,3}((?:`{3,}|~{3,}))(.*)$/;

/**
 * @typedef {{
 *   filePath: string,
 *   language: 'js'|'javascript'|'ts'|'typescript',
 *   code: string,
 *   fenceLine: number,
 *   startLine: number,
 * }} MarkdownCodeSample
 */

/**
 * @typedef {{
 *   filePath: string,
 *   line: number,
 *   column: number,
 *   message: string,
 *   language: string,
 * }} MarkdownCodeSampleIssue
 */

/**
 * @param {string} info
 * @returns {string | null}
 */
export function parseFenceLanguage(info) {
  const language = info.trim().split(/\s+/, 1)[0]?.toLowerCase() || '';
  return CODE_SAMPLE_LANGUAGES.has(language) ? language : null;
}

/**
 * @returns {ts.ScriptTarget}
 */
export function resolveRepoScriptTarget() {
  try {
    const configText = readFileSync(repoTsconfigPath, 'utf8');
    const parsed = ts.parseConfigFileTextToJson(repoTsconfigPath, configText);
    if (parsed.error) {
      return ts.ScriptTarget.Latest;
    }
    const converted = ts.convertCompilerOptionsFromJson(parsed.config?.compilerOptions || {}, root, repoTsconfigPath);
    return typeof converted.options.target === 'number'
      ? converted.options.target
      : ts.ScriptTarget.Latest;
  } catch {
    return ts.ScriptTarget.Latest;
  }
}

const repoScriptTarget = resolveRepoScriptTarget();

/**
 * @param {string} filePath
 * @param {number} line
 * @param {string} language
 * @param {string} message
 * @returns {MarkdownCodeSampleIssue}
 */
function createMarkdownCodeSampleIssue(filePath, line, language, message) {
  return {
    filePath,
    line,
    column: 1,
    language,
    message,
  };
}

/**
 * @param {string} markdown
 * @param {string} filePath
 * @returns {{ samples: MarkdownCodeSample[], issues: MarkdownCodeSampleIssue[] }}
 */
function extractMarkdownCodeSamplesWithIssues(markdown, filePath) {
  const lines = markdown.split('\n');
  /** @type {MarkdownCodeSample[]} */
  const samples = [];
  /** @type {MarkdownCodeSampleIssue[]} */
  const issues = [];
  /** @type {{ marker: string, markerLength: number, language: string|null, fenceLine: number, codeLines: string[] } | null} */
  let activeFence = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const anyFenceMatch = line.match(ANY_FENCE_PATTERN);
    const fenceMatch = line.match(OPENING_FENCE_PATTERN);
    if (!activeFence) {
      if (!anyFenceMatch) {
        continue;
      }
      if (!fenceMatch) {
        const language = parseFenceLanguage(anyFenceMatch[2]);
        if (language) {
          issues.push(
            createMarkdownCodeSampleIssue(
              filePath,
              index + 1,
              language,
              'Malformed Markdown fence marker; use only backticks or only tildes.'
            )
          );
        }
        continue;
      }
      activeFence = {
        marker: fenceMatch[1][0],
        markerLength: fenceMatch[1].length,
        language: parseFenceLanguage(fenceMatch[2]),
        fenceLine: index + 1,
        codeLines: [],
      };
      continue;
    }

    const closePattern = new RegExp(`^ {0,3}${activeFence.marker}{${activeFence.markerLength},}\\s*$`);
    if (closePattern.test(line)) {
      if (activeFence.language) {
        samples.push({
          filePath,
          language: /** @type {'js'|'javascript'|'ts'|'typescript'} */ (activeFence.language),
          code: activeFence.codeLines.join('\n'),
          fenceLine: activeFence.fenceLine,
          startLine: activeFence.fenceLine + 1,
        });
      }
      activeFence = null;
      continue;
    }

    activeFence.codeLines.push(line);
  }

  if (activeFence?.language) {
    issues.push(
      createMarkdownCodeSampleIssue(
        filePath,
        activeFence.fenceLine,
        activeFence.language,
        'Unterminated Markdown code fence.'
      )
    );
  }

  return { samples, issues };
}

/**
 * @param {string} markdown
 * @param {string} filePath
 * @returns {MarkdownCodeSample[]}
 */
export function extractMarkdownCodeSamples(markdown, filePath) {
  return extractMarkdownCodeSamplesWithIssues(markdown, filePath).samples;
}

/**
 * @param {string} startPath
 * @returns {string[]}
 */
export function collectMarkdownFiles(startPath = root) {
  const resolved = resolve(startPath);
  const stats = statSync(resolved);
  if (stats.isFile()) {
    return extname(resolved) === '.md' ? [resolved] : [];
  }

  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(resolved, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) {
        continue;
      }
      files.push(...collectMarkdownFiles(join(resolved, entry.name)));
      continue;
    }
    if (entry.isFile() && extname(entry.name) === '.md') {
      files.push(join(resolved, entry.name));
    }
  }
  return files.sort();
}

/**
 * @param {MarkdownCodeSample} sample
 * @returns {MarkdownCodeSampleIssue[]}
 */
export function lintMarkdownCodeSample(sample) {
  const scriptKind = sample.language === 'ts' || sample.language === 'typescript'
    ? ts.ScriptKind.TS
    : ts.ScriptKind.JS;
  const sourceFile = ts.createSourceFile(
    sample.language.startsWith('ts') ? 'sample.ts' : 'sample.js',
    sample.code,
    repoScriptTarget,
    true,
    scriptKind
  );
  // `parseDiagnostics` is an internal SourceFile property; we read it here so
  // the linter can report parse-only syntax errors without building a Program.
  const diagnostics = /** @type {ReadonlyArray<ts.DiagnosticWithLocation>} */ (
    /** @type {ts.SourceFile & { parseDiagnostics?: ReadonlyArray<ts.DiagnosticWithLocation> }} */ (sourceFile)
      .parseDiagnostics || []
  );

  return diagnostics.map((diagnostic) => {
    const start = diagnostic.start ?? 0;
    const location = ts.getLineAndCharacterOfPosition(sourceFile, start);
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    return {
      filePath: sample.filePath,
      line: sample.startLine + location.line,
      column: location.character + 1,
      message,
      language: sample.language,
    };
  });
}

/**
 * @param {string[]} markdownFiles
 * @returns {MarkdownCodeSampleIssue[]}
 */
export function lintMarkdownCodeSamples(markdownFiles) {
  /** @type {MarkdownCodeSampleIssue[]} */
  const issues = [];
  for (const filePath of markdownFiles) {
    const markdown = readFileSync(filePath, 'utf8');
    const { samples, issues: extractionIssues } = extractMarkdownCodeSamplesWithIssues(markdown, filePath);
    issues.push(...extractionIssues);
    for (const sample of samples) {
      issues.push(...lintMarkdownCodeSample(sample));
    }
  }
  return issues;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const targets = process.argv.slice(2);
  const markdownFiles = targets.length === 0
    ? collectMarkdownFiles(root)
    : targets.flatMap((target) => collectMarkdownFiles(resolve(process.cwd(), target)));
  const issues = lintMarkdownCodeSamples(markdownFiles);

  if (issues.length === 0) {
    process.stdout.write(
      `Markdown code sample lint passed: ${markdownFiles.length} Markdown files checked.\n`
    );
    process.exit(0);
  }

  for (const issue of issues) {
    process.stderr.write(
      `${issue.filePath}:${issue.line}:${issue.column} [${issue.language}] ${issue.message}\n`
    );
  }
  process.stderr.write(
    `Markdown code sample lint failed: ${issues.length} issue(s) across ${markdownFiles.length} Markdown files.\n`
  );
  process.exit(1);
}
