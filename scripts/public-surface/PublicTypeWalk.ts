import { relative } from 'node:path';
import ts from 'typescript';
import forbiddenPublicNouns from './ForbiddenPublicNoun.ts';
import SurfaceFinding from './SurfaceFinding.ts';
import SurfaceRefusal from './SurfaceRefusal.ts';
import PublicTypeVisit from './PublicTypeVisit.ts';
import { declaredNames, declaredTypes, firstDeclaration, originalSymbol, publicMembers, publicSignature, runtimeExport, typeArguments, typeReference } from './CompilerPublicSymbols.ts';

const MAX_REACHABLE_TYPES = 50_000;
const MAX_TYPE_VISITS = 100_000;
const MAX_ROUTE_LENGTH = 4_096;
const OPAQUE_TYPE_FLAGS = ts.TypeFlags.Any | ts.TypeFlags.Unknown;
const PRIMITIVE_TYPE_FLAGS = ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike
  | ts.TypeFlags.BooleanLike | ts.TypeFlags.BigIntLike | ts.TypeFlags.ESSymbolLike;

/** Walks one export's public type graph. Private bodies never supply edges. */
export default class PublicTypeWalk {
  private readonly checker: ts.TypeChecker;
  private readonly program: ts.Program;
  private readonly scope: readonly string[];
  private readonly coordinates: ReadonlySet<ts.Symbol>;
  private readonly visited = new Set<ts.Type>();
  private readonly syntaxVisited = new Set<ts.Symbol>();
  private readonly expanded = new Set<ts.Type>();
  private readonly findings = new Map<string, SurfaceFinding>();
  private readonly refusals: SurfaceRefusal[] = [];
  private readonly pending: PublicTypeVisit[] = [];

  constructor(program: ts.Program, scope: readonly string[], coordinates: ReadonlySet<ts.Symbol>) {
    this.program = program;
    this.checker = program.getTypeChecker();
    this.scope = Object.freeze([...scope]);
    this.coordinates = coordinates;
  }

  inspect(exported: ts.Symbol): readonly SurfaceFinding[] | SurfaceRefusal {
    const symbol = originalSymbol(this.checker, exported);
    const declaration = firstDeclaration(symbol);
    if (declaration === undefined) return new SurfaceRefusal(`Unresolved export ${exported.getName()}`);
    this.checkName(exported.getName(), 'export', declaration);
    declaredNames(symbol).forEach((name) => this.checkName(name, 'target', declaration));
    const value = this.checker.getTypeOfSymbolAtLocation(symbol, declaration);
    if (runtimeExport(this.checker, exported)) this.walk(value, exported.getName());
    if ((symbol.flags & ts.SymbolFlags.Type) !== 0) {
      this.walk(this.checker.getDeclaredTypeOfSymbol(symbol), exported.getName());
    }
    this.walkSyntax(symbol, exported.getName());
    this.drain();
    return this.refusals[0] ?? Object.freeze([...this.findings.values()]);
  }

  private walk(type: ts.Type, path: string): void {
    if (this.pending.length >= MAX_TYPE_VISITS || path.length > MAX_ROUTE_LENGTH) {
      this.refusals.push(new SurfaceRefusal('Public type worklist exceeds analysis bound'));
      return;
    }
    this.pending.push(new PublicTypeVisit(type, path));
  }

  private drain(): void {
    for (let index = 0; index < this.pending.length; index++) {
      if (this.refusals.length > 0) return;
      const visit = this.pending[index];
      if (visit !== undefined) this.visit(visit.type, visit.path);
    }
  }

  private visit(type: ts.Type, path: string): void {
    this.checkTypeName(type, path);
    if (!this.enter(type, path)) return;
    this.walkComponents(type, path);
    if (this.intrinsic(type)) return;
    this.expand(typeReference(type) ? type.target : type, path);
  }

  private expand(type: ts.Type, path: string): void {
    if (this.expanded.has(type)) return;
    this.expanded.add(type);
    this.walkMembers(type, path);
    this.walkSignatures(type, path);
    const symbol = type.aliasSymbol ?? type.getSymbol();
    if (symbol !== undefined) this.walkSyntax(symbol, path);
  }

  private enter(type: ts.Type, path: string): boolean {
    if (this.visited.has(type) || this.refusals.length > 0) return false;
    if (this.visited.size >= MAX_REACHABLE_TYPES) {
      this.refusals.push(new SurfaceRefusal(`Public type graph exceeds analysis bound: ${this.scope.join('/')} at ${path}`));
      return false;
    }
    this.visited.add(type);
    return true;
  }

  private checkTypeName(type: ts.Type, path: string): void {
    const symbol = type.aliasSymbol ?? type.getSymbol();
    const declaration = firstDeclaration(symbol);
    if ((type.flags & OPAQUE_TYPE_FLAGS) !== 0) this.record(path, 'uninspectable-type', declaration);
    if (type.isStringLiteral()) this.checkName(type.value, `${path}:literal`, declaration);
    if (symbol === undefined) return;
    declaredNames(symbol).forEach((name) => this.checkName(name, `${path}:type`, declaration));
    this.checkCoordinateSymbol(type, symbol);
  }

  private checkCoordinateSymbol(type: ts.Type, symbol: ts.Symbol): void {
    if (this.coordinates.has(symbol) || declaredNames(symbol).includes('Coordinate')) {
      this.checkCoordinate(type, symbol);
    }
  }

  private walkComponents(type: ts.Type, path: string): void {
    if (type.isUnionOrIntersection()) type.types.forEach((part) => this.walk(part, path));
    const arguments_ = typeArguments(this.checker, type);
    arguments_.forEach((argument, index) => this.walk(argument, `${path}<${index}>`));
    for (const part of [type.getConstraint(), type.getDefault(), type.getStringIndexType(), type.getNumberIndexType()]) {
      if (part !== undefined) this.walk(part, `${path}[]`);
    }
  }

  private intrinsic(type: ts.Type): boolean {
    if ((type.flags & PRIMITIVE_TYPE_FLAGS) !== 0) return true;
    const declarations = type.getSymbol()?.getDeclarations() ?? [];
    return declarations.length > 0 && declarations.every((declaration) => {
      const source = declaration.getSourceFile();
      return this.program.isSourceFileDefaultLibrary(source);
    });
  }

  private walkMembers(type: ts.Type, path: string): void {
    for (const property of publicMembers(type)) {
      const declaration = property.valueDeclaration ?? firstDeclaration(property);
      if (declaration === undefined) continue;
      const route = `${path}.${property.getName()}`;
      this.checkName(property.getName(), route, declaration);
      this.walk(this.checker.getTypeOfSymbolAtLocation(property, declaration), route);
    }
  }

  private walkSignatures(type: ts.Type, path: string): void {
    for (const signature of [...type.getCallSignatures(), ...type.getConstructSignatures()]) {
      this.walkSignature(signature, path);
    }
  }

  private walkSignature(signature: ts.Signature, path: string): void {
    if (!publicSignature(signature)) return;
    this.walk(this.checker.getReturnTypeOfSignature(signature), `${path}()`);
    for (const parameter of signature.getParameters()) {
      const location = parameter.valueDeclaration ?? firstDeclaration(parameter);
      if (location !== undefined) this.walk(this.checker.getTypeOfSymbolAtLocation(parameter, location), `${path}(${parameter.getName()})`);
    }
  }

  private walkSyntax(symbol: ts.Symbol, path: string): void {
    if (this.syntaxVisited.has(symbol)) return;
    this.syntaxVisited.add(symbol);
    for (const type of declaredTypes(symbol)) this.walk(this.checker.getTypeFromTypeNode(type), `${path}:declared`);
  }

  private checkCoordinate(value: ts.Type, symbol: ts.Symbol): void {
    const declaration = firstDeclaration(symbol);
    for (const signature of value.getConstructSignatures()) {
      if (publicSignature(signature)) this.record('Coordinate', 'public-construction', declaration);
    }
    const staticSide = this.staticCoordinate(value, symbol);
    this.coordinateMembers(value, staticSide ? 'static' : 'instance', staticSide ? 'parse' : 'toString');
  }

  private staticCoordinate(value: ts.Type, symbol: ts.Symbol): boolean {
    const declaration = firstDeclaration(symbol);
    return declaration !== undefined && value === this.checker.getTypeOfSymbolAtLocation(symbol, declaration);
  }

  private coordinateMembers(type: ts.Type, side: string, allowed: string): void {
    for (const member of publicMembers(type)) {
      if (member.getName() === allowed) continue;
      this.record(`Coordinate.${side}.${member.getName()}`, 'coordinate-member', firstDeclaration(member));
    }
  }

  private checkName(name: string, path: string, declaration: ts.Declaration | undefined): void {
    for (const noun of forbiddenPublicNouns(name)) this.record(path, noun, declaration);
  }

  private record(path: string, rule: string, declaration: ts.Declaration | undefined): void {
    const finding = new SurfaceFinding([...this.scope, path, rule], this.sourceLocation(declaration));
    this.findings.set(finding.key, finding);
  }

  private sourceLocation(declaration: ts.Declaration | undefined): string {
    if (declaration === undefined) return 'inferred type';
    const source = declaration.getSourceFile();
    const line = source.getLineAndCharacterOfPosition(declaration.getStart()).line + 1;
    return `${relative(this.program.getCurrentDirectory(), source.fileName)}:${line}`;
  }
}
