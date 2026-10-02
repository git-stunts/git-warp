import { isBuiltin } from 'node:module';
import ts from 'typescript';

const PUBLIC_ATTACHMENT_MODULES = new Set([
  '@git-stunts/git-warp',
  '@git-stunts/git-warp/advanced',
]);

/** Parses every module-load syntax before an installed attachment fixture runs. */
export default function attachmentConsumerImports(source: string, file: string): string[] {
  const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true);
  const failures: string[] = [];
  const visit = (node: ts.Node): void => {
    const reference = declaredModuleReference(node) ?? invokedModuleReference(node);
    if (reference !== null) checkReference(reference, failures);
    rejectLoaderAliases(node, failures);
    ts.forEachChild(node, visit);
    for (const tag of ts.getJSDocTags(node)) ts.forEachChild(tag, visit);
  };
  visit(syntax);
  return failures;
}

/** Extracts syntax nodes, including side effects, re-exports and type imports. */
function declaredModuleReference(node: ts.Node): ts.Node | null {
  if (ts.isImportDeclaration(node)) return node.moduleSpecifier;
  if (ts.isExportDeclaration(node)) return node.moduleSpecifier ?? null;
  if (ts.isExternalModuleReference(node)) return node.expression;
  return null;
}

/** Reads executable and type-only calls, retaining malformed calls for refusal. */
function invokedModuleReference(node: ts.Node): ts.Node | null {
  if (ts.isImportTypeNode(node)) return node.argument;
  if (ts.isCallExpression(node) && isModuleLoader(node.expression)) {
    return node.arguments[0] ?? node;
  }
  return null;
}

/** Recognizes dynamic import and direct CommonJS loads independently of spacing. */
function isModuleLoader(expression: ts.Expression): boolean {
  return expression.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(expression) && expression.text === 'require');
}

/** Refuses computed loads because their eventual target cannot be proven here. */
function checkReference(reference: ts.Node, failures: string[]): void {
  const literal = ts.isLiteralTypeNode(reference) ? reference.literal : reference;
  if (!ts.isStringLiteralLike(literal)) {
    failures.push('computed or missing module specifier');
    return;
  }
  const specifier = literal.text;
  if (isSupportedModule(specifier)) return;
  failures.push(`unsupported attachment consumer module: ${specifier}`);
}

/** Keeps the attachment examples on their supported API and real host builtins. */
function isSupportedModule(specifier: string): boolean {
  return PUBLIC_ATTACHMENT_MODULES.has(specifier) ||
    (specifier.startsWith('node:') && isBuiltin(specifier));
}

/** Prevents an indirect loader from hiding a computed or private module target. */
function rejectLoaderAliases(node: ts.Node, failures: string[]): void {
  if (!ts.isIdentifier(node)) return;
  if (['createRequire', 'eval', 'Function'].includes(node.text)) {
    failures.push(`unverifiable module loader: ${node.text}`);
  }
  if (isIndirectRequire(node)) failures.push('indirect require prevents module validation');
}

/** Direct require is checked above; references/aliases cannot prove their targets. */
function isIndirectRequire(node: ts.Identifier): boolean {
  if (node.text !== 'require') return false;
  return !ts.isCallExpression(node.parent) || node.parent.expression !== node;
}
