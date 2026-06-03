import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const eslintConfigPath = fileURLToPath(new URL('../../../eslint.config.ts', import.meta.url));

function duplicateFiles(files: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const file of files) {
    if (seen.has(file)) {
      duplicates.add(file);
      continue;
    }
    seen.add(file);
  }
  return [...duplicates].sort();
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }
  return null;
}

function collectFilesArrays(source: string): string[][] {
  const sourceFile = ts.createSourceFile(
    eslintConfigPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const filesArrays: string[][] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isPropertyAssignment(node)
      && propertyNameText(node.name) === 'files'
      && ts.isArrayLiteralExpression(node.initializer)
    ) {
      filesArrays.push(
        node.initializer.elements.map((element) => {
          if (!ts.isStringLiteral(element)) {
            throw new Error('Unsupported nonliteral files entry in eslint.config.ts');
          }
          return element.text;
        }),
      );
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return filesArrays;
}

describe('ESLint override files shape', () => {
  it('rejects nonliteral files entries instead of silently skipping them', () => {
    expect(() => collectFilesArrays('export default [{ files: [dynamicPattern] }];')).toThrow(
      'Unsupported nonliteral files entry in eslint.config.ts',
    );
  });

  it('does not list the same file twice inside one override block', () => {
    const source = readFileSync(eslintConfigPath, 'utf8');
    const duplicateEntries = collectFilesArrays(source)
      .map((files) => ({ files, duplicates: duplicateFiles(files) }))
      .filter((entry) => entry.duplicates.length > 0);

    expect(duplicateEntries).toEqual([]);
  });
});
