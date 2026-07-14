import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = new URL('../../../', import.meta.url);
const PRODUCTION_ROOTS = ['src', 'bin'] as const;
const PRODUCTION_ENTRYPOINTS = ['index.ts', 'storage.ts', 'advanced.ts', 'diagnostics.ts'] as const;
const REMOVED_PRODUCTION_SYMBOLS = new Set([
  'CachedValue',
  'CasFirstMemoizationEngine',
  'CasIndexStorageAdapter',
  'CasSeekCacheAdapter',
  'HealthCheckService',
  'InMemoryBlobStorageAdapter',
  'InMemoryGraphAdapter',
  'IndexRebuildService',
  'IndexStalenessChecker',
  'MemoryRuntimeStorageAdapter',
  'MemoryStorage',
  'SeekCachePort',
  'StreamingBitmapIndexBuilder',
  'StreamingCheckpointBasisBuilder',
  'StreamingIndexStoragePort',
]);
const REMOVED_PRODUCTION_IDENTIFIERS = new Set([
  '_adjacencyCache',
  '_seekCache',
  'adjacencyCacheSize',
  'buildSeekCacheRef',
  'createSeekCache',
  'defaultBlobStorage',
  'seekCache',
  'setSeekCache',
  'wireSeekCache',
]);

function productionTypeScriptFiles(relativeRoot: string): string[] {
  const absoluteRoot = new URL(`${relativeRoot}/`, REPO_ROOT).pathname;
  return walk(absoluteRoot);
}

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(path));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(path);
    }
  }
  return files;
}

function forbiddenReferences(
  path: string,
  sourceText = readFileSync(path, 'utf8'),
): string[] {
  const source = ts.createSourceFile(
    path,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const violations = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isIdentifier(node) &&
      (REMOVED_PRODUCTION_IDENTIFIERS.has(node.text) || REMOVED_PRODUCTION_SYMBOLS.has(node.text))
    ) {
      violations.add(`${relative(REPO_ROOT.pathname, path)} uses ${node.text}`);
    }
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (moduleSpecifier === undefined || !ts.isStringLiteral(moduleSpecifier)) {
        ts.forEachChild(node, visit);
        return;
      }
      const removed = [...REMOVED_PRODUCTION_SYMBOLS].find((symbol) =>
        moduleSpecifier.text.includes(symbol)
      );
      if (removed !== undefined) {
        violations.add(`${relative(REPO_ROOT.pathname, path)} imports ${removed}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...violations];
}

describe('storage ownership boundary', () => {
  it('rejects removed symbols in arbitrary identifier positions', () => {
    const fixturePath = new URL('storage-ownership-fixture.ts', REPO_ROOT).pathname;
    const violations = forbiddenReferences(fixturePath, `
      const CasSeekCacheAdapter = 1;
      function SeekCachePort() { return CasSeekCacheAdapter; }
      const active = SeekCachePort;
      export { active as CachedValue };
    `).sort();

    expect(violations).toEqual([
      'storage-ownership-fixture.ts uses CachedValue',
      'storage-ownership-fixture.ts uses CasSeekCacheAdapter',
      'storage-ownership-fixture.ts uses SeekCachePort',
    ]);
  });

  it('keeps removed caches and in-memory storage implementations out of production', () => {
    const productionFiles = [
      ...PRODUCTION_ROOTS.flatMap(productionTypeScriptFiles),
      ...PRODUCTION_ENTRYPOINTS.map((path) => new URL(path, REPO_ROOT).pathname),
    ];
    const violations = productionFiles
      .flatMap((path) => forbiddenReferences(path))
      .sort();

    expect(violations).toEqual([]);
  });
});
