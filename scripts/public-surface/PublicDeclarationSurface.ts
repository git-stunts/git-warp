import type ts from 'typescript';
import PublicTypeWalk from './PublicTypeWalk.ts';
import type SurfaceFinding from './SurfaceFinding.ts';
import SurfaceRefusal from './SurfaceRefusal.ts';

/** One compiler program supplies both symbol identity and reachable declarations. */
export default class PublicDeclarationSurface {
  private readonly program: ts.Program;
  private readonly coordinates: ReadonlySet<ts.Symbol>;

  constructor(program: ts.Program, coordinates: ReadonlySet<ts.Symbol>) {
    this.program = program;
    this.coordinates = coordinates;
    Object.freeze(this);
  }

  scan(subpath: string, symbols: readonly ts.Symbol[]): readonly SurfaceFinding[] | SurfaceRefusal {
    const findings: SurfaceFinding[] = [];
    for (const symbol of symbols) {
      const result = new PublicTypeWalk(this.program, [subpath, symbol.getName()], this.coordinates).inspect(symbol);
      if (result instanceof SurfaceRefusal) return result;
      findings.push(...result);
    }
    return findings;
  }
}
