import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const shimPath = sourcePath('../../../src/domain/warp/_internal.ts');
const controllerPaths = Object.freeze([
  sourcePath('../../../src/domain/services/controllers/QueryController.ts'),
  sourcePath('../../../src/domain/services/controllers/QueryReads.ts'),
  sourcePath('../../../src/domain/services/controllers/QueryContent.ts'),
  sourcePath('../../../src/domain/services/controllers/ProvenanceController.ts'),
  sourcePath('../../../src/domain/services/controllers/CheckpointController.ts'),
  sourcePath('../../../src/domain/services/controllers/PatchController.ts'),
  sourcePath('../../../src/domain/services/controllers/SyncController.ts'),
  sourcePath('../../../src/domain/services/controllers/MaterializeHelpers.ts'),
]);

function sourcePath(relativeUrl: string): string {
  return fileURLToPath(new URL(relativeUrl, import.meta.url));
}

function parseSource(path: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
}

function collectModuleSpecifiers(sourceFile: ts.SourceFile): readonly string[] {
  const specifiers: string[] = [];

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
    ) {
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

function collectShimImportViolations(): readonly string[] {
  const violations: string[] = [];
  for (const path of controllerPaths) {
    const sourceFile = parseSource(path);
    for (const specifier of collectModuleSpecifiers(sourceFile)) {
      if (specifier.includes('warp/_internal')) {
        violations.push(`${path} imports ${specifier}`);
      }
    }
  }
  return violations;
}

describe('internal runtime shim closeout', () => {
  it('deletes the _internal runtime shim file', () => {
    expect(existsSync(shimPath)).toBe(false);
  });

  it('keeps controller module imports off the deleted shim path', () => {
    expect(collectShimImportViolations()).toEqual([]);
  });
});
