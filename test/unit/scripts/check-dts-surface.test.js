import { describe, it, expect } from 'vitest';
import {
  parseExportBlock,
  extractJsExports,
  extractDtsExports,
  classifyManifestExports,
} from '../../../scripts/check-dts-surface.js';

// ---------------------------------------------------------------------------
// parseExportBlock
// ---------------------------------------------------------------------------
describe('parseExportBlock', () => {
  it('extracts names from a simple block body', () => {
    const result = parseExportBlock('Foo, Bar, Baz');
    expect(result).toEqual(new Set(['Foo', 'Bar', 'Baz']));
  });

  it('handles `as` renames — uses the exported name', () => {
    const result = parseExportBlock('InternalFoo as Foo, Bar');
    expect(result).toEqual(new Set(['Foo', 'Bar']));
  });

  it('strips leading `type` keyword', () => {
    const result = parseExportBlock('type MyType, Foo');
    expect(result).toEqual(new Set(['MyType', 'Foo']));
  });

  it('handles `type` + `as` combined', () => {
    const result = parseExportBlock('type InternalType as PublicType');
    expect(result).toEqual(new Set(['PublicType']));
  });

  it('handles multi-line block bodies', () => {
    const block = `
      Foo,
      Bar,
      Baz
    `;
    const result = parseExportBlock(block);
    expect(result).toEqual(new Set(['Foo', 'Bar', 'Baz']));
  });

  it('ignores empty items from trailing commas', () => {
    const result = parseExportBlock('Foo, Bar,');
    expect(result).toEqual(new Set(['Foo', 'Bar']));
  });

  it('strips single-line comments', () => {
    const block = `
      Foo, // this is Foo
      Bar  // this is Bar
    `;
    const result = parseExportBlock(block);
    expect(result).toEqual(new Set(['Foo', 'Bar']));
  });

  it('returns empty set for empty body', () => {
    const result = parseExportBlock('');
    expect(result).toEqual(new Set());
  });
});

// ---------------------------------------------------------------------------
// extractJsExports
// ---------------------------------------------------------------------------
describe('extractJsExports', () => {
  it('extracts names from export { ... } blocks', () => {
    const src = `export { Foo, Bar, Baz };`;
    const result = extractJsExports(src);
    expect(result).toEqual(new Set(['Foo', 'Bar', 'Baz']));
  });

  it('handles multiple export blocks', () => {
    const src = `
      export { Foo } from './foo.js';
      export { Bar } from './bar.js';
    `;
    const result = extractJsExports(src);
    expect(result).toEqual(new Set(['Foo', 'Bar']));
  });

  it('handles as renames in re-export blocks', () => {
    const src = `export { Internal as Public };`;
    const result = extractJsExports(src);
    expect(result).toEqual(new Set(['Public']));
  });

  it('extracts standalone export const', () => {
    const src = `export const MY_CONST = 42;`;
    const result = extractJsExports(src);
    expect(result).toEqual(new Set(['MY_CONST']));
  });

  it('extracts standalone export function', () => {
    const src = `export function myFunction() {}`;
    const result = extractJsExports(src);
    expect(result).toEqual(new Set(['myFunction']));
  });

  it('extracts standalone export class', () => {
    const src = `export class MyClass {}`;
    const result = extractJsExports(src);
    expect(result).toEqual(new Set(['MyClass']));
  });

  it('extracts export default', () => {
    const src = `export default WarpGraph;`;
    const result = extractJsExports(src);
    expect(result).toEqual(new Set(['WarpGraph']));
  });

  it('extracts named export default class', () => {
    const src = `export default class WarpGraph {}`;
    const result = extractJsExports(src);
    expect(result).toEqual(new Set(['WarpGraph']));
  });

  it('extracts named export default function', () => {
    const src = `export default function createGraph() {}`;
    const result = extractJsExports(src);
    expect(result).toEqual(new Set(['createGraph']));
  });

  it('combines block and standalone exports', () => {
    const src = `
      export const CONSTANT = 1;
      export { Foo, Bar };
      export default Main;
    `;
    const result = extractJsExports(src);
    expect(result).toEqual(new Set(['CONSTANT', 'Foo', 'Bar', 'Main']));
  });

  it('handles multi-line export blocks with comments', () => {
    const src = `export {
      Foo,  // graph node
      Bar,  // graph edge
      Baz
    };`;
    const result = extractJsExports(src);
    expect(result).toEqual(new Set(['Foo', 'Bar', 'Baz']));
  });
});

// ---------------------------------------------------------------------------
// extractDtsExports
// ---------------------------------------------------------------------------
describe('extractDtsExports', () => {
  it('extracts export interface', () => {
    const src = `export interface MyPort {}`;
    const result = extractDtsExports(src);
    expect(result).toEqual(new Set(['MyPort']));
  });

  it('extracts export declare interface', () => {
    const src = `export declare interface MyPort {}`;
    const result = extractDtsExports(src);
    expect(result).toEqual(new Set(['MyPort']));
  });

  it('extracts export type with =', () => {
    const src = `export type MyAlias = string;`;
    const result = extractDtsExports(src);
    expect(result).toEqual(new Set(['MyAlias']));
  });

  it('extracts export declare type', () => {
    const src = `export declare type MyAlias = number;`;
    const result = extractDtsExports(src);
    expect(result).toEqual(new Set(['MyAlias']));
  });

  it('extracts export class', () => {
    const src = `export class WarpGraph {}`;
    const result = extractDtsExports(src);
    expect(result).toEqual(new Set(['WarpGraph']));
  });

  it('extracts export declare class', () => {
    const src = `export declare class WarpGraph {}`;
    const result = extractDtsExports(src);
    expect(result).toEqual(new Set(['WarpGraph']));
  });

  it('extracts export abstract class', () => {
    const src = `export abstract class BaseService {}`;
    const result = extractDtsExports(src);
    expect(result).toEqual(new Set(['BaseService']));
  });

  it('extracts export declare abstract class', () => {
    const src = `export declare abstract class BaseService {}`;
    const result = extractDtsExports(src);
    expect(result).toEqual(new Set(['BaseService']));
  });

  it('extracts export const', () => {
    const src = `export const VERSION: string;`;
    const result = extractDtsExports(src);
    expect(result).toEqual(new Set(['VERSION']));
  });

  it('extracts export declare const', () => {
    const src = `export declare const VERSION: string;`;
    const result = extractDtsExports(src);
    expect(result).toEqual(new Set(['VERSION']));
  });

  it('extracts export function', () => {
    const src = `export function open(): void;`;
    const result = extractDtsExports(src);
    expect(result).toEqual(new Set(['open']));
  });

  it('extracts export declare function', () => {
    const src = `export declare function open(): void;`;
    const result = extractDtsExports(src);
    expect(result).toEqual(new Set(['open']));
  });

  it('extracts export default class', () => {
    const src = `export default class WarpGraph {}`;
    const result = extractDtsExports(src);
    expect(result).toEqual(new Set(['WarpGraph']));
  });

  it('extracts export default identifier', () => {
    const src = `export default MyThing;`;
    const result = extractDtsExports(src);
    expect(result).toEqual(new Set(['MyThing']));
  });

  it('extracts export blocks with as renames', () => {
    const src = `export { InternalA as PublicA, InternalB as PublicB };`;
    const result = extractDtsExports(src);
    expect(result).toEqual(new Set(['PublicA', 'PublicB']));
  });

  it('extracts export blocks with type keyword', () => {
    const src = `export { type MyType };`;
    const result = extractDtsExports(src);
    expect(result).toEqual(new Set(['MyType']));
  });

  it('extracts export declare namespace', () => {
    const src = `export declare namespace WarpInternals {}`;
    const result = extractDtsExports(src);
    expect(result).toEqual(new Set(['WarpInternals']));
  });

  it('combines all declaration types', () => {
    const src = `
      export interface FooPort {}
      export type BarAlias = string;
      export declare class BazService {}
      export declare function init(): void;
      export { Qux };
    `;
    const result = extractDtsExports(src);
    expect(result).toEqual(new Set(['FooPort', 'BarAlias', 'BazService', 'init', 'Qux']));
  });
});

describe('classifyManifestExports', () => {
  it('splits runtime-backed and type-only manifest entries by section', () => {
    const result = classifyManifestExports({
      exports: {
        WarpGraph: { kind: 'class' },
        WebSocketServerPort: { kind: 'abstract-class' },
        CONTENT_PROPERTY_KEY: { kind: 'const' },
      },
      typeExports: {
        QueryNodeSnapshot: { kind: 'interface' },
        TraversalDirection: { kind: 'type' },
      },
    });

    expect(result.manifestNames).toEqual(
      new Set([
        'WarpGraph',
        'WebSocketServerPort',
        'CONTENT_PROPERTY_KEY',
        'QueryNodeSnapshot',
        'TraversalDirection',
      ])
    );
    expect(result.runtimeNames).toEqual(
      new Set(['WarpGraph', 'WebSocketServerPort', 'CONTENT_PROPERTY_KEY'])
    );
    expect(result.typeOnlyNames).toEqual(new Set(['QueryNodeSnapshot', 'TraversalDirection']));
    expect(result.duplicateNames).toEqual(new Set());
    expect(result.invalidRuntimeTypeOnly).toEqual(new Set());
    expect(result.invalidTypeSectionRuntime).toEqual(new Set());
  });

  it('fails closed for unknown runtime manifest kinds', () => {
    const result = classifyManifestExports({
      exports: {
        MysteryExport: { kind: 'mystery-kind' },
      },
    });

    expect(result.runtimeNames).toEqual(new Set(['MysteryExport']));
    expect(result.typeOnlyNames).toEqual(new Set());
    expect(result.invalidRuntimeTypeOnly).toEqual(new Set());
  });

  it('reports duplicate names across exports and typeExports', () => {
    const result = classifyManifestExports({
      exports: {
        WarpGraph: { kind: 'class' },
      },
      typeExports: {
        WarpGraph: { kind: 'type' },
      },
    });

    expect(result.duplicateNames).toEqual(new Set(['WarpGraph']));
  });

  it('reports type-only kinds misplaced in exports', () => {
    const result = classifyManifestExports({
      exports: {
        TraversalDirection: { kind: 'type' },
      },
    });

    expect(result.invalidRuntimeTypeOnly).toEqual(new Set(['TraversalDirection']));
  });

  it('reports runtime kinds misplaced in typeExports', () => {
    const result = classifyManifestExports({
      typeExports: {
        WarpGraph: { kind: 'class' },
      },
    });

    expect(result.invalidTypeSectionRuntime).toEqual(new Set(['WarpGraph']));
  });
});
