import { describe, it } from 'vitest';

describe('browser renderer placeholder', () => {
  it('is a placeholder module (M5)', async () => {
    // Importing the module is enough to cover the placeholder line.
    await import(/** @type {any} */ ('../../../src/visualization/renderers/browser/index.js'));
  });
});
