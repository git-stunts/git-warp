import { describe, expect, it } from 'vitest';
import { readGitCasErrorCode, readGitCasObservedBytes } from '../../../../src/infrastructure/adapters/GitCasErrorCode.ts';

/**
 * Oracle: git-cas errors carry a string `code` and a `meta` record; a page
 * size refusal (PAGE_TOO_LARGE) puts the observed length in
 * `meta.observedBytes` (git-cas PageService). Any other shape reads as null.
 */
describe('reading an untrusted git-cas failure', () => {
  it.each([
    ['a git-cas page size refusal', { code: 'PAGE_TOO_LARGE', meta: { observedBytes: 17, maxBytes: 16 } }, 'PAGE_TOO_LARGE', 17],
    ['a refusal without a length', { code: 'PAGE_TOO_LARGE', meta: { maxBytes: 16 } }, 'PAGE_TOO_LARGE', null],
    ['a length that is not a number', { code: 'PAGE_TOO_LARGE', meta: { observedBytes: '17' } }, 'PAGE_TOO_LARGE', null],
    ['a null meta', { code: 'PAGE_TOO_LARGE', meta: null }, 'PAGE_TOO_LARGE', null],
    ['a meta that is not an object', { code: 7, meta: 'none' }, null, null],
    ['an error without meta', new Error('plain'), null, null],
    ['a thrown string', 'PAGE_TOO_LARGE', null, null],
    ['null', null, null, null],
  ])('reads %s', (_name, failure, code, observedBytes) => {
    expect({ code: readGitCasErrorCode(failure), observedBytes: readGitCasObservedBytes(failure) })
      .toEqual({ code, observedBytes });
  });
});
