import assert from 'node:assert/strict';
import console from 'node:console';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const EXPANSION_LIMIT = 8;
const SPLIT_SEGMENTS = 6;
const callers = [
  '@typescript-eslint/typescript-estree', 'eslint',
  '@eslint/config-array', 'markdownlint-cli',
];

for (const caller of callers) {
  const callerRequire = createRequire(require.resolve(caller));
  const { Minimatch } = callerRequire('minimatch');
  const bounded = new Minimatch(
    Array(SPLIT_SEGMENTS).fill('**/../a/b').join('/'),
    { optimizationLevel: 2, braceExpandMax: EXPANSION_LIMIT },
  );
  assert.ok(bounded.set.length <= EXPANSION_LIMIT, `${caller}: expansion budget exceeded (${bounded.set.length})`);
  const source = new Minimatch('**/*.{js,ts}', { dot: true, optimizationLevel: 2 });
  assert.equal(source.match('nested/.hidden.ts'), true, caller);
  assert.equal(source.match('nested/readme.md'), false, caller);
}

console.log('caller matching and expansion bounds passed');
