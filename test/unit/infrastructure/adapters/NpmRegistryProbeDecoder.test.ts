import { afterEach, expect, it, vi } from 'vitest';
import NpmRegistryProbeDecoder from '../../../../src/infrastructure/adapters/NpmRegistryProbeDecoder.ts';

const decoder = new NpmRegistryProbeDecoder();
afterEach(() => vi.restoreAllMocks());

it('reads only a JSON string as the registry version', () => {
  expect(decoder.version('"19.1.0"')).toBe('19.1.0');
  expect(decoder.version('19')).toBeUndefined();
  expect(decoder.version('npm error code E404')).toBeUndefined();
});

it.each([
  ['{"error":{"code":"E404"}}', true],
  ['{"error":{"code":"E500","summary":"E404 occurred upstream"}}', false],
  ['"E404"', false],
  ['{"code":"E404"}', false],
  ['npm error code E404', false],
])('classifies the structured error %s', (text, missing) => {
  expect(decoder.isMissingPackage(text)).toBe(missing);
});

it('does not swallow unexpected decoder failures', () => {
  const failure = new Error('unexpected decoder failure');
  vi.spyOn(JSON, 'parse').mockImplementationOnce(() => { throw failure; });
  expect(() => decoder.version('"19.1.0"')).toThrow(failure);
});
