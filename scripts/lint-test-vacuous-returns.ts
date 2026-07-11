import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export type BareTestReturn = {
  filePath: string;
  line: number;
  column: number;
};

export function collectBareTestReturnsFromSource(
  filePath: string,
  source: string,
): BareTestReturn[] {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const findings: BareTestReturn[] = [];
  visitTestCalls(sourceFile, sourceFile, findings);
  return findings;
}

function visitTestCalls(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  findings: BareTestReturn[],
): void {
  const callback = testCallback(node);
  if (callback !== null && ts.isBlock(callback.body)) {
    scanCallbackBody(callback.body, callback.body, sourceFile, findings);
  }
  ts.forEachChild(node, (child) => visitTestCalls(child, sourceFile, findings));
}

function testCallback(node: ts.Node): ts.ArrowFunction | ts.FunctionExpression | null {
  if (!ts.isCallExpression(node) || !isItCallee(node.expression)) {
    return null;
  }
  for (let index = node.arguments.length - 1; index >= 0; index -= 1) {
    const argument = node.arguments[index];
    if (argument !== undefined && (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument))) {
      return argument;
    }
  }
  return null;
}

function isItCallee(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) {
    return expression.text === 'it';
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return isItCallee(expression.expression);
  }
  if (ts.isCallExpression(expression)) {
    return isItCallee(expression.expression);
  }
  return false;
}

function scanCallbackBody(
  node: ts.Node,
  root: ts.Node,
  sourceFile: ts.SourceFile,
  findings: BareTestReturn[],
): void {
  if (node !== root && isNestedExecutableBoundary(node)) {
    return;
  }
  if (ts.isReturnStatement(node) && node.expression === undefined) {
    const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    findings.push({
      filePath: sourceFile.fileName,
      line: location.line + 1,
      column: location.character + 1,
    });
  }
  ts.forEachChild(node, (child) => scanCallbackBody(child, root, sourceFile, findings));
}

function isNestedExecutableBoundary(node: ts.Node): boolean {
  return ts.isFunctionLike(node) || ts.isClassLike(node);
}

function testFilesFromRipgrep(): string[] {
  const output = execFileSync('rg', ['--files', 'test', '-g', '*.ts', '-g', '*.js'], {
    encoding: 'utf8',
  });
  const trimmed = output.trim();
  return trimmed.length === 0 ? [] : trimmed.split('\n');
}

function collectBareTestReturnsFromFiles(filePaths: string[]): BareTestReturn[] {
  return filePaths.flatMap((filePath) => (
    collectBareTestReturnsFromSource(filePath, readFileSync(filePath, 'utf8'))
  ));
}

function runCli(args: string[]): number {
  const filePaths = args.length > 0 ? args : testFilesFromRipgrep();
  const findings = collectBareTestReturnsFromFiles(filePaths);
  if (findings.length === 0) {
    return 0;
  }
  for (const finding of findings) {
    console.error(
      `${finding.filePath}:${String(finding.line)}:${String(finding.column)} ` +
      'bare return inside it() callback makes the test vacuous',
    );
  }
  return 1;
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(entryPoint).href) {
  process.exitCode = runCli(process.argv.slice(2));
}
