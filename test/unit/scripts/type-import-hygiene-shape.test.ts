import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

const HYGIENE_CONSISTENT_TYPE_IMPORTS = '@typescript-eslint/consistent-type-imports';
const HYGIENE_RESTRICT_TEMPLATE_EXPRESSIONS = '@typescript-eslint/restrict-template-expressions';
const fixturePaths: string[] = [];

afterEach(() => {
  while (fixturePaths.length > 0) {
    const fixturePath = fixturePaths.pop();
    if (fixturePath !== undefined) {
      rmSync(fixturePath, { force: true });
    }
  }
});

function presentRuleId(ruleId: string | null): ruleId is string {
  return ruleId !== null;
}

async function lintRuleIds(relativePath: string, source: string): Promise<string[]> {
  const fixturePath = `${repoRoot}${relativePath}`;
  writeFileSync(fixturePath, source, 'utf8');
  fixturePaths.push(fixturePath);

  const eslint = new ESLint({ cwd: repoRoot });
  const [result] = await eslint.lintFiles([relativePath]);
  if (!result) {
    return [];
  }
  return result.messages.map((message) => message.ruleId).filter(presentRuleId);
}

function manifestObject(manifestName: string): ts.ObjectLiteralExpression | null {
  const path = `${repoRoot}policy/quarantines/${manifestName}.json`;
  const sourceFile = ts.parseJsonText(path, readFileSync(path, 'utf8'));
  const statement = sourceFile.statements[0];
  const expression = statement?.expression;
  if (!expression || !ts.isObjectLiteralExpression(expression)) {
    return null;
  }
  return expression;
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }
  return null;
}

function propertyAssignment(
  objectExpression: ts.ObjectLiteralExpression,
  propertyName: string,
): ts.PropertyAssignment | null {
  for (const property of objectExpression.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    if (propertyNameText(property.name) === propertyName) {
      return property;
    }
  }
  return null;
}

function stringProperty(manifestName: string, propertyName: string): string | null {
  const objectExpression = manifestObject(manifestName);
  if (!objectExpression) {
    return null;
  }
  const property = propertyAssignment(objectExpression, propertyName);
  if (!property || !ts.isStringLiteral(property.initializer)) {
    return null;
  }
  return property.initializer.text;
}

function arrayPropertyLength(manifestName: string, propertyName: string): number | null {
  const objectExpression = manifestObject(manifestName);
  if (!objectExpression) {
    return null;
  }
  const property = propertyAssignment(objectExpression, propertyName);
  if (!property || !ts.isArrayLiteralExpression(property.initializer)) {
    return null;
  }
  return property.initializer.elements.length;
}

describe('type-import/template-expression hygiene posture', () => {
  it('rejects value imports that are only used as types through ESLint', async () => {
    const ruleIds = await lintRuleIds(
      'src/domain/type-import-hygiene-fixture.ts',
      [
        "import WarpError from './errors/WarpError.ts';",
        '',
        'type Box = { readonly error: WarpError | null };',
        'const box: Box = { error: null };',
        'void box;',
        '',
      ].join('\n'),
    );

    expect(ruleIds).toContain(HYGIENE_CONSISTENT_TYPE_IMPORTS);
  });

  it('rejects boolean template interpolation through ESLint', async () => {
    const ruleIds = await lintRuleIds(
      'src/domain/template-expression-hygiene-fixture.ts',
      [
        'const enabled = true;',
        'const message = `enabled: ${enabled}`;',
        'void message;',
        '',
      ].join('\n'),
    );

    expect(ruleIds).toContain(HYGIENE_RESTRICT_TEMPLATE_EXPRESSIONS);
  });

  it('keeps the hygiene quarantine manifests active and empty', () => {
    expect(stringProperty('HYGIENE-consistent-type-imports', 'rule_id')).toBe(
      HYGIENE_CONSISTENT_TYPE_IMPORTS,
    );
    expect(arrayPropertyLength('HYGIENE-consistent-type-imports', 'files')).toBe(0);

    expect(stringProperty('HYGIENE-restrict-template-expressions', 'rule_id')).toBe(
      HYGIENE_RESTRICT_TEMPLATE_EXPRESSIONS,
    );
    expect(arrayPropertyLength('HYGIENE-restrict-template-expressions', 'files')).toBe(0);
  });
});
