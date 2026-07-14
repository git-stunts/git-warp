import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';

const FORBIDDEN_TOKENS = new Set([
  'blob',
  'cas',
  'commit',
  'git',
  'oid',
  'plumbing',
  'ref',
  'sha',
  'tree',
]);

const FORBIDDEN_COMPOUNDS = new Map([
  ['objectid', 'object-id'],
  ['objectids', 'object-id'],
]);

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
        const tokens = vocabularyTokens(identifier);
        for (const rawToken of tokens) {
          const token = singularForbiddenToken(rawToken);
          if (token === null) {
            continue;
          }
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          violations.push({
            file: relative(declarationRoot, file),
            line: position.line + 1,
            column: position.character + 1,
            identifier,
            token,
          });
        }
        const compound = FORBIDDEN_COMPOUNDS.get(tokens.join(''));
        if (compound !== undefined) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          violations.push({
            file: relative(declarationRoot, file),
            line: position.line + 1,
            column: position.character + 1,
            identifier,
            token: compound,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return violations;
}

function singularForbiddenToken(token: string): string | null {
  if (FORBIDDEN_TOKENS.has(token)) {
    return token;
  }
  if (token.endsWith('s') && FORBIDDEN_TOKENS.has(token.slice(0, -1))) {
    return token.slice(0, -1);
  }
  return null;
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
