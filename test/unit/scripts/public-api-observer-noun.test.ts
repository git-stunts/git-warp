import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const indexJs = readFileSync(
  fileURLToPath(new URL('../../../index.ts', import.meta.url)),
  'utf8',
);

const indexDts = readFileSync(
  fileURLToPath(new URL('../../../index.d.ts', import.meta.url)),
  'utf8',
);

describe('public observer noun', () => {
  it('exports Observer as the public read-handle noun at runtime', async () => {
    const pkg = await import('../../../index.js') as Record<string, unknown>;
    expect(pkg['Observer']).toBeDefined();
    expect(pkg['ObserverView']).toBeUndefined();
    expect(indexJs).toContain('Observer,');
    expect(indexJs).not.toContain('ObserverView,');
  });

  it('declares Observer rather than ObserverView in the public type surface', () => {
    expect(indexDts).toContain('export class Observer {');
    expect(indexDts).not.toContain('export class ObserverView {');
    expect(indexDts).toContain('seek(options?: ObserverOptions): Promise<Observer>;');
    expect(indexDts).toContain('observer(name: string, config: Aperture): Promise<Observer>;');
    expect(indexDts).toContain('observer(name: string, config: Aperture, options?: ObserverOptions): Promise<Observer>;');
  });
});
