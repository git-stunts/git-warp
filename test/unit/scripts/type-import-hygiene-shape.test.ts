import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

function readUtf8(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('type-import/template-expression hygiene posture', () => {
  it('enables both hygiene rules in eslint config', () => {
    const eslintConfig = readUtf8('eslint.config.ts');

    expect(eslintConfig).toContain('"@typescript-eslint/consistent-type-imports": ["error"');
    expect(eslintConfig).toContain('prefer: "type-imports"');
    expect(eslintConfig).toContain('fixStyle: "inline-type-imports"');

    expect(eslintConfig).toContain('"@typescript-eslint/restrict-template-expressions": ["error"');
    expect(eslintConfig).toContain('allowAny: false');
    expect(eslintConfig).toContain('allowBoolean: false');
    expect(eslintConfig).toContain('allowNever: false');
    expect(eslintConfig).toContain('allowNullish: false');
    expect(eslintConfig).toContain('allowNumber: true');
    expect(eslintConfig).toContain('allowRegExp: false');
    expect(eslintConfig).toContain('HYGIENE-consistent-type-imports');
    expect(eslintConfig).toContain('HYGIENE-restrict-template-expressions');
  });

  it('records the rules as active rather than deferred in the decisions doc', () => {
    const decisions = readUtf8('docs/ANTI_SLUDGE_DECISIONS.md');

    expect(decisions).toContain('`@typescript-eslint/consistent-type-imports` | ESLint (active hygiene rule; quarantine-backed paydown) | bundle |');
    expect(decisions).toContain('`@typescript-eslint/restrict-template-expressions` | ESLint (active hygiene rule; quarantine-backed paydown) | bundle |');
  });

  it('keeps the hygiene quarantine manifests explicit and legible', () => {
    const consistentManifest = readUtf8('policy/quarantines/HYGIENE-consistent-type-imports.json');
    const templateManifest = readUtf8('policy/quarantines/HYGIENE-restrict-template-expressions.json');

    expect(consistentManifest).toContain('"rule_id": "@typescript-eslint/consistent-type-imports"');
    expect(consistentManifest).toMatch(/"files"\s*:\s*\[\s*\]/u);

    expect(templateManifest).toContain('"rule_id": "@typescript-eslint/restrict-template-expressions"');
    expect(templateManifest).toMatch(/"files"\s*:\s*\[\s*\]/u);
  });
});
