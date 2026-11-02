import { afterEach, describe, expect, it } from 'vitest';
import PublicSurfaceScanner from '../../../scripts/public-surface/PublicSurfaceScanner.ts';
import SurfaceRefusal from '../../../scripts/public-surface/SurfaceRefusal.ts';
import SurfacePackageFixture from '../../helpers/SurfacePackageFixture.ts';

const owned: SurfacePackageFixture[] = [];
afterEach(() => { for (const fixture of owned.splice(0)) fixture.dispose(); });

function fixture(): SurfacePackageFixture {
  const item = SurfacePackageFixture.create();
  owned.push(item);
  return item;
}

function keys(item: SurfacePackageFixture): readonly string[] {
  const result = new PublicSurfaceScanner(item.root).scan();
  if (result instanceof SurfaceRefusal) throw new Error(result.reason);
  return result.map((finding) => decodeURIComponent(finding.key));
}

describe('public capability surface', () => {
  it('permits private implementation nouns, prose, and graph-shaped plans', () => {
    const item = fixture();
    item.write('index.d.ts', `
      /** checkpoint materialization is implementation prose */
      export declare class GraphNeighborhoodChart { readonly id: string; }
      export declare class View {
        private checkpoint;
        protected basis: string;
        read(): Promise<GraphNeighborhoodChart>;
      }
    `);
    expect(keys(item)).toEqual([]);
  });

  it('discovers a conditional subpath and a renamed runtime capability', () => {
    const item = fixture();
    item.write('package.json', `{"type":"module","exports":{
      ".":{"types":"./index.d.ts"},
      "./late":{"import":[null,"./late.js"],"types":"./late.d.ts"},
      "./package.json":"./package.json"
    }}`);
    item.write('late.js', 'function materialize() {} export { materialize as offer };');
    item.write('late.d.ts', 'declare function materialize(): void; export { materialize as offer };');
    expect(keys(item).some((key) => key.includes('./late offer') && key.includes('materialize'))).toBe(true);
  });

  it('detects a forbidden type hidden behind a renamed type-only export', () => {
    const item = fixture();
    item.write('index.d.ts', "export type { Graph as Ticket } from './engine.js';");
    item.write('engine.d.ts', 'export declare class Graph { addNode(id: string): void; }');
    expect(keys(item).some((key) => key.includes('Ticket') && key.includes('mutable-graph'))).toBe(true);
  });

  it('follows returned objects and inherited public members', () => {
    const item = fixture();
    item.write('index.d.ts', `
      declare class Base { checkpoint(): void; }
      declare class Hidden extends Base { readonly value: string; }
      export declare function open(): Promise<Hidden>;
    `);
    expect(keys(item).some((key) => key.includes('open') && key.includes('checkpoint'))).toBe(true);
  });

  it.each(['declare class', 'interface'])('detects a forbidden base beneath an exported %s', (declaration) => {
    const item = fixture();
    item.write('engine.d.ts', 'export declare class Graph { addNode(id: string): void; }');
    item.write('index.d.ts', `import { Graph } from './engine.js'; export ${declaration} View extends Graph {}`);
    expect(keys(item).some((key) => key.includes('View') && key.includes('mutable-graph'))).toBe(true);
  });

  it('follows public members supplied by a dependency', () => {
    const item = fixture();
    item.write('node_modules/engine/package.json', '{"name":"engine","type":"module","types":"index.d.ts"}');
    item.write('node_modules/engine/index.d.ts', 'export declare class Handle { checkpoint(): void; }');
    item.write('index.d.ts', "export declare function open(): import('engine').Handle;");
    expect(keys(item).some((key) => key.includes('checkpoint'))).toBe(true);
  });

  it('keeps finding identities stable when sibling declarations are reordered', () => {
    const item = fixture();
    const shared = 'interface Shared { checkpoint(): void; }';
    item.write('index.d.ts', `${shared} export interface View { z: Shared; a: Shared; }`);
    const before = keys(item);
    item.write('index.d.ts', `${shared} export interface View { a: Shared; z: Shared; }`);
    expect(keys(item)).toEqual(before);
  });

  it('follows callback inputs, generic containers, and public constructor inputs', () => {
    const item = fixture();
    item.write('index.d.ts', `
      export declare function read(callback: (input: { basis: string }) => void): Map<string, { frontier: string }>;
      export declare class View { constructor(options: { checkpoint: string }); }
    `);
    const found = keys(item);
    for (const noun of ['basis', 'frontier', 'checkpoint']) expect(found.some((key) => key.includes(noun))).toBe(true);
  });

  it('inspects unresolved generic branches and literal API causes', () => {
    const item = fixture();
    item.write('index.d.ts', `
      export type Choice<T> = T extends true ? { checkpoint: string } : { value: string };
      export type Receipt = { cause: 'missing_bounded_basis' | 'denied' };
    `);
    const found = keys(item);
    expect(found.some((key) => key.includes('checkpoint'))).toBe(true);
    expect(found.some((key) => key.includes('basis'))).toBe(true);
  });

  it('terminates recursive public types without treating a cycle as a violation', () => {
    const item = fixture();
    item.write('index.d.ts', 'export interface Node { readonly next: Node; readonly value: string; }');
    expect(keys(item)).toEqual([]);
  });

  it('terminates generative generic recursion while checking concrete arguments', () => {
    const item = fixture();
    item.write('index.d.ts', `
      declare class Box<T> { wrap(): Box<Box<T>>; read(): T; }
      export declare function open(): Box<{ checkpoint: string }>;
    `);
    expect(keys(item).some((key) => key.includes('checkpoint'))).toBe(true);
  });

  it('allows opaque Coordinate parsing and serialization through aliases and receipts', () => {
    const item = fixture();
    item.write('index.d.ts', `
      declare class Token {
        private constructor();
        private token;
        static parse(text: string): Token;
        toString(): string;
      }
      export { Token as Coordinate, Token as Ticket };
      export declare function receipt(): { coordinate: Token };
    `);
    expect(keys(item)).toEqual([]);
  });

  it('does not let Coordinate aliases expose construction or extra members', () => {
    const item = fixture();
    item.write('index.d.ts', `
      declare class Token {
        constructor(text: string);
        static parse(text: string): Token;
        static of(parts: string[]): Token;
        parts(): string[];
        toString(): string;
      }
      export { Token as Coordinate, Token as Ticket };
      export declare function receipt(): Token;
    `);
    const found = keys(item);
    expect(found.some((key) => key.includes('public-construction'))).toBe(true);
    expect(found.some((key) => key.includes('Ticket') && key.includes('coordinate-member'))).toBe(true);
    expect(found.some((key) => key.includes('receipt') && key.includes('coordinate-member'))).toBe(true);
  });

  it('rejects an implicit public Coordinate constructor', () => {
    const item = fixture();
    item.write('index.d.ts', 'export declare class Coordinate { static parse(text: string): Coordinate; toString(): string; }');
    expect(keys(item).some((key) => key.includes('public-construction'))).toBe(true);
  });

  it('refuses unresolved declarations rather than returning an empty successful scan', () => {
    const item = fixture();
    item.write('index.d.ts', "export type Hidden = import('./missing.js').Hidden;");
    expect(new PublicSurfaceScanner(item.root).scan()).toBeInstanceOf(SurfaceRefusal);
  });

  it('refuses runtime exports that disagree with the generated declaration surface', () => {
    const item = fixture();
    item.write('package.json', '{"type":"module","exports":{".":"./index.js"}}');
    item.write('index.js', 'export function surprise() {}');
    item.write('index.d.ts', 'export declare function advertised(): void;');
    expect(new PublicSurfaceScanner(item.root).scan()).toBeInstanceOf(SurfaceRefusal);
  });

  it.each([
    '{"exports": {".": "./missing.js"}}',
    '{"exports": {".": true}}',
    '{"exports": {".": "../escape.js"}}',
    '{"exports": {"./*": "./index.d.ts"}}',
    '{"exports": {".": "./index.d.ts", "default": "./index.d.ts"}}',
    '{"exports": {".": "./index.d.ts", ".": "./index.d.ts"}}',
    '{"exports":',
  ])('fails closed on unsupported or malformed metadata: %s', (manifest) => {
    const item = fixture();
    item.write('package.json', manifest);
    expect(new PublicSurfaceScanner(item.root).scan()).toBeInstanceOf(SurfaceRefusal);
  });
});
