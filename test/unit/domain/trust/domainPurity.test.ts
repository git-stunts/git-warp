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
const REQUIRE_CALLEE = 'require';
const INFRASTRUCTURE_SEGMENT = 'infrastructure/';
const ADAPTERS_SEGMENT = 'adapters/';

type TrustSourceFile = {
  readonly name: string;
  readonly sourceFile: ts.SourceFile;
};

type ModuleSpecifierFixture = {
  readonly name: string;
  readonly text: string;
  readonly expected: readonly string[];
};

const MODULE_SPECIFIER_FIXTURES: readonly ModuleSpecifierFixture[] = Object.freeze([
  Object.freeze({
    name: 'static import',
    text: "import { Adapter } from '../../infrastructure/Adapter.js';",
    expected: Object.freeze(['../../infrastructure/Adapter.js']),
  }),
  Object.freeze({
    name: 're-export',
    text: "export { Adapter } from '../../infrastructure/Adapter.js';",
    expected: Object.freeze(['../../infrastructure/Adapter.js']),
  }),
  Object.freeze({
    name: 'star re-export',
    text: "export * from '../../adapters/index.js';",
    expected: Object.freeze(['../../adapters/index.js']),
  }),
  Object.freeze({
    name: 'dynamic import',
    text: "const adapter = import('../../infrastructure/Adapter.js');",
    expected: Object.freeze(['../../infrastructure/Adapter.js']),
  }),
  Object.freeze({
    name: 'require call',
    text: "const adapter = require('../../adapters/index.js');",
    expected: Object.freeze(['../../adapters/index.js']),
  }),
  Object.freeze({
    name: 'commented import text',
    text: "// import { Adapter } from '../../infrastructure/Adapter.js';",
    expected: Object.freeze([]),
  }),
]);

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
  const specifiers: string[] = [];
  function visit(node: ts.Node): void {
    const specifier = moduleSpecifierFromNode(node);
    if (specifier !== undefined) {
      specifiers.push(specifier);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return specifiers;
}

function moduleSpecifierFromNode(node: ts.Node): string | undefined {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    return stringLiteralText(node.moduleSpecifier);
  }
  if (ts.isCallExpression(node)) {
    return moduleSpecifierFromCall(node);
  }
  return undefined;
}

function moduleSpecifierFromCall(node: ts.CallExpression): string | undefined {
  if (!isBoundaryImportCall(node)) {
    return undefined;
  }
  return stringLiteralText(node.arguments[0]);
}

function isBoundaryImportCall(node: ts.CallExpression): boolean {
  return node.expression.kind === ts.SyntaxKind.ImportKeyword
    || (ts.isIdentifier(node.expression) && node.expression.text === REQUIRE_CALLEE);
}

function stringLiteralText(node: ts.Node | undefined): string | undefined {
  if (node === undefined || !ts.isStringLiteral(node)) {
    return undefined;
  }
  return node.text;
}

function sourceFileFromText(text: string): ts.SourceFile {
  return ts.createSourceFile('domain-purity-fixture.ts', text, ts.ScriptTarget.Latest, true);
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

  for (const fixture of MODULE_SPECIFIER_FIXTURES) {
    it(`collects module specifiers from ${fixture.name}`, () => {
      expect(moduleSpecifiers(sourceFileFromText(fixture.text))).toEqual(fixture.expected);
    });
  }

  it('has at least one source file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const { name, sourceFile } of files) {
    describe(name, () => {
      it('does not reference process.env', () => {
        expect(containsPropertyAccess(sourceFile, 'process', 'env')).toBe(false);
      });

      it('does not import from infrastructure/', () => {
        expect(moduleSpecifiers(sourceFile).some((moduleSpecifier) => moduleSpecifier.includes(INFRASTRUCTURE_SEGMENT)))
          .toBe(false);
      });

      it('does not import from adapters/', () => {
        expect(moduleSpecifiers(sourceFile).some((moduleSpecifier) => moduleSpecifier.includes(ADAPTERS_SEGMENT)))
          .toBe(false);
      });

      it('does not use console directly', () => {
        expect(containsObjectPropertyAccess(sourceFile, 'console')).toBe(false);
      });
    });
  }
});
