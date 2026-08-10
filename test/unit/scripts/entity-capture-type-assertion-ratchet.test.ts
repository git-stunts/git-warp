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
    expect(hasOccurrenceAuthorityEquality(occurrence)).toBe(false);
  });

  it.each([
    'issued.subject === occurrence.subject',
    'occurrence.subject===issued.subject',
    '(issued.subject) === ((occurrence.subject))',
  ])('detects syntax-independent occurrence authority: %s', (expression) => {
    expect(hasOccurrenceAuthorityEquality(`const forbidden = ${expression};`)).toBe(true);
  });

  it('keeps the opaque occurrence declaration detached from internal coordinates', () => {
    const occurrence = readFileSync(
      join(process.cwd(), 'src/domain/api/EntityOccurrence.ts'),
      'utf8'
    );

    expect(occurrence).not.toContain("from '../crdt/Dot.ts'");
    expect(occurrence).not.toContain("from '../utils/EventId.ts'");
  });

  it('keeps permissive PatchBuilder values method-generic', () => {
    const sourceFile = sourceFileFor('src/domain/services/PatchBuilder.ts');
    const builder = sourceFile.statements.find(
      (statement): statement is ts.ClassDeclaration =>
        ts.isClassDeclaration(statement) && statement.name?.text === 'PatchBuilder'
    );

    expect(builder).toBeDefined();
    expect(genericValueType(builder, 'emitEffect', 'payload')).toBe('T');
    expect(genericValueType(builder, 'setProperty', 'value')).toBe('T');
    expect(genericValueType(builder, 'setEdgeProperty', 'value')).toBe('T');
  });
});

function sourceFileFor(relativePath: string): ts.SourceFile {
  const source = readFileSync(join(process.cwd(), relativePath), 'utf8');
  return ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function genericValueType(
  declaration: ts.ClassDeclaration | undefined,
  methodName: string,
  parameterName: string
): string | undefined {
  const method = declaration?.members.find(
    (member): member is ts.MethodDeclaration =>
      ts.isMethodDeclaration(member) && member.name.getText() === methodName
  );
  const parameter = method?.parameters.find(
    (candidate) => candidate.name.getText() === parameterName
  );
  const typeParameter = method?.typeParameters?.[0]?.name.text;
  const parameterType = parameter?.type?.getText();
  return typeParameter === parameterType ? parameterType : undefined;
}

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

function hasOccurrenceAuthorityEquality(source: string): boolean {
  const sourceFile = ts.createSourceFile(
    'EntityOccurrence.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  let found = false;
  visit(sourceFile);
  return found;

  function visit(node: ts.Node): void {
    if (isOccurrenceAuthorityEquality(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
}

function isOccurrenceAuthorityEquality(node: ts.Node): boolean {
  if (!ts.isBinaryExpression(node) || !isEqualityOperator(node.operatorToken.kind)) {
    return false;
  }
  return (
    (isSubjectAccess(node.left, 'issued') && isSubjectAccess(node.right, 'occurrence')) ||
    (isSubjectAccess(node.left, 'occurrence') && isSubjectAccess(node.right, 'issued'))
  );
}

function isEqualityOperator(kind: ts.SyntaxKind): boolean {
  return kind === ts.SyntaxKind.EqualsEqualsEqualsToken || kind === ts.SyntaxKind.EqualsEqualsToken;
}

function isSubjectAccess(node: ts.Expression, owner: string): boolean {
  const expression = unwrapParentheses(node);
  if (!ts.isPropertyAccessExpression(expression) || expression.name.text !== 'subject') {
    return false;
  }
  const receiver = unwrapParentheses(expression.expression);
  return ts.isIdentifier(receiver) && receiver.text === owner;
}

function unwrapParentheses(node: ts.Expression): ts.Expression {
  let expression = node;
  while (ts.isParenthesizedExpression(expression)) {
    expression = expression.expression;
  }
  return expression;
}
