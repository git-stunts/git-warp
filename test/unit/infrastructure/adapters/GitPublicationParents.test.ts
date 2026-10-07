import { expect, it } from 'vitest';
import GitPublicationParents from '../../../../src/infrastructure/adapters/GitPublicationParents.ts';

it('normalizes full OIDs and snapshots its input and output arrays', () => {
  const source = ['A'.repeat(40), 'B'.repeat(64)];
  const parents = new GitPublicationParents(source);
  source.pop();
  const output = parents.toArray();
  output.pop();
  expect(parents.toArray()).toEqual(['a'.repeat(40), 'b'.repeat(64)]);
  expect(Object.isFrozen(parents)).toBe(true);
});

it('refuses a non-array from a JavaScript caller', () => {
  // @ts-expect-error Runtime boundary validation for JavaScript callers.
  expect(() => new GitPublicationParents('a'.repeat(40)))
    .toThrow(expect.objectContaining({ code: 'PUBLICATION_INVALID' }));
});

it('refuses a non-string from a JavaScript caller', () => {
  // @ts-expect-error Runtime boundary validation for JavaScript callers.
  expect(() => new GitPublicationParents([42]))
    .toThrow(expect.objectContaining({ code: 'PUBLICATION_INVALID' }));
});

it('refuses sparse arrays instead of trusting missing parent values', () => {
  expect(() => new GitPublicationParents(new Array<string>(65)))
    .toThrow(expect.objectContaining({ code: 'PUBLICATION_INVALID' }));
});

it.each(['abcd', 'a'.repeat(39), 'a'.repeat(41), 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(40), ` ${'a'.repeat(40)}`])(
  'refuses malformed or abbreviated parent %s', parent => {
    expect(() => new GitPublicationParents([parent]))
      .toThrow(expect.objectContaining({ code: 'PUBLICATION_INVALID' }));
  },
);
