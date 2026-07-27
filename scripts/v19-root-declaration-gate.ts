import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';

import {
  V19_CAPABILITY_CONTRACT,
} from '../bin/cli/capabilities/V19CapabilityContract.generated.ts';

type ForbiddenPhrase = Readonly<{
  readonly display: string;
  readonly tokens: readonly string[];
}>;

const FORBIDDEN_PHRASES: readonly ForbiddenPhrase[] =
  V19_CAPABILITY_CONTRACT.forbiddenTerms
    .filter((term) => term.scopes.some(
      (scope) => scope === 'ROOT_DECLARATION',
    ))
    .map((term) => Object.freeze({
      display: term.phrase.replaceAll(' ', '-'),
      tokens: vocabularyTokens(term.phrase),
    }));

const ALLOWED_FORMAL_IDENTIFIERS = new Set<string>(
  V19_CAPABILITY_CONTRACT.formalIdentifiers,
);

export type DeclarationVocabularyViolation = {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly identifier: string;
  readonly token: string;
};

export function findForbiddenRootDeclarationVocabulary(
  entryFile: string
): readonly DeclarationVocabularyViolation[] {
  const entry = resolve(entryFile);
  const declarationRoot = dirname(entry);
  const files = declarationClosure(entry, declarationRoot);
  const violations: DeclarationVocabularyViolation[] = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) {
        const identifier = node.text;
        if (ALLOWED_FORMAL_IDENTIFIERS.has(identifier)) {
          ts.forEachChild(node, visit);
          return;
        }
        const tokens = vocabularyTokens(identifier);
        for (const token of forbiddenMatches(tokens)) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          violations.push({
            file: relative(declarationRoot, file),
            line: position.line + 1,
            column: position.character + 1,
            identifier,
            token,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return violations;
}

function forbiddenMatches(
  tokens: readonly string[],
): readonly string[] {
  const matches: string[] = [];
  for (const forbidden of FORBIDDEN_PHRASES) {
    if (containsForbiddenPhrase(tokens, forbidden.tokens)) {
      matches.push(forbidden.display);
    }
  }
  return matches;
}

function containsForbiddenPhrase(
  tokens: readonly string[],
  forbidden: readonly string[],
): boolean {
  for (
    let start = 0;
    start + forbidden.length <= tokens.length;
    start += 1
  ) {
    if (forbidden.every(
      (token, offset) => vocabularyTokenMatches(tokens[start + offset], token),
    )) {
      return true;
    }
  }
  return false;
}

function vocabularyTokenMatches(
  candidate: string | undefined,
  forbidden: string,
): boolean {
  return candidate === forbidden
    || (
      candidate?.endsWith('s') === true
      && candidate.slice(0, -1) === forbidden
    );
}

function declarationClosure(entry: string, root: string): readonly string[] {
  const pending = [entry];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const file = pending.pop();
    if (file === undefined || visited.has(file)) {
      continue;
    }
    if (!existsSync(file)) {
      throw new Error(`Declaration dependency does not exist: ${file}`);
    }
    visited.add(file);
    const sourceFile = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    for (const specifier of moduleSpecifiers(sourceFile)) {
      const dependency = resolveDeclarationDependency(file, root, specifier);
      if (dependency !== null && !visited.has(dependency)) {
        pending.push(dependency);
      }
    }
  }
  return [...visited].sort();
}

function moduleSpecifiers(sourceFile: ts.SourceFile): readonly string[] {
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      specifiers.push(node.argument.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

function resolveDeclarationDependency(
  importer: string,
  root: string,
  specifier: string
): string | null {
  if (!specifier.startsWith('.')) {
    return null;
  }
  const unresolved = resolve(dirname(importer), specifier);
  const candidates = [
    unresolved.replace(/\.(?:d\.)?(?:ts|js)$/, '.d.ts'),
    `${unresolved}.d.ts`,
    resolve(unresolved, 'index.d.ts'),
  ];
  const dependency = candidates.find((candidate) => existsSync(candidate));
  if (dependency === undefined) {
    throw new Error(`Cannot resolve declaration dependency ${specifier} from ${importer}`);
  }
  const relativeDependency = relative(root, dependency);
  if (relativeDependency.startsWith('..')) {
    throw new Error(`Declaration dependency escapes the package: ${dependency}`);
  }
  return dependency;
}

function vocabularyTokens(identifier: string): readonly string[] {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((token) => token.length > 0)
    .map((token) => token.toLowerCase());
}
