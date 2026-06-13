#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

type ExportKind = 'class' | 'const' | 'enum' | 'function' | 'interface' | 're-export' | 'type';

export type DeadExportFinding = {
  readonly path: string;
  readonly name: string;
  readonly kind: ExportKind;
  readonly identifierReferences: number;
};

export type DeadExportReport = {
  readonly root: string;
  readonly filesScanned: number;
  readonly exportsScanned: number;
  readonly findings: readonly DeadExportFinding[];
};

type SourceRecord = {
  readonly relativePath: string;
  readonly sourceFile: ts.SourceFile;
};

type ExportDeclarationRecord = {
  readonly path: string;
  readonly name: string;
  readonly kind: ExportKind;
};

const DEFAULT_SOURCE_ROOT = 'src';
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const IGNORED_DIRECTORIES = new Set(['.git', 'dist', 'node_modules']);
const MARKDOWN_TABLE_HEADER = '| Path | Export | Kind | Identifier refs |';
const MARKDOWN_TABLE_SEPARATOR = '| --- | --- | --- | ---: |';
export function buildDeadExportReport(sourceRoot: string = DEFAULT_SOURCE_ROOT): DeadExportReport {
  const root = resolve(sourceRoot);
  const records = sourceRecords(root);
  const declarations = records.flatMap((record) => exportedDeclarations(record));
  const referenceCounts = identifierReferenceCounts(records);
  const findings = declarations
    .map((declaration) => findingForDeclaration(referenceCounts, declaration))
    .filter((finding) => finding.identifierReferences === 0)
    .sort(compareFindings);

  return Object.freeze({
    root,
    filesScanned: records.length,
    exportsScanned: declarations.length,
    findings,
  });
}

export function formatDeadExportReport(report: DeadExportReport): string {
  const lines = [
    '# Dead Export Candidate Report',
    '',
    `Source root: ${report.root}`,
    `Files scanned: ${report.filesScanned}`,
    `Exports scanned: ${report.exportsScanned}`,
    `Candidates: ${report.findings.length}`,
    '',
    MARKDOWN_TABLE_HEADER,
    MARKDOWN_TABLE_SEPARATOR,
  ];

  for (const finding of report.findings) {
    lines.push(`| ${finding.path} | \`${finding.name}\` | ${finding.kind} | ${finding.identifierReferences} |`);
  }

  return `${lines.join('\n')}\n`;
}

function sourceRecords(root: string): readonly SourceRecord[] {
  return sourceFilePaths(root).map((path) => {
    const text = readFileSync(path, 'utf8');
    return Object.freeze({
      relativePath: relative(root, path),
      sourceFile: ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKind(path)),
    });
  });
}

function sourceFilePaths(root: string): readonly string[] {
  if (!existsSync(root)) {
    return [];
  }

  const paths: string[] = [];
  collectSourceFilePaths(root, paths);
  return paths.sort((left, right) => left.localeCompare(right));
}

function collectSourceFilePaths(directory: string, paths: string[]): void {
  for (const entry of readdirSync(directory)) {
    if (IGNORED_DIRECTORIES.has(entry)) {
      continue;
    }

    const path = resolve(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      collectSourceFilePaths(path, paths);
      continue;
    }
    if (stat.isFile() && SOURCE_EXTENSIONS.has(extname(path))) {
      paths.push(path);
    }
  }
}

function scriptKind(path: string): ts.ScriptKind {
  const extension = extname(path);
  if (extension === '.js') {
    return ts.ScriptKind.JS;
  }
  if (extension === '.jsx') {
    return ts.ScriptKind.JSX;
  }
  if (extension === '.tsx') {
    return ts.ScriptKind.TSX;
  }
  return ts.ScriptKind.TS;
}

function exportedDeclarations(record: SourceRecord): readonly ExportDeclarationRecord[] {
  const declarations: ExportDeclarationRecord[] = [];
  for (const statement of record.sourceFile.statements) {
    pushExportedStatement(record, statement, declarations);
  }
  return declarations;
}

function pushExportedStatement(
  record: SourceRecord,
  statement: ts.Statement,
  declarations: ExportDeclarationRecord[],
): void {
  if (ts.isExportDeclaration(statement)) {
    pushExportDeclaration(record, statement, declarations);
    return;
  }

  if (!hasExportModifier(statement)) {
    return;
  }

  if (ts.isClassDeclaration(statement) && statement.name !== undefined) {
    pushDeclaration(record, declarations, statement.name.text, 'class');
    return;
  }
  if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
    pushDeclaration(record, declarations, statement.name.text, 'function');
    return;
  }
  if (ts.isInterfaceDeclaration(statement)) {
    pushDeclaration(record, declarations, statement.name.text, 'interface');
    return;
  }
  if (ts.isTypeAliasDeclaration(statement)) {
    pushDeclaration(record, declarations, statement.name.text, 'type');
    return;
  }
  if (ts.isEnumDeclaration(statement)) {
    pushDeclaration(record, declarations, statement.name.text, 'enum');
    return;
  }
  if (ts.isVariableStatement(statement)) {
    pushVariableStatement(record, statement, declarations);
  }
}

function pushExportDeclaration(
  record: SourceRecord,
  statement: ts.ExportDeclaration,
  declarations: ExportDeclarationRecord[],
): void {
  const exportClause = statement.exportClause;
  if (exportClause === undefined || !ts.isNamedExports(exportClause)) {
    return;
  }

  for (const element of exportClause.elements) {
    const localName = element.propertyName?.text ?? element.name.text;
    pushDeclaration(record, declarations, localName, 're-export');
  }
}

function pushVariableStatement(
  record: SourceRecord,
  statement: ts.VariableStatement,
  declarations: ExportDeclarationRecord[],
): void {
  for (const declaration of statement.declarationList.declarations) {
    if (ts.isIdentifier(declaration.name)) {
      pushDeclaration(record, declarations, declaration.name.text, 'const');
    }
  }
}

function pushDeclaration(
  record: SourceRecord,
  declarations: ExportDeclarationRecord[],
  name: string,
  kind: ExportKind,
): void {
  declarations.push(Object.freeze({
    path: record.relativePath,
    name,
    kind,
  }));
}

function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) {
    return false;
  }
  const modifiers = ts.getModifiers(node);
  if (modifiers === undefined) {
    return false;
  }
  return modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function findingForDeclaration(
  referenceCounts: ReadonlyMap<string, number>,
  declaration: ExportDeclarationRecord,
): DeadExportFinding {
  return Object.freeze({
    path: declaration.path,
    name: declaration.name,
    kind: declaration.kind,
    identifierReferences: referenceCounts.get(declaration.name) ?? 0,
  });
}

function identifierReferenceCounts(records: readonly SourceRecord[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const record of records) {
    collectIdentifierReferenceCounts(record.sourceFile, counts);
  }
  return counts;
}

function collectIdentifierReferenceCounts(node: ts.Node, counts: Map<string, number>): void {
  if (ts.isIdentifier(node) && isReferenceIdentifier(node)) {
    counts.set(node.text, (counts.get(node.text) ?? 0) + 1);
  }
  ts.forEachChild(node, (child) => {
    collectIdentifierReferenceCounts(child, counts);
  });
}

function isReferenceIdentifier(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;
  if (parent === undefined) {
    return false;
  }
  return !isImportOrExportSpecifierName(identifier, parent) && !isDeclarationName(identifier, parent);
}

function isImportOrExportSpecifierName(identifier: ts.Identifier, parent: ts.Node): boolean {
  if (!ts.isImportSpecifier(parent) && !ts.isExportSpecifier(parent)) {
    return false;
  }
  return parent.name === identifier || parent.propertyName === identifier;
}

function isDeclarationName(identifier: ts.Identifier, parent: ts.Node): boolean {
  return (ts.isClassDeclaration(parent) && parent.name === identifier)
    || (ts.isFunctionDeclaration(parent) && parent.name === identifier)
    || (ts.isInterfaceDeclaration(parent) && parent.name === identifier)
    || (ts.isTypeAliasDeclaration(parent) && parent.name === identifier)
    || (ts.isEnumDeclaration(parent) && parent.name === identifier)
    || (ts.isVariableDeclaration(parent) && parent.name === identifier)
    || (ts.isParameter(parent) && parent.name === identifier);
}

function compareFindings(left: DeadExportFinding, right: DeadExportFinding): number {
  const pathCompare = left.path.localeCompare(right.path);
  if (pathCompare !== 0) {
    return pathCompare;
  }
  return left.name.localeCompare(right.name);
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  return resolve(entry) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  process.stdout.write(formatDeadExportReport(buildDeadExportReport(process.argv[2] ?? DEFAULT_SOURCE_ROOT)));
}
