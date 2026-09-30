import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('does not assert unchecked shapes in malformed-key regressions', () => {
  const file = 'test/unit/domain/services/state/malformedPropKey.test.ts';
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const assertions: number[] = [];
  function visit(node: ts.Node): void {
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) assertions.push(node.pos);
    ts.forEachChild(node, visit);
  }
  visit(source);
  expect(assertions).toEqual([]);
});
