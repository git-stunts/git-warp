import ts from 'typescript';

function countExports(sourceFile) {
  let exportCount = 0;
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement) || ts.isExportDeclaration(statement)) {
      continue;
    }
    if (!hasExportModifier(statement)) {
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      exportCount += statement.declarationList.declarations.length;
      continue;
    }
    exportCount += 1;
  }
  return exportCount;
}

function hasExportModifier(node) {
  if (!ts.canHaveModifiers(node)) {
    return false;
  }
  return ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

/**
 * @param {string} content
 * @param {string} [path]
 * @returns {{ loc: number, freeze: string, unknownCount: number, asCount: number, anyCount: number, typedefCount: number, enumCount: number, exportCount: number }}
 */
export function collectMetrics(content, path = 'scorecard.ts') {
  const sourceFile = ts.createSourceFile('scorecard.ts', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let unknownCount = 0;
  let asCount = 0;
  let anyCount = 0;
  let enumCount = 0;

  const visit = node => {
    if (node.kind === ts.SyntaxKind.UnknownKeyword) {
      unknownCount += 1;
    }
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      anyCount += 1;
    }
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      asCount += 1;
    }
    if (ts.isEnumDeclaration(node)) {
      enumCount += 1;
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  const typedefCount = (content.match(/@typedef\b/g) ?? []).length;
  const freeze = path.endsWith('.d.ts')
    ? 'n/a'
    : /\bclass\b/.test(content) && /\bconstructor\s*\(/.test(content)
      ? (content.includes('Object.freeze(this)') ? 'yes' : 'review')
      : 'n/a';

  return {
    loc: content.split('\n').length,
    freeze,
    unknownCount,
    asCount,
    anyCount,
    typedefCount,
    enumCount,
    exportCount: countExports(sourceFile),
  };
}
