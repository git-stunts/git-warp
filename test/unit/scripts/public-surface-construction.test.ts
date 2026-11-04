import { afterEach, describe, expect, it } from 'vitest';
import PublicSurfaceScanner from '../../../scripts/public-surface/PublicSurfaceScanner.ts';
import SurfaceRefusal from '../../../scripts/public-surface/SurfaceRefusal.ts';
import SurfacePackageFixture from '../../helpers/SurfacePackageFixture.ts';

const owned: SurfacePackageFixture[] = [];
afterEach(() => { for (const item of owned.splice(0)) item.dispose(); });

describe('hidden Coordinate construction', () => {
  it.each([
    ['direct', 'export { Coordinate }; export declare class Plain extends Coordinate { constructor(text: string); }'],
    ['indirect', 'declare class Middle extends Coordinate {} export declare class Plain extends Middle { constructor(text: string); }'],
    ['type-only alias', 'export type { Coordinate as Ticket };'],
    ['receipt', 'export declare function receipt(): { coordinate: Coordinate };'],
  ])('rejects a protected constructor through a %s surface', (_label, surface) => {
    const item = SurfacePackageFixture.create();
    owned.push(item);
    item.write('engine.d.ts', `
      export declare class Coordinate {
        protected constructor(text: string);
        private token;
        static parse(text: string): Coordinate;
        toString(): string;
      }
    `);
    item.write('index.d.ts', `import { Coordinate } from './engine.js'; ${surface}`);
    const result = new PublicSurfaceScanner(item.root).scan();
    if (result instanceof SurfaceRefusal) throw new Error(result.reason);
    expect(result.some((finding) => finding.key.endsWith(' public-construction'))).toBe(true);
  });
});
