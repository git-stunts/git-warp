import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

const HYGIENE_CONSISTENT_TYPE_IMPORTS = '@typescript-eslint/consistent-type-imports';
const HYGIENE_RESTRICT_TEMPLATE_EXPRESSIONS = '@typescript-eslint/restrict-template-expressions';
const SOURCE_TREE_HYGIENE_FIXTURES = Object.freeze([
  'src/domain/type-import-hygiene-fixture.ts',
  'src/domain/template-expression-hygiene-fixture.ts',
]);
const DOMAIN_LINT_TEXT_FILE = 'src/domain/errors/index.ts';

function presentRuleId(ruleId: string | null): ruleId is string {
  return ruleId !== null;
}

function expectNoSourceTreeHygieneFixtures(): void {
  for (const fixturePath of SOURCE_TREE_HYGIENE_FIXTURES) {
    expect(existsSync(`${repoRoot}${fixturePath}`)).toBe(false);
  }
}

async function lintRuleIds(relativePath: string, source: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: repoRoot });
  const [result] = await eslint.lintText(source, { filePath: relativePath });
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
      DOMAIN_LINT_TEXT_FILE,
      [
        "import WarpError from './WarpError.ts';",
        '',
        'type Box = { readonly error: WarpError };',
        'declare const box: Box;',
        'void box;',
        '',
      ].join('\n'),
    );

    expect(ruleIds).toContain(HYGIENE_CONSISTENT_TYPE_IMPORTS);
    expectNoSourceTreeHygieneFixtures();
  });

  it('rejects boolean template interpolation through ESLint', async () => {
    const ruleIds = await lintRuleIds(
      DOMAIN_LINT_TEXT_FILE,
      [
        'const enabled = true;',
        'const message = `enabled: ${enabled}`;',
        'void message;',
        '',
      ].join('\n'),
    );

    expect(ruleIds).toContain(HYGIENE_RESTRICT_TEMPLATE_EXPRESSIONS);
    expectNoSourceTreeHygieneFixtures();
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
