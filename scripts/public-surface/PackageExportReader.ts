import { resolve } from 'node:path';
import ts from 'typescript';
import PublicExportTarget, { safeSubpath, safeTarget } from './PublicExportTarget.ts';
import SurfaceRefusal from './SurfaceRefusal.ts';

/** Reads package metadata through the compiler's JSON syntax tree, without shape casts. */
export default class PackageExportReader {
  readonly root: string;
  private readonly targets = new Map<string, PublicExportTarget>();
  private readonly refusals: string[] = [];

  constructor(root: string) {
    this.root = resolve(root);
  }

  read(): readonly PublicExportTarget[] | SurfaceRefusal {
    this.targets.clear();
    this.refusals.length = 0;
    const value = this.readExports();
    if (value instanceof SurfaceRefusal) return value;
    this.visit(value, '.');
    if (this.refusals.length > 0) return new SurfaceRefusal(this.refusals.join('\n'));
    if (this.targets.size === 0) return new SurfaceRefusal('No executable exports found');
    return Object.freeze([...this.targets.values()].sort((a, b) => a.identity().localeCompare(b.identity())));
  }

  private readExports(): ts.Expression | SurfaceRefusal {
    const manifest = resolve(this.root, 'package.json');
    const syntax = ts.createProgram([manifest], { resolveJsonModule: true, noLib: true, noEmit: true });
    const source = syntax.getSourceFile(manifest);
    if (source === undefined || syntax.getSyntacticDiagnostics(source).length > 0) {
      return new SurfaceRefusal('Missing or invalid package.json syntax');
    }
    const statement = source.statements[0];
    if (statement === undefined || !ts.isExpressionStatement(statement)) {
      return new SurfaceRefusal('package.json must contain an object');
    }
    return this.exportsValue(statement.expression);
  }

  private exportsValue(expression: ts.Expression): ts.Expression | SurfaceRefusal {
    if (!ts.isObjectLiteralExpression(expression)) return new SurfaceRefusal('Invalid package object');
    const entries = expression.properties.filter((node) =>
      ts.isPropertyAssignment(node) && propertyName(node.name) === 'exports');
    const entry = entries[0];
    if (entries.length !== 1 || entry === undefined || !ts.isPropertyAssignment(entry)) {
      return new SurfaceRefusal('Exactly one package exports map is required');
    }
    return entry.initializer;
  }

  private visit(value: ts.Expression, subpath: string): void {
    if (ts.isStringLiteral(value)) this.add(subpath, value.text);
    else if (value.kind === ts.SyntaxKind.NullKeyword) return;
    else if (ts.isArrayLiteralExpression(value)) value.elements.forEach((item) => this.visit(item, subpath));
    else if (ts.isObjectLiteralExpression(value)) this.visitObject(value, subpath);
    else this.refusals.push(`Unsupported export value at ${subpath}`);
  }

  private visitObject(value: ts.ObjectLiteralExpression, subpath: string): void {
    const names = new Set<string>();
    const kinds = new Set<boolean>();
    for (const property of value.properties) {
      const name = this.visitProperty(property, names, subpath);
      if (name !== null) kinds.add(name.startsWith('.'));
    }
    if (kinds.size > 1) this.refusals.push('Export object mixes conditions and subpaths');
  }

  private visitProperty(property: ts.Node, names: Set<string>, subpath: string): string | null {
    const name = this.exportKey(property, names);
    if (name === null || !ts.isPropertyAssignment(property)) return null;
    names.add(name);
    this.visit(property.initializer, name.startsWith('.') ? name : subpath);
    return name;
  }

  private exportKey(property: ts.Node, names: ReadonlySet<string>): string | null {
    if (!ts.isPropertyAssignment(property)) {
      this.refusals.push('Unsupported export property');
      return null;
    }
    const name = propertyName(property.name);
    if (name === null || names.has(name)) {
      this.refusals.push('Invalid or duplicate export key');
      return null;
    }
    return name;
  }

  private add(subpath: string, target: string): void {
    if (!safeSubpath(subpath) || !safeTarget(target)) {
      this.refusals.push(`Unsupported export mapping: ${subpath} -> ${target}`);
      return;
    }
    const file = resolve(this.root, target);
    if (!ts.sys.fileExists(file)) {
      this.refusals.push(`Missing or escaping export target: ${target}`);
      return;
    }
    if (target.endsWith('.json')) return;
    this.addExecutable(subpath, target);
  }

  private addExecutable(subpath: string, target: string): void {
    if (!/\.(?:[mc]?js|d\.[mc]?ts)$/u.test(target)) {
      this.refusals.push(`Unsupported executable export target: ${target}`);
      return;
    }
    const entry = new PublicExportTarget(subpath, target);
    if (!ts.sys.fileExists(resolve(this.root, entry.declaration()))) {
      this.refusals.push(`Missing declaration surface: ${entry.declaration()}`);
    } else this.targets.set(entry.identity(), entry);
  }
}

function propertyName(node: ts.PropertyName): string | null {
  return ts.isStringLiteral(node) || ts.isIdentifier(node) ? node.text : null;
}

