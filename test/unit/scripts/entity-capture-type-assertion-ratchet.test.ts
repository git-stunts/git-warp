import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ENTITY_CAPTURE_FILES = Object.freeze([
  'src/domain/api/EntityOccurrenceRuntime.ts',
  'src/domain/api/Intent.ts',
  'src/domain/api/IntentRuntime.ts',
  'src/domain/types/EntityCapturePayload.ts',
  'src/domain/types/PropValue.ts',
  'test/integration/application/Runtime.entityCapture.integration.test.ts',
  'test/unit/domain/Intent.entity.test.ts',
  'test/unit/domain/IntentRuntime.entity.test.ts',
  'test/unit/domain/ReceiptOutcome.test.ts',
  'test/unit/domain/WriteRuntime.test.ts',
  'test/unit/domain/types/EntityCapturePayload.test.ts',
  'test/unit/domain/crdt/Dot.test.ts',
  'test/unit/domain/crdt/VersionVector.test.ts',
  'test/unit/domain/services/PatchBuilder.entity.test.ts',
]);

describe('entity capture type-assertion ratchet', () => {
  it('covers the payload comparison implementations', () => {
    expect(ENTITY_CAPTURE_FILES).toEqual(
      expect.arrayContaining([
        'src/domain/types/EntityCapturePayload.ts',
        'src/domain/types/PropValue.ts',
      ])
    );
  });

  it('keeps entity implementation and test evidence free of type sludge', () => {
    const violations = ENTITY_CAPTURE_FILES.flatMap(typeSludgeIn);

    expect(violations).toEqual([]);
  });

  it('keeps occurrence authority on the occurrence object', () => {
    const runtime = readFileSync(
      join(process.cwd(), 'src/domain/api/EntityOccurrenceRuntime.ts'),
      'utf8'
    );
    const occurrence = readFileSync(
      join(process.cwd(), 'src/domain/api/EntityOccurrence.ts'),
      'utf8'
    );

    expect(runtime).not.toMatch(/\bWeakMap\b/);
    expect(occurrence).not.toContain('readonly #compare');
    expect(occurrence).not.toContain('readonly #relationTo');
  });
});

function typeSludgeIn(relativePath: string): string[] {
  const source = readFileSync(join(process.cwd(), relativePath), 'utf8');
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const violations: string[] = [];
  visit(sourceFile);
  return violations;

  function visit(node: ts.Node): void {
    if (isTypeSludge(node)) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      violations.push(`${relativePath}:${line + 1}:${character + 1}`);
    }
    ts.forEachChild(node, visit);
  }
}

function isTypeSludge(node: ts.Node): boolean {
  return (
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    node.kind === ts.SyntaxKind.AnyKeyword ||
    node.kind === ts.SyntaxKind.UnknownKeyword
  );
}
