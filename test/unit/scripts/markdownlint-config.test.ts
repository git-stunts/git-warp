import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const configPath = fileURLToPath(new URL('../../../.markdownlint.jsonc', import.meta.url));
const configSource = readFileSync(configPath, 'utf8');
const config = ts.parseJsonText(configPath, configSource);

function configObjectExpression(): ts.ObjectLiteralExpression | null {
  const statement = config.statements[0];
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

function booleanPropertyValue(propertyName: string): boolean | null {
  const expression = configObjectExpression();
  if (!expression) {
    return null;
  }

  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    if (propertyNameText(property.name) !== propertyName) {
      continue;
    }
    if (property.initializer.kind === ts.SyntaxKind.TrueKeyword) {
      return true;
    }
    if (property.initializer.kind === ts.SyntaxKind.FalseKeyword) {
      return false;
    }
  }

  return null;
}

describe('markdownlint config policy', () => {
  it('parses as a JSONC object config', () => {
    expect(configObjectExpression()).not.toBeNull();
  });

  it('disables line-length wrapping explicitly', () => {
    expect(booleanPropertyValue('MD013')).toBe(false);
  });

  it('keeps fenced code block language enforcement enabled', () => {
    expect(booleanPropertyValue('MD040')).toBe(true);
  });
});
