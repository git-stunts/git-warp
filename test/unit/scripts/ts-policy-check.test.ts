import { describe, it, expect } from 'vitest';
import {
  stripInlineComments,
  findDeclarationAnyViolations,
} from '../../../scripts/ts-policy-check.js';

describe('stripInlineComments', () => {
  it('removes trailing double-slash comments', () => {
    expect(stripInlineComments('export type Safe = string; // any in comment')).toBe('export type Safe = string; ');
  });

  it('removes same-line block comments', () => {
    expect(stripInlineComments('export type Safe = string; /* any in comment */')).toBe('export type Safe = string; ');
  });
});

describe('findDeclarationAnyViolations', () => {
  it('ignores any that only appears in trailing comments', () => {
    const src = `
      export type SafeAlias = string; // any
      export type AlsoSafe = string; /* any */
    `;

    expect(findDeclarationAnyViolations(src, 'fixture.d.ts')).toEqual([]);
  });

  it('reports any in actual declaration code even with trailing comments', () => {
    const src = `
      export type UnsafeAlias = any; // still unsafe
      export interface UnsafeShape { value: any; /* still unsafe */ }
    `;

    expect(findDeclarationAnyViolations(src, 'fixture.d.ts')).toEqual([
      "fixture.d.ts:2: 'any' in type declaration",
      "fixture.d.ts:3: 'any' in type declaration",
    ]);
  });

  it('ignores block-comment lines entirely', () => {
    const src = `
      /**
       * any inside doc comment should not count
       */
      export interface SafeShape {
        value: string;
      }
    `;

    expect(findDeclarationAnyViolations(src, 'fixture.d.ts')).toEqual([]);
  });
});
