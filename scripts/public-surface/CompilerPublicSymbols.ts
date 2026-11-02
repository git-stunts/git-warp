import ts from 'typescript';

export function publicDeclaration(declaration: ts.Declaration): boolean {
  const name = ts.getNameOfDeclaration(declaration);
  if (name !== undefined && ts.isPrivateIdentifier(name)) return false;
  const modifiers = ts.canHaveModifiers(declaration) ? ts.getModifiers(declaration) : undefined;
  return !modifiers?.some((modifier) =>
    modifier.kind === ts.SyntaxKind.PrivateKeyword || modifier.kind === ts.SyntaxKind.ProtectedKeyword);
}

export function publicSymbol(symbol: ts.Symbol): boolean {
  return (symbol.getDeclarations() ?? []).every(publicDeclaration);
}

export function publicSignature(signature: ts.Signature): boolean {
  const declaration = signatureDeclaration(signature);
  return declaration === undefined || publicDeclaration(declaration);
}

/** The compiler returns undefined for implicit constructors despite its declared return type. */
function signatureDeclaration(signature: ts.Signature): ts.SignatureDeclaration | undefined {
  return signature.getDeclaration();
}

export function originalSymbol(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  return (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
}

export function runtimeExport(checker: ts.TypeChecker, exported: ts.Symbol): boolean {
  const symbol = originalSymbol(checker, exported);
  return (symbol.flags & ts.SymbolFlags.Value) !== 0
    && !(exported.getDeclarations() ?? []).some(ts.isTypeOnlyExportDeclaration);
}

export function declaredNames(symbol: ts.Symbol): readonly string[] {
  const names = [symbol.getName()];
  for (const declaration of symbol.getDeclarations() ?? []) {
    const name = ts.getNameOfDeclaration(declaration);
    if (name !== undefined && ts.isIdentifier(name)) names.push(name.text);
  }
  return [...new Set(names)];
}

/** Source syntax supplies conditional branches that an unresolved generic type can conceal. */
export function declaredTypes(symbol: ts.Symbol): readonly ts.TypeNode[] {
  const types: ts.TypeNode[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isBlock(node)) return;
    if (privateNode(node)) return;
    if (ts.isTypeNode(node)) types.push(node);
    else if (ts.isExpression(node)) return;
    ts.forEachChild(node, visit);
  };
  for (const declaration of symbol.getDeclarations() ?? []) ts.forEachChild(declaration, visit);
  return types;
}

function privateNode(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  return ts.getModifiers(node)?.some((modifier) =>
    modifier.kind === ts.SyntaxKind.PrivateKeyword || modifier.kind === ts.SyntaxKind.ProtectedKeyword) ?? false;
}

export function firstDeclaration(symbol: ts.Symbol | undefined): ts.Declaration | undefined {
  return symbol?.getDeclarations()?.[0];
}

export function publicMembers(type: ts.Type): readonly ts.Symbol[] {
  return type.getProperties().filter((member) => publicSymbol(member) && member.getName() !== 'prototype')
    .sort((a, b) => a.getName().localeCompare(b.getName()));
}

export function typeArguments(checker: ts.TypeChecker, type: ts.Type): readonly ts.Type[] {
  return typeReference(type) ? checker.getTypeArguments(type) : type.aliasTypeArguments ?? [];
}

/** TypeScript's documented Reference flag establishes its TypeReference runtime form. */
export function typeReference(type: ts.Type): type is ts.TypeReference {
  return (type.flags & ts.TypeFlags.Object) !== 0 && 'objectFlags' in type
    && typeof type.objectFlags === 'number' && (type.objectFlags & ts.ObjectFlags.Reference) !== 0;
}
