import { expect, it } from 'vitest';

it('executes under Vitest as an .mts test fixture', () => {
  expect(import.meta.url.endsWith('.test.mts')).toBe(true);
});
