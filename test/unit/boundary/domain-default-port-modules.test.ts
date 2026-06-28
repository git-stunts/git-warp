import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = resolve('.');
const RETIRED_DOMAIN_DEFAULTS = Object.freeze([
  'src/domain/utils/defaultCodec.ts',
  'src/domain/utils/defaultCrypto.ts',
  'src/domain/utils/defaultTrustCrypto.ts',
]);
const SCANNED_ROOTS = Object.freeze([
  'src/domain',
  'src/ports',
]);

function sourceFilesUnder(directory: string): readonly string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFilesUnder(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(entryPath);
    }
  }
  return files;
}

function importSpecifiers(sourcePath: string): readonly string[] {
  const sourceText = readFileSync(sourcePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(node)) {
      const specifier = node.moduleSpecifier;
      if (specifier !== undefined && ts.isStringLiteral(specifier)) {
        specifiers.push(specifier.text);
      }
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [specifier] = node.arguments;
      if (specifier !== undefined && ts.isStringLiteral(specifier)) {
        specifiers.push(specifier.text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return specifiers;
}

describe('domain default port modules', () => {
  it('keeps retired domain default modules deleted', () => {
    const existing = RETIRED_DOMAIN_DEFAULTS.filter((relativePath) =>
      existsSync(resolve(ROOT, relativePath))
    );
    expect(existing).toEqual([]);
  });

  it('keeps domain and port imports away from retired default modules', () => {
    const violations = SCANNED_ROOTS.flatMap((root) =>
      sourceFilesUnder(resolve(ROOT, root)).flatMap((sourcePath) =>
        importSpecifiers(sourcePath)
          .filter((specifier) => RETIRED_DOMAIN_DEFAULTS.some((retired) =>
            specifier.endsWith(retired.split('/').at(-1) ?? retired)
          ))
          .map((specifier) => ({ sourcePath, specifier }))
      )
    );
    expect(violations).toEqual([]);
  });
});
