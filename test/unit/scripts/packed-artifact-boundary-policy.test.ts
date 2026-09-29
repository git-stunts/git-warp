import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const CLIENTS = [
  'scripts/package-payload/CheckPackedArtifact.ts',
  'test/unit/scripts/package-payload-contract-docs.test.ts',
];

describe('packed artifact boundary placement', () => {
  it.each(CLIENTS)('keeps raw values and JSON decoding out of %s', (path) => {
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest);
    const violations: string[] = [];
    function visit(node: ts.Node): void {
      if (node.kind === ts.SyntaxKind.UnknownKeyword) {
        violations.push('raw boundary type');
      }
      if (ts.isCallExpression(node) && node.expression.getText(source) === 'JSON.parse') {
        violations.push('JSON decoding');
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    expect(violations).toEqual([]);
  });
});
