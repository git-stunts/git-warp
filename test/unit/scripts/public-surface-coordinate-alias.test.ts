import { afterEach, describe, expect, it } from 'vitest';
import PublicSurfaceScanner from '../../../scripts/public-surface/PublicSurfaceScanner.ts';
import SurfaceRefusal from '../../../scripts/public-surface/SurfaceRefusal.ts';
import SurfacePackageFixture from '../../helpers/SurfacePackageFixture.ts';

const owned: SurfacePackageFixture[] = [];
afterEach(() => { for (const item of owned.splice(0)) item.dispose(); });

function scan(source: string) {
  const item = SurfacePackageFixture.create();
  owned.push(item);
  item.write('index.d.ts', source);
  return new PublicSurfaceScanner(item.root).scan();
}

describe.each([
  ['type declaration', 'export type Coordinate = Token; export { Token as Ticket };'],
  ['constructor variable', 'export declare const Coordinate: typeof Token; export declare const Ticket: typeof Token;'],
])('Coordinate identity through a %s', (_label, surface) => {
  it('checks construction, operations and extra members on both exported aliases', () => {
    const result = scan(`declare class Token {
      constructor(text: string); static parse(parts: { writer: string }): Token;
      parts(): { writer: string }; toString(): { writer: string };
    } ${surface}`);
    if (result instanceof SurfaceRefusal) throw new Error(result.reason);
    for (const name of ['Coordinate', 'Ticket']) {
      for (const rule of ['public-construction', 'coordinate-signature', 'coordinate-member']) {
        expect(result.some((finding) => finding.key.includes(` ${name} `) && finding.key.endsWith(` ${rule}`))).toBe(true);
      }
    }
  });

  it('accepts a valid opaque class identity through both exported aliases', () => {
    expect(scan(`declare class Token {
      private constructor(); private token;
      static parse(text: string): Token; toString(): string;
    } ${surface}`)).toEqual([]);
  });
});

describe('non-class Coordinate identities', () => {
  it.each(['string', '{ toString(): string }', 'string | { toString(): string }'])(
    'refuses an unsupported %s representation', (type) => {
      expect(scan(`export type Coordinate = ${type};`)).toBeInstanceOf(SurfaceRefusal);
    },
  );
});

describe('renamed Coordinate wrappers', () => {
  it('retains the Coordinate name on an imported alias in a public type', () => {
    const item = SurfacePackageFixture.create();
    owned.push(item);
    item.write('engine.d.ts', 'export declare class Token { constructor(text: string); toString(): string; }');
    item.write('index.d.ts', `import { Token as Coordinate } from './engine.js'; export type Ticket = Coordinate;`);
    const result = new PublicSurfaceScanner(item.root).scan();
    if (result instanceof SurfaceRefusal) throw new Error(result.reason);
    expect(result.some((finding) => finding.key.includes(' Ticket ') && finding.key.endsWith(' public-construction'))).toBe(true);
  });

  it.each([
    'type Coordinate = Token; export { Coordinate as Ticket };',
    'declare const Coordinate: typeof Token; export { Coordinate as Ticket };',
    'type Coordinate = Token; type Middle = Coordinate; export type Ticket = Middle;',
  ])('retains the original Coordinate identity in %s', (surface) => {
    const result = scan(`declare class Token {
      constructor(text: string); toString(): string;
    } ${surface}`);
    if (result instanceof SurfaceRefusal) throw new Error(result.reason);
    expect(result.some((finding) => finding.key.includes(' Ticket ') && finding.key.endsWith(' public-construction'))).toBe(true);
  });

  it('does not brand a public class through an unreachable private alias', () => {
    expect(scan(`
      declare class Token { constructor(text: string); toString(): string; }
      type Coordinate = Token;
      export { Token as Ticket };
    `)).toEqual([]);
  });
});
