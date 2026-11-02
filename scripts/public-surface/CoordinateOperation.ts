import ts from 'typescript';
import { firstDeclaration } from './CompilerPublicSymbols.ts';

/** The two permitted operations preserve an opaque Coordinate's text boundary. */
export default class CoordinateOperation {
  private readonly checker: ts.TypeChecker;
  private readonly signatures: readonly ts.Signature[];
  private readonly coordinate: ts.Type;
  private readonly name: string;

  constructor(checker: ts.TypeChecker, member: ts.Symbol, coordinate: ts.Type) {
    this.checker = checker;
    this.coordinate = coordinate;
    this.name = member.getName();
    const declaration = firstDeclaration(member);
    this.signatures = declaration === undefined ? []
      : checker.getTypeOfSymbolAtLocation(member, declaration).getCallSignatures();
    Object.freeze(this);
  }

  violation(allowed: string): string | null {
    if (this.name !== allowed) return 'coordinate-member';
    return this.accepts(allowed) ? null : 'coordinate-signature';
  }

  private accepts(name: string): boolean {
    return this.signatures.length > 0 && this.signatures.every((signature) => {
      if (signature.thisParameter !== undefined || signature.typeParameters?.length) return false;
      return name === 'parse' ? this.parser(signature) : this.serializer(signature);
    });
  }

  private parser(signature: ts.Signature): boolean {
    const parameters = signature.getParameters();
    const parameter = parameters[0];
    if (parameters.length !== 1 || parameter === undefined) return false;
    const declaration = firstDeclaration(parameter);
    if (declaration === undefined) return false;
    return this.text(this.checker.getTypeOfSymbolAtLocation(parameter, declaration))
      && this.checker.getReturnTypeOfSignature(signature) === this.coordinate;
  }

  private serializer(signature: ts.Signature): boolean {
    return signature.getParameters().length === 0
      && this.text(this.checker.getReturnTypeOfSignature(signature));
  }

  private text(type: ts.Type): boolean {
    return (type.flags & ts.TypeFlags.StringLike) !== 0;
  }
}
