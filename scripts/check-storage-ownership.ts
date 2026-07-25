import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import {
  DOMAIN_STORAGE_ROOTS,
  FORBIDDEN_CAS_MANAGEMENT_IDENTIFIERS,
  FORBIDDEN_DOMAIN_STORAGE_IDENTIFIERS,
  FORBIDDEN_STORAGE_MODULES,
  PRODUCTION_ENTRYPOINTS,
  PRODUCTION_ROOTS,
  RAW_GIT_OBJECT_WRITE_COMMANDS,
  REMOVED_PRODUCTION_IDENTIFIERS,
  REMOVED_PRODUCTION_SYMBOLS,
  STORAGE_ADAPTER_ROOT,
} from './storage-ownership-policy.ts';

export function productionTypeScriptFiles(repoRoot: string, relativeRoot: string): string[] {
  return walk(resolve(repoRoot, relativeRoot));
}

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(path));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(path);
    }
  }
  return files;
}

export function forbiddenRemovedReferences(
  repoRoot: string,
  path: string,
  sourceText = readFileSync(path, 'utf8')
): string[] {
  const source = sourceFile(path, sourceText);
  const relativePath = relative(repoRoot, path);
  const violations = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isIdentifier(node) &&
      (REMOVED_PRODUCTION_IDENTIFIERS.has(node.text) || REMOVED_PRODUCTION_SYMBOLS.has(node.text))
    ) {
      violations.add(`${relativePath} uses ${node.text}`);
    }
    const moduleName = importedModuleName(node);
    if (moduleName !== null) {
      const removed = [...REMOVED_PRODUCTION_SYMBOLS].find((symbol) => moduleName.includes(symbol));
      if (removed !== undefined) {
        violations.add(`${relativePath} imports ${removed}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...violations];
}

export function forbiddenDomainStorageReferences(
  repoRoot: string,
  path: string,
  sourceText = readFileSync(path, 'utf8')
): string[] {
  const source = sourceFile(path, sourceText);
  const relativePath = relative(repoRoot, path);
  const violations = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && FORBIDDEN_DOMAIN_STORAGE_IDENTIFIERS.has(node.text)) {
      violations.add(`${relativePath} exposes raw storage capability ${node.text}`);
    }
    const moduleName = importedModuleName(node);
    if (moduleName !== null && FORBIDDEN_STORAGE_MODULES.has(moduleName)) {
      violations.add(`${relativePath} imports forbidden storage module ${moduleName}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...violations];
}

export function forbiddenStorageModulePlacement(
  repoRoot: string,
  path: string,
  sourceText = readFileSync(path, 'utf8')
): string[] {
  const source = sourceFile(path, sourceText);
  const relativePath = relative(repoRoot, path);
  if (relativePath.startsWith(STORAGE_ADAPTER_ROOT)) {
    return [];
  }
  const violations = new Set<string>();
  const visit = (node: ts.Node): void => {
    const moduleName = importedModuleName(node);
    if (moduleName !== null && FORBIDDEN_STORAGE_MODULES.has(moduleName)) {
      violations.add(
        `${relativePath} imports ${moduleName} outside the storage adapter composition root`
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...violations];
}

export function forbiddenCasManagementImplementations(
  repoRoot: string,
  path: string,
  sourceText = readFileSync(path, 'utf8')
): string[] {
  const source = sourceFile(path, sourceText);
  const relativePath = relative(repoRoot, path);
  const violations = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && FORBIDDEN_CAS_MANAGEMENT_IDENTIFIERS.has(node.text)) {
      violations.add(`${relativePath} implements forbidden CAS/cache management ${node.text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...violations];
}

export function forbiddenRawGitObjectWrites(
  repoRoot: string,
  path: string,
  sourceText = readFileSync(path, 'utf8')
): string[] {
  const source = sourceFile(path, sourceText);
  const relativePath = relative(repoRoot, path);
  const violations = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      rawGitObjectWriteCommand(node.text) !== null
    ) {
      violations.add(
        `${relativePath} invokes raw Git object writer ${rawGitObjectWriteCommand(node.text)}`
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...violations];
}

function rawGitObjectWriteCommand(value: string): string | null {
  for (const command of RAW_GIT_OBJECT_WRITE_COMMANDS) {
    const token = new RegExp(`(?:^|\\s)${command}(?:\\s|$)`);
    if (token.test(value)) {
      return command;
    }
  }
  return null;
}

export function forbiddenPlumbingReflection(
  repoRoot: string,
  path: string,
  sourceText = readFileSync(path, 'utf8')
): string[] {
  const source = sourceFile(path, sourceText);
  const relativePath = relative(repoRoot, path);
  const violations = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (isReflectGet(node)) {
      const receiver = node.arguments[0];
      if (receiver !== undefined && receiver.getText(source).toLowerCase().includes('plumbing')) {
        violations.add(`${relativePath} reflects over Git plumbing`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...violations];
}

export function findStorageOwnershipViolations(repoRoot: string): string[] {
  const productionFiles = [
    ...PRODUCTION_ROOTS.flatMap((root) => productionTypeScriptFiles(repoRoot, root)),
    ...PRODUCTION_ENTRYPOINTS.map((path) => resolve(repoRoot, path)),
  ];
  const domainFiles = DOMAIN_STORAGE_ROOTS.flatMap((root) =>
    productionTypeScriptFiles(repoRoot, root)
  );
  return [
    ...new Set([
      ...productionFiles.flatMap((path) => forbiddenRemovedReferences(repoRoot, path)),
      ...productionFiles.flatMap((path) => forbiddenStorageModulePlacement(repoRoot, path)),
      ...productionFiles.flatMap((path) => forbiddenCasManagementImplementations(repoRoot, path)),
      ...productionFiles.flatMap((path) => forbiddenRawGitObjectWrites(repoRoot, path)),
      ...productionFiles.flatMap((path) => forbiddenPlumbingReflection(repoRoot, path)),
      ...domainFiles.flatMap((path) => forbiddenDomainStorageReferences(repoRoot, path)),
    ]),
  ].sort();
}

function sourceFile(path: string, sourceText: string): ts.SourceFile {
  return ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function importedModuleName(node: ts.Node): string | null {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier !== undefined &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier.text;
  }
  if (
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    ts.isStringLiteral(node.argument.literal)
  ) {
    return node.argument.literal.text;
  }
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    const argument = node.arguments[0];
    return argument !== undefined && ts.isStringLiteral(argument) ? argument.text : null;
  }
  return null;
}

function isReflectGet(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'Reflect' &&
    node.expression.name.text === 'get'
  );
}

function runCli(repoRoot: string): number {
  const violations = findStorageOwnershipViolations(repoRoot);
  if (violations.length === 0) {
    console.log(
      'Storage ownership boundary passed: git-cas owns CAS objects, caches, and page residency.'
    );
    return 0;
  }
  for (const violation of violations) {
    console.error(`::error::${violation}`);
  }
  return 1;
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(resolve(entryPoint)).href) {
  process.exitCode = runCli(resolve(import.meta.dirname, '..'));
}
