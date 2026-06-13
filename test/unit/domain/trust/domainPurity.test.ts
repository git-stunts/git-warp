/**
 * Domain purity test for src/domain/trust/.
 *
 * Ensures no infrastructure leakage into the trust domain layer:
 * - No process.env references
 * - No imports from infrastructure/ or adapters/
 * - No direct console usage
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const TRUST_DIR = path.resolve('src/domain/trust');

type TrustSourceFile = {
  readonly name: string;
  readonly sourceFile: ts.SourceFile;
};

function getTrustFiles() {
  return fs.readdirSync(TRUST_DIR)
    .filter((f) => f.endsWith('.js') || f.endsWith('.ts'))
    .map((f): TrustSourceFile => ({
      name: f,
      sourceFile: ts.createSourceFile(
        path.join(TRUST_DIR, f),
        fs.readFileSync(path.join(TRUST_DIR, f), 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      ),
    }));
}

function moduleSpecifiers(sourceFile: ts.SourceFile): readonly string[] {
  return sourceFile.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      return [];
    }
    return [statement.moduleSpecifier.text];
  });
}

function containsPropertyAccess(sourceFile: ts.SourceFile, objectName: string, propertyName: string): boolean {
  let found = false;
  function visit(node: ts.Node): void {
    if (found) {
      return;
    }
    if (
      ts.isPropertyAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === objectName
      && node.name.text === propertyName
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function containsObjectPropertyAccess(sourceFile: ts.SourceFile, objectName: string): boolean {
  let found = false;
  function visit(node: ts.Node): void {
    if (found) {
      return;
    }
    if (
      ts.isPropertyAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === objectName
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

describe('domain/trust/ purity', () => {
  const files = getTrustFiles();

  it('has at least one source file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const { name, sourceFile } of files) {
    describe(name, () => {
      it('does not reference process.env', () => {
        expect(containsPropertyAccess(sourceFile, 'process', 'env')).toBe(false);
      });

      it('does not import from infrastructure/', () => {
        expect(moduleSpecifiers(sourceFile).some((moduleSpecifier) => moduleSpecifier.includes('infrastructure/')))
          .toBe(false);
      });

      it('does not import from adapters/', () => {
        expect(moduleSpecifiers(sourceFile).some((moduleSpecifier) => moduleSpecifier.includes('adapters/')))
          .toBe(false);
      });

      it('does not use console directly', () => {
        expect(containsObjectPropertyAccess(sourceFile, 'console')).toBe(false);
      });
    });
  }
});
