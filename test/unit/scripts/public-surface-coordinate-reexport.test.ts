import { afterEach, describe, expect, it } from 'vitest';
import PublicSurfaceScanner from '../../../scripts/public-surface/PublicSurfaceScanner.ts';
import SurfaceRefusal from '../../../scripts/public-surface/SurfaceRefusal.ts';
import SurfacePackageFixture from '../../helpers/SurfacePackageFixture.ts';

const owned: SurfacePackageFixture[] = [];
afterEach(() => { for (const item of owned.splice(0)) item.dispose(); });

function scanExportAliases(surface: string, members: string) {
  const fixture = SurfacePackageFixture.create();
  owned.push(fixture);
  fixture.write('engine.d.ts', `export declare class Token { ${members} }`);
  fixture.write('bridge.d.ts', "export { Token as Coordinate } from './engine.js';");
  fixture.write('middle.d.ts', "export { Coordinate as Marker } from './bridge.js';");
  fixture.write('index.d.ts', surface);
  return new PublicSurfaceScanner(fixture.root).scan();
}

describe.each([
  ['import then export', "import { Token as Coordinate } from './engine.js'; export { Coordinate as Ticket };"],
  ['intermediate re-export', "export { Coordinate as Ticket } from './bridge.js';"],
  ['type-only re-export', "export type { Coordinate as Ticket } from './bridge.js';"],
  ['multiple re-export hops', "export { Marker as Ticket } from './middle.js';"],
])('Coordinate identity through %s', (_label, surface) => {
  it('rejects public construction, parts operations and additional members', () => {
    const result = scanExportAliases(surface, `
      constructor(text: string); static parse(parts: { writer: string }): Token;
      parts(): { writer: string }; toString(): { writer: string };
    `);
    if (result instanceof SurfaceRefusal) throw new Error(result.reason);
    for (const rule of ['public-construction', 'coordinate-signature', 'coordinate-member']) {
      expect(result.some((finding) => finding.key.includes(' Ticket ') && finding.key.endsWith(` ${rule}`))).toBe(true);
    }
  });

  it('accepts the same route when its Coordinate class is opaque', () => {
    expect(scanExportAliases(surface, `
      private constructor(); private token;
      static parse(text: string): Token; toString(): string;
    `)).toEqual([]);
  });
});
