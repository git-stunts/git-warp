import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SRC_ROOT = join(REPO_ROOT, 'src');

type CastHit = {
  readonly path: string;
  readonly line: number;
  readonly text: string;
};

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

function collectTypeScriptFiles(root: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      files.push(...collectTypeScriptFiles(path));
      continue;
    }
    if (entry.isFile() && path.endsWith('.ts')) {
      files.push(path);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function findCastHits(): readonly CastHit[] {
  const hits: CastHit[] = [];
  for (const file of collectTypeScriptFiles(SRC_ROOT)) {
    hits.push(...findCastHitsInFile(file));
  }
  return hits;
}

function findCastHitsInFile(file: string): readonly CastHit[] {
  const source = readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const hits: CastHit[] = [];

  const visit = (node: ts.Node): void => {
    if (isEscapeHatchCast(node)) {
      const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      hits.push({
        path: relative(REPO_ROOT, file),
        line: location.line + 1,
        text: node.getText(sourceFile).replace(/\s+/gu, ' '),
      });
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return hits;
}

function isEscapeHatchCast(node: ts.Node): boolean {
  if (!ts.isAsExpression(node)) {
    return false;
  }
  if (node.type.kind === ts.SyntaxKind.AnyKeyword) {
    return true;
  }
  return ts.isAsExpression(node.expression)
    && node.expression.type.kind === ts.SyntaxKind.UnknownKeyword;
}

describe('cast quarantine graduation', () => {
  it('graduates the 0025A cast manifest to an empty file list', () => {
    const manifest = readRepoFile('policy/quarantines/0025A-casts.json');

    expect(manifest).toMatch(/"files"\s*:\s*\[\s*\]/u);
  });

  it('keeps src free of double-cast and any-cast escape hatches', () => {
    expect(findCastHits()).toStrictEqual([]);
  });
});
