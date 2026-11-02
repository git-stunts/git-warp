import ts from 'typescript';
import { declaredNames, declaredTypes, firstDeclaration, originalSymbol } from './CompilerPublicSymbols.ts';
import SurfaceRefusal from './SurfaceRefusal.ts';

const MAX_REACHABLE_SYMBOLS = 50_000;

/** Retains Coordinate identity across public declaration aliases before walking exports. */
export default class CoordinateIdentityIndex {
  private readonly program: ts.Program;
  private readonly checker: ts.TypeChecker;

  constructor(program: ts.Program) {
    this.program = program;
    this.checker = program.getTypeChecker();
    Object.freeze(this);
  }

  collect(exports: readonly ts.Symbol[]): ReadonlySet<ts.Symbol> | SurfaceRefusal {
    const pending = new Set(exports);
    const coordinates = new Set<ts.Symbol>();
    for (const symbol of pending) {
      if (pending.size > MAX_REACHABLE_SYMBOLS) return new SurfaceRefusal('Coordinate identity graph exceeds analysis bound');
      if (this.standardLibrary(symbol)) continue;
      const refusal = this.inspect(symbol, coordinates, pending);
      if (refusal !== null) return refusal;
    }
    return coordinates;
  }

  private inspect(symbol: ts.Symbol, coordinates: Set<ts.Symbol>, pending: Set<ts.Symbol>): SurfaceRefusal | null {
    const target = originalSymbol(this.checker, symbol);
    const names = [...declaredNames(symbol), ...declaredNames(target)];
    const identity = names.includes('Coordinate') ? this.classIdentity(target) : null;
    if (identity instanceof SurfaceRefusal) return identity;
    if (identity !== null) coordinates.add(identity);
    for (const reference of this.references(target)) pending.add(reference);
    return null;
  }

  private classIdentity(symbol: ts.Symbol): ts.Symbol | SurfaceRefusal {
    const declaration = firstDeclaration(symbol);
    if (declaration === undefined) return new SurfaceRefusal('Coordinate export has no declaration');
    const type = (symbol.flags & ts.SymbolFlags.Type) !== 0
      ? this.checker.getDeclaredTypeOfSymbol(symbol) : this.checker.getTypeOfSymbolAtLocation(symbol, declaration);
    const identity = type.getSymbol();
    if (identity === undefined || (identity.flags & ts.SymbolFlags.Class) === 0) {
      return new SurfaceRefusal('Coordinate export must resolve to an opaque class identity');
    }
    return identity;
  }

  private references(symbol: ts.Symbol): readonly ts.Symbol[] {
    const references = new Set<ts.Symbol>();
    for (const type of declaredTypes(symbol)) {
      const reference = this.reference(type);
      if (reference !== undefined) references.add(reference);
    }
    return [...references];
  }

  private reference(type: ts.TypeNode): ts.Symbol | undefined {
    if (ts.isTypeReferenceNode(type)) return this.checker.getSymbolAtLocation(type.typeName);
    if (ts.isTypeQueryNode(type)) return this.checker.getSymbolAtLocation(type.exprName);
    if (ts.isExpressionWithTypeArguments(type)) return this.checker.getSymbolAtLocation(type.expression);
    return undefined;
  }

  private standardLibrary(symbol: ts.Symbol): boolean {
    const declarations = symbol.getDeclarations() ?? [];
    return declarations.length > 0 && declarations.every((declaration) =>
      this.program.isSourceFileDefaultLibrary(declaration.getSourceFile()));
  }
}
