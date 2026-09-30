import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('uses typed subprocess outcomes instead of asserting an exception shape', () => {
  const file = 'test/unit/scripts/compute-npm-dist-tag.test.ts';
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const assertions: number[] = [];
  function visit(node: ts.Node): void {
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) assertions.push(node.pos);
    ts.forEachChild(node, visit);
  }
  visit(source);
  expect(assertions).toEqual([]);
});
