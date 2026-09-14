import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const PERFORMANCE_WORKFLOW_TEST = 'test/unit/scripts/performance-workflow.test.ts';

describe('performance workflow type hygiene', () => {
  it('keeps the workflow proof free of type assertions', () => {
    const source = readFileSync(join(process.cwd(), PERFORMANCE_WORKFLOW_TEST), 'utf8');
    const sourceFile = ts.createSourceFile(
      PERFORMANCE_WORKFLOW_TEST,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );

    expect(typeAssertionLocations(sourceFile)).toEqual([]);
  });
});

function typeAssertionLocations(sourceFile: ts.SourceFile): readonly string[] {
  const locations: string[] = [];
  visit(sourceFile);
  return locations;

  function visit(node: ts.Node): void {
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      locations.push(`${PERFORMANCE_WORKFLOW_TEST}:${String(line + 1)}:${String(character + 1)}`);
    }
    ts.forEachChild(node, visit);
  }
}
