import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = new URL('../../../', import.meta.url);
const PRODUCTION_ROOTS = ['src', 'bin'] as const;
const PRODUCTION_ENTRYPOINTS = ['index.ts', 'storage.ts', 'advanced.ts', 'diagnostics.ts'] as const;
const DOMAIN_STORAGE_ROOTS = ['src/domain', 'src/ports'] as const;
const FORBIDDEN_DOMAIN_MODULES = new Set([
  '@git-stunts/git-cas',
  '@git-stunts/plumbing',
]);
const FORBIDDEN_DOMAIN_STORAGE_IDENTIFIERS = new Set([
  'BlobPort',
  'BlobStoragePort',
  'TreePort',
  'createTree',
  'hashObject',
  'readBlob',
  'readManifest',
  'readTree',
  'restoreStream',
  'writeBlob',
  'writeTree',
]);
const RAW_GIT_OBJECT_WRITE_COMMANDS = new Set([
  'hash-object',
  'mktree',
  'unpack-objects',
  'write-tree',
]);
const REMOVED_PRODUCTION_SYMBOLS = new Set([
  'CachedValue',
  'CasFirstMemoizationEngine',
  'CasIndexStorageAdapter',
  'CasSeekCacheAdapter',
  'HealthCheckService',
  'GitTrieStoreAdapter',
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

function forbiddenDomainStorageReferences(
  path: string,
  sourceText = readFileSync(path, 'utf8'),
): string[] {
  const source = ts.createSourceFile(
    path,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const relativePath = relative(REPO_ROOT.pathname, path);
  const violations = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && FORBIDDEN_DOMAIN_STORAGE_IDENTIFIERS.has(node.text)) {
      violations.add(`${relativePath} exposes raw storage capability ${node.text}`);
    }
    const moduleName = importedModuleName(node);
    if (moduleName !== null && FORBIDDEN_DOMAIN_MODULES.has(moduleName)) {
      violations.add(`${relativePath} imports forbidden storage module ${moduleName}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...violations];
}

function forbiddenRawGitObjectWrites(
  path: string,
  sourceText = readFileSync(path, 'utf8'),
): string[] {
  const source = ts.createSourceFile(
    path,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const relativePath = relative(REPO_ROOT.pathname, path);
  const violations = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      RAW_GIT_OBJECT_WRITE_COMMANDS.has(node.text)
    ) {
      violations.add(`${relativePath} invokes raw Git object writer ${node.text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...violations];
}

function importedModuleName(node: ts.Node): string | null {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
    && node.moduleSpecifier !== undefined
    && ts.isStringLiteral(node.moduleSpecifier)) {
    return node.moduleSpecifier.text;
  }
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
    && ts.isStringLiteral(node.argument.literal)) {
    return node.argument.literal.text;
  }
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    const argument = node.arguments[0];
    return argument !== undefined && ts.isStringLiteral(argument) ? argument.text : null;
  }
  return null;
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

  it('rejects raw storage imports and capabilities in a mutation fixture', () => {
    const fixturePath = new URL('domain-storage-boundary-fixture.ts', REPO_ROOT).pathname;
    const violations = forbiddenDomainStorageReferences(fixturePath, `
      import type { AssetHandle } from '@git-stunts/git-cas';
      type Plumbing = import('@git-stunts/plumbing').default;
      interface LeakyPort {
        writeBlob(bytes: Uint8Array): Promise<string>;
        readTree(oid: string): Promise<object>;
      }
    `).sort();

    expect(violations).toEqual([
      'domain-storage-boundary-fixture.ts exposes raw storage capability readTree',
      'domain-storage-boundary-fixture.ts exposes raw storage capability writeBlob',
      'domain-storage-boundary-fixture.ts imports forbidden storage module @git-stunts/git-cas',
      'domain-storage-boundary-fixture.ts imports forbidden storage module @git-stunts/plumbing',
    ]);
  });

  it('keeps domain and port modules storage-substrate neutral', () => {
    const productionFiles = DOMAIN_STORAGE_ROOTS.flatMap(productionTypeScriptFiles);
    const violations = productionFiles
      .flatMap((path) => forbiddenDomainStorageReferences(path))
      .sort();

    expect(violations).toEqual([]);
  });

  it('rejects raw Git object writers in an AST mutation fixture', () => {
    const fixturePath = new URL('raw-git-writer-fixture.ts', REPO_ROOT).pathname;
    const violations = forbiddenRawGitObjectWrites(fixturePath, `
      plumbing.execute({ args: ['hash-object', '-w', '--stdin'] });
      plumbing.execute({ args: [\`mktree\`] });
    `).sort();

    expect(violations).toEqual([
      'raw-git-writer-fixture.ts invokes raw Git object writer hash-object',
      'raw-git-writer-fixture.ts invokes raw Git object writer mktree',
    ]);
  });

  it('keeps raw Git object writers out of production', () => {
    const productionFiles = [
      ...PRODUCTION_ROOTS.flatMap(productionTypeScriptFiles),
      ...PRODUCTION_ENTRYPOINTS.map((path) => new URL(path, REPO_ROOT).pathname),
    ];
    const violations = productionFiles
      .flatMap((path) => forbiddenRawGitObjectWrites(path))
      .sort();

    expect(violations).toEqual([]);
  });
});
