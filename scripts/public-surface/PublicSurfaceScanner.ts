import { resolve } from 'node:path';
import ts from 'typescript';
import PackageExportReader from './PackageExportReader.ts';
import type PublicExportTarget from './PublicExportTarget.ts';
import PublicDeclarationSurface from './PublicDeclarationSurface.ts';
import SurfaceFinding from './SurfaceFinding.ts';
import SurfaceRefusal from './SurfaceRefusal.ts';
import { declaredNames, originalSymbol, runtimeExport } from './CompilerPublicSymbols.ts';
import forbiddenPublicNouns from './ForbiddenPublicNoun.ts';

/** Package artifacts, not a hand-maintained root barrel list, select the scope. */
export default class PublicSurfaceScanner {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
    Object.freeze(this);
  }

  scan(): readonly SurfaceFinding[] | SurfaceRefusal {
    const entries = new PackageExportReader(this.root).read();
    if (entries instanceof SurfaceRefusal) return entries;
    const declarations = [...new Set(entries.map((entry) => resolve(this.root, entry.declaration())))];
    const program = ts.createProgram(declarations, compilerOptions());
    const errors = ts.getPreEmitDiagnostics(program);
    if (errors.length > 0) return new SurfaceRefusal(`Public declarations have ${errors.length} compiler diagnostics`);
    return this.scanEntries(program, entries);
  }

  private scanEntries(program: ts.Program, entries: readonly PublicExportTarget[]): readonly SurfaceFinding[] | SurfaceRefusal {
    const findings = new Map<string, SurfaceFinding>();
    const coordinates = coordinateSymbols(program, entries.map((entry) => resolve(this.root, entry.declaration())));
    for (const entry of entries) {
      const results = this.scanEntry(program, entry, coordinates);
      if (results instanceof SurfaceRefusal) return results;
      for (const finding of results) findings.set(finding.key, finding);
    }
    return Object.freeze([...findings.values()].sort((a, b) => a.key.localeCompare(b.key)));
  }

  private scanEntry(program: ts.Program, entry: PublicExportTarget, coordinates: ReadonlySet<ts.Symbol>): readonly SurfaceFinding[] | SurfaceRefusal {
    const symbols = moduleExports(program, resolve(this.root, entry.declaration()));
    if (symbols instanceof SurfaceRefusal) return symbols;
    const findings = new PublicDeclarationSurface(program, coordinates).scan(entry.subpath, symbols);
    if (findings instanceof SurfaceRefusal || entry.isDeclaration()) return findings;
    const runtime = this.runtimeFindings(program, entry, symbols);
    return runtime instanceof SurfaceRefusal ? runtime : [...findings, ...runtime];
  }

  private runtimeFindings(program: ts.Program, entry: PublicExportTarget, declared: readonly ts.Symbol[]): readonly SurfaceFinding[] | SurfaceRefusal {
    const runtime = ts.createProgram([resolve(this.root, entry.target)], { ...compilerOptions(), allowJs: true });
    const exports = moduleExports(runtime, resolve(this.root, entry.target));
    if (exports instanceof SurfaceRefusal) return exports;
    const expected = new Set(declared.filter((symbol) => runtimeExport(program.getTypeChecker(), symbol)).map((symbol) => symbol.getName()));
    const actual = new Set(exports.map((symbol) => symbol.getName()));
    if (expected.size !== actual.size || [...expected].some((name) => !actual.has(name))) {
      return new SurfaceRefusal(`Runtime/declaration exports disagree at ${entry.subpath}: ${entry.target}`);
    }
    return this.runtimeNames(runtime, entry, exports);
  }

  private runtimeNames(program: ts.Program, entry: PublicExportTarget, exports: readonly ts.Symbol[]): readonly SurfaceFinding[] | SurfaceRefusal {
    const findings: SurfaceFinding[] = [];
    for (const exported of exports) {
      const original = originalSymbol(program.getTypeChecker(), exported);
      if (original.getDeclarations() === undefined) return new SurfaceRefusal(`Unresolved runtime export ${exported.getName()}`);
      for (const name of [exported.getName(), ...declaredNames(original)]) {
        for (const noun of forbiddenPublicNouns(name)) {
          findings.push(new SurfaceFinding([entry.subpath, exported.getName(), 'runtime-export', noun], entry.target));
        }
      }
    }
    return findings;
  }
}

function coordinateSymbols(program: ts.Program, files: readonly string[]): ReadonlySet<ts.Symbol> {
  const coordinates = new Set<ts.Symbol>();
  for (const file of files) {
    const symbols = moduleExports(program, file);
    if (symbols instanceof SurfaceRefusal) continue;
    for (const exported of symbols) {
      if (exported.getName() === 'Coordinate') coordinates.add(originalSymbol(program.getTypeChecker(), exported));
    }
  }
  return coordinates;
}

function moduleExports(program: ts.Program, file: string): readonly ts.Symbol[] | SurfaceRefusal {
  const source = program.getSourceFile(file);
  if (source === undefined) return new SurfaceRefusal('Executable export source could not be loaded');
  if (program.getSyntacticDiagnostics(source).length > 0) return new SurfaceRefusal('Executable export source has syntax errors');
  const checker = program.getTypeChecker();
  const module = checker.getSymbolAtLocation(source);
  return module === undefined ? new SurfaceRefusal('Executable export target is not a module') : checker.getExportsOfModule(module);
}

function compilerOptions(): ts.CompilerOptions {
  return {
    module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ESNext, strict: true, noEmit: true, skipLibCheck: false,
    types: [],
  };
}
