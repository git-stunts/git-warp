import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function readRepoFile(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, 'utf8');
}

function parseRepoFile(relativePath: string): ts.SourceFile {
  return ts.createSourceFile(
    relativePath,
    readRepoFile(relativePath),
    ts.ScriptTarget.Latest,
    true,
  );
}

function exportedFunction(sourceFile: ts.SourceFile, functionName: string): ts.FunctionDeclaration | null {
  let match: ts.FunctionDeclaration | null = null;

  sourceFile.forEachChild((node) => {
    if (match !== null || !ts.isFunctionDeclaration(node) || node.name === undefined) {
      return;
    }
    const exported = node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    if (exported && node.name.text === functionName) {
      match = node;
    }
  });

  return match;
}

function jsDocTagComment(tag: ts.JSDocTag): string {
  const comment = tag.comment;
  if (typeof comment === 'string') {
    return comment;
  }
  if (comment === undefined) {
    return '';
  }
  return comment.map((part) => part.getText()).join('');
}

function deprecationTextForExportedFunction(relativePath: string, functionName: string): string {
  const declaration = exportedFunction(parseRepoFile(relativePath), functionName);
  if (declaration === null) {
    return '';
  }
  const deprecatedTag = ts.getJSDocTags(declaration)
    .find((tag) => tag.tagName.text === 'deprecated');
  if (deprecatedTag === undefined) {
    return '';
  }
  return jsDocTagComment(deprecatedTag);
}

describe('Worldline-first legacy API deprecation posture', () => {
  it('marks openWarpGraph as an advanced compatibility surface', () => {
    const deprecation = deprecationTextForExportedFunction('src/domain/WarpGraph.ts', 'openWarpGraph');

    expect(deprecation).toContain('For application workflows, use openWarpWorldline().');
    expect(deprecation).toContain('compatibility bag remains supported');
    expect(deprecation).toContain('tooling and substrate diagnostics');
  });

  it('marks WarpApp as a compatibility facade for graph-first migrations', () => {
    const source = readRepoFile('src/domain/WarpApp.ts');

    expect(source).toContain('@deprecated For new application workflows, use openWarpWorldline().');
    expect(source).toContain('compatibility facade');
  });

  it('keeps WarpCore supported for substrate diagnostics instead of first-use apps', () => {
    const source = readRepoFile('src/domain/WarpCore.ts');

    expect(source).toContain('@deprecated For application workflows, use openWarpWorldline().');
    expect(source).toContain('substrate tooling, diagnostics, replay');
  });

  it('moves the compatibility module comments to the legacy entrypoint', () => {
    const source = readRepoFile('legacy.ts');

    expect(source).toContain('Legacy compatibility surface for graph-first v18-era code.');
    expect(source).toContain("@git-stunts/git-warp/legacy");
    expect(source).toContain('export default WarpApp;');
  });
});
