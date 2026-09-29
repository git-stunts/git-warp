import ts from 'typescript';

/** Rejects computed imports rather than treating an incomplete trace as deletion authority. */
export default function computedModuleLoads(source: string, path: string): string[] {
  const findings: string[] = [];
  const syntax = ts.createSourceFile(path, source, ts.ScriptTarget.ESNext, true);
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isModuleLoad(node.expression)) {
      const argument = node.arguments[0];
      if (argument !== undefined && !ts.isStringLiteralLike(argument)) {
        findings.push(`Computed import prevents complete reachability analysis: ${path}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(syntax);
  return findings;
}

/** Recognizes direct import/require calls without implementing dependency resolution. */
function isModuleLoad(expression: ts.Expression): boolean {
  return expression.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(expression) && expression.text === 'require');
}
