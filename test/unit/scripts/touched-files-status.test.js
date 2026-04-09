import { describe, expect, it } from 'vitest';

import {
  buildTouchedFilesReport,
} from '../../../scripts/touched-files/buildTouchedFilesReport.js';
import { classifyJavaScriptChange } from '../../../scripts/touched-files/classifyJavaScriptChange.js';
import { getImportRegionEnd } from '../../../scripts/touched-files/getImportRegionEnd.js';
import { parseChangedFiles } from '../../../scripts/touched-files/parseChangedFiles.js';
import { parseUnifiedDiff } from '../../../scripts/touched-files/parseUnifiedDiff.js';
import { pairTypeScriptConversions } from '../../../scripts/touched-files/pairTypeScriptConversions.js';
import TouchedFilesReport from '../../../scripts/touched-files/TouchedFilesReport.js';

describe('touched-files-status', () => {
  it('parses name-status output including renames', () => {
    expect(parseChangedFiles([
      'M\tsrc/domain/services/PatchBuilder.js',
      'R100\tsrc/domain/services/OpNormalizer.js\tsrc/domain/services/OpNormalizer.ts',
      'A\tdocs/design/0013/some-note.md',
    ].join('\n'))).toEqual([
      { status: 'M', path: 'src/domain/services/PatchBuilder.js' },
      {
        status: 'R100',
        oldPath: 'src/domain/services/OpNormalizer.js',
        path: 'src/domain/services/OpNormalizer.ts',
      },
      { status: 'A', path: 'docs/design/0013/some-note.md' },
    ]);
  });

  it('extracts changed line positions and line counts from unified diff', () => {
    const patch = [
      'diff --git a/src/file.js b/src/file.js',
      '@@ -1,2 +1,2 @@',
      '-import Foo from \'./Foo.js\';',
      '+import Foo from \'./Foo.ts\';',
      '@@ -10,0 +11,2 @@',
      '+const answer = 42;',
      '+return answer;',
    ].join('\n');

    expect(parseUnifiedDiff(patch)).toEqual({
      added: 3,
      deleted: 1,
      oldChangedLines: [1],
      newChangedLines: [1, 11, 12],
    });
  });

  it('detects the import region including multiline imports and leading comments', () => {
    const content = [
      '#!/usr/bin/env node',
      '',
      '// comment',
      'import {',
      '  Foo,',
      '} from \'./Foo.js\';',
      'export { bar } from \'./bar.js\';',
      '',
      'const runtime = 1;',
    ].join('\n');

    expect(getImportRegionEnd(content)).toBe(8);
  });

  it('classifies import-only JavaScript changes when edits stay in the import region', () => {
    const patch = [
      'diff --git a/src/file.js b/src/file.js',
      '@@ -1 +1 @@',
      '-import Foo from \'./Foo.js\';',
      '+import Foo from \'./Foo.ts\';',
    ].join('\n');
    const content = [
      'import Foo from \'./Foo.ts\';',
      '',
      'const runtime = 1;',
    ].join('\n');

    expect(classifyJavaScriptChange('M', patch, content, content)).toEqual({
      kind: 'import-only',
      added: 1,
      deleted: 1,
    });
  });

  it('classifies body-modified JavaScript changes when edits escape the import region', () => {
    const patch = [
      'diff --git a/src/file.js b/src/file.js',
      '@@ -4 +4 @@',
      '-  return 1;',
      '+  return 2;',
    ].join('\n');
    const content = [
      'import Foo from \'./Foo.js\';',
      '',
      'export function value() {',
      '  return 2;',
      '}',
    ].join('\n');

    expect(classifyJavaScriptChange('M', patch, content, content)).toEqual({
      kind: 'body-modified',
      added: 1,
      deleted: 1,
    });
  });

  it('builds grouped report buckets and preserves line deltas for JavaScript files', async () => {
    const changedFiles = [
      {
        status: 'R100',
        oldPath: 'src/domain/services/LegacyAnchorDetector.js',
        path: 'src/domain/services/LegacyAnchorDetector.ts',
      },
      {
        status: 'M',
        path: 'src/domain/services/OpStrategies.ts',
      },
      {
        status: 'M',
        path: 'src/domain/services/PatchBuilder.js',
      },
      {
        status: 'M',
        path: 'src/domain/services/index/IncrementalIndexUpdater.js',
      },
      {
        status: 'A',
        path: 'docs/design/0013/example.md',
      },
    ];

    const patches = new Map([
      ['src/domain/services/PatchBuilder.js', [
        'diff --git a/src/domain/services/PatchBuilder.js b/src/domain/services/PatchBuilder.js',
        '@@ -5 +5 @@',
        '-  return 1;',
        '+  return 2;',
      ].join('\n')],
      ['src/domain/services/index/IncrementalIndexUpdater.js', [
        'diff --git a/src/domain/services/index/IncrementalIndexUpdater.js b/src/domain/services/index/IncrementalIndexUpdater.js',
        '@@ -1 +1 @@',
        '-import Foo from \'./Foo.js\';',
        '+import Foo from \'./Foo.ts\';',
      ].join('\n')],
    ]);
    const filesAtRef = new Map([
      ['abc123:src/domain/services/PatchBuilder.js', [
        'import Foo from \'./Foo.js\';',
        '',
        'export function value() {',
        '  return 1;',
        '}',
      ].join('\n')],
      ['HEAD:src/domain/services/PatchBuilder.js', [
        'import Foo from \'./Foo.js\';',
        '',
        'export function value() {',
        '  return 2;',
        '}',
      ].join('\n')],
      ['abc123:src/domain/services/index/IncrementalIndexUpdater.js', [
        'import Foo from \'./Foo.js\';',
        '',
        'const runtime = 1;',
      ].join('\n')],
      ['HEAD:src/domain/services/index/IncrementalIndexUpdater.js', [
        'import Foo from \'./Foo.ts\';',
        '',
        'const runtime = 1;',
      ].join('\n')],
    ]);

    const report = await buildTouchedFilesReport(
      changedFiles,
      {
        branch: 'cycle/0013-typescript-migration',
        baseRef: 'main',
        headRef: 'HEAD',
        mergeBase: 'abc123',
      },
      async path => patches.get(path) ?? '',
      async (ref, path) => filesAtRef.get(`${ref}:${path}`) ?? null,
    );

    expect(report.convertedToTs).toEqual([
      {
        status: 'R100',
        oldPath: 'src/domain/services/LegacyAnchorDetector.js',
        path: 'src/domain/services/LegacyAnchorDetector.ts',
      },
    ]);
    expect(report.alreadyTsModified).toEqual([
      {
        status: 'M',
        path: 'src/domain/services/OpStrategies.ts',
      },
    ]);
    expect(report.jsBodyModified).toEqual([
      {
        status: 'M',
        path: 'src/domain/services/PatchBuilder.js',
        added: 1,
        deleted: 1,
      },
    ]);
    expect(report.jsImportOnly).toEqual([
      {
        status: 'M',
        path: 'src/domain/services/index/IncrementalIndexUpdater.js',
        added: 1,
        deleted: 1,
      },
    ]);
    expect(report.otherChangedFiles).toEqual([
      {
        status: 'A',
        path: 'docs/design/0013/example.md',
      },
    ]);
  });

  it('pairs deleted JavaScript files with same-path TypeScript additions', () => {
    expect(pairTypeScriptConversions([
      {
        status: 'D',
        path: 'src/domain/services/LegacyAnchorDetector.js',
      },
      {
        status: 'A',
        path: 'src/domain/services/LegacyAnchorDetector.ts',
      },
      {
        status: 'A',
        path: 'docs/design/0013/example.md',
      },
    ])).toEqual([
      {
        status: 'A',
        oldPath: 'src/domain/services/LegacyAnchorDetector.js',
        path: 'src/domain/services/LegacyAnchorDetector.ts',
      },
      {
        status: 'A',
        path: 'docs/design/0013/example.md',
      },
    ]);
  });

  it('formats the report into a bucketed human-readable summary', () => {
    const report = new TouchedFilesReport({
      branch: 'cycle/0013-typescript-migration',
      baseRef: 'main',
      headRef: 'HEAD',
      mergeBase: 'abc12345def67890',
    });
    report.addConvertedToTs({
      status: 'R100',
      oldPath: 'src/domain/services/LegacyAnchorDetector.js',
      path: 'src/domain/services/LegacyAnchorDetector.ts',
    });
    report.addJavaScriptChange(
      {
        status: 'M',
        path: 'src/domain/services/PatchBuilder.js',
      },
      { kind: 'body-modified', added: 2, deleted: 1 },
    );

    const text = report.freeze().formatText();

    expect(text).toContain('Touched on cycle/0013-typescript-migration (vs main, merge-base abc12345):');
    expect(text).toContain('Converted to .ts ✅ (1)');
    expect(text).toContain('src/domain/services/LegacyAnchorDetector.ts (from src/domain/services/LegacyAnchorDetector.js)');
    expect(text).toContain('Still .js, body modified ⚠ (1)');
    expect(text).toContain('src/domain/services/PatchBuilder.js (+2/-1)');
    expect(text).toContain('Other changed files ℹ (0)');
  });
});
