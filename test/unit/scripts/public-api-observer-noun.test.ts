import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const barrel = readFileSync(
  fileURLToPath(new URL('../../../index.ts', import.meta.url)),
  'utf8',
);

const observerSource = readFileSync(
  fileURLToPath(new URL('../../../src/domain/services/query/Observer.ts', import.meta.url)),
  'utf8',
);

const worldlineSource = readFileSync(
  fileURLToPath(new URL('../../../src/domain/services/Worldline.ts', import.meta.url)),
  'utf8',
);

describe('public observer noun', () => {
  it('exports Observer as the public read-handle noun at runtime', async () => {
    const pkg = await import('../../../index.ts') as Record<string, unknown>;
    expect(pkg['Observer']).toBeDefined();
    expect(pkg['ObserverView']).toBeUndefined();
    expect(barrel).toContain('Observer,');
    expect(barrel).not.toContain('ObserverView,');
  });

  it('declares Observer rather than ObserverView in the public type surface', () => {
    expect(observerSource).toContain('export default class Observer {');
    expect(observerSource).not.toContain('class ObserverView {');
    expect(observerSource).toContain('async seek(options?');
    expect(worldlineSource).toContain('observer(name: string, config: Aperture): Promise<Observer>;');
  });
});
