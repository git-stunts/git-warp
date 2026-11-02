import { afterEach, describe, expect, it } from 'vitest';
import PublicSurfaceScanner from '../../../scripts/public-surface/PublicSurfaceScanner.ts';
import SurfaceRefusal from '../../../scripts/public-surface/SurfaceRefusal.ts';
import SurfacePackageFixture from '../../helpers/SurfacePackageFixture.ts';

const owned: SurfacePackageFixture[] = [];
afterEach(() => { for (const item of owned.splice(0)) item.dispose(); });

function findings(members: string): readonly string[] {
  const item = SurfacePackageFixture.create();
  owned.push(item);
  item.write('index.d.ts', `
    declare class Token { private constructor(); private token; ${members} }
    export { Token as Coordinate, Token as Ticket };
  `);
  const result = new PublicSurfaceScanner(item.root).scan();
  if (result instanceof SurfaceRefusal) throw new Error(result.reason);
  return result.map((entry) => decodeURIComponent(entry.key));
}

describe('opaque Coordinate operations', () => {
  it.each([
    ['parts input', 'static parse(parts: { writer: string; counter: number }): Token; toString(): string;'],
    ['parts output', 'static parse(text: string): Token; toString(): { writer: string; counter: number };'],
    ['data member', 'static parse: { readonly writer: string }; toString(): string;'],
    ['parts result', 'static parse(text: string): { writer: string }; toString(): string;'],
    ['extra parameter', 'static parse(text: string, writer: string): Token; toString(): string;'],
    ['overload', 'static parse(text: string): Token; static parse(parts: { writer: string }): Token; toString(): string;'],
    ['serializer input', 'static parse(text: string): Token; toString(parts: { writer: string }): string;'],
    ['generic operation', 'static parse<T>(text: string): Token; toString(): string;'],
    ['receiver parts', 'static parse(this: { writer: string }, text: string): Token; toString(): string;'],
  ])('rejects %s through the allowed operation names and their aliases', (_label, members) => {
    const keys = findings(members);
    expect(keys.some((key) => key.includes('Coordinate') && key.includes('coordinate-signature'))).toBe(true);
    expect(keys.some((key) => key.includes('Ticket') && key.includes('coordinate-signature'))).toBe(true);
  });
});
