import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const DOMAIN_FILES = Object.freeze([
  'src/domain/api/EntityOccurrenceRuntime.ts',
  'src/domain/api/Intent.ts',
  'src/domain/api/IntentRuntime.ts',
]);

describe('entity capture type-assertion ratchet', () => {
  it('keeps new entity domain paths free of compile-time shape assertions', () => {
    const violations = DOMAIN_FILES.flatMap(typeAssertionsIn);

    expect(violations).toEqual([]);
  });
});

function typeAssertionsIn(relativePath: string): string[] {
  const source = readFileSync(join(process.cwd(), relativePath), 'utf8');
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const violations: string[] = [];
  visit(sourceFile);
  return violations;

  function visit(node: ts.Node): void {
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      violations.push(`${relativePath}:${line + 1}:${character + 1}`);
    }
    ts.forEachChild(node, visit);
  }
}
