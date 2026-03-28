import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const indexDts = readFileSync(
  fileURLToPath(new URL('../../../index.d.ts', import.meta.url)),
  'utf8',
);

describe('public observer label optionality', () => {
  it('declares both labeled and unlabeled observer overloads', () => {
    expect(indexDts).toContain('observer(config: Lens): Promise<Observer>;');
    expect(indexDts).toContain('observer(name: string, config: Lens): Promise<Observer>;');
    expect(indexDts).toContain('observer(config: Lens, options?: ObserverOptions): Promise<Observer>;');
    expect(indexDts).toContain('observer(name: string, config: Lens, options?: ObserverOptions): Promise<Observer>;');
  });
});
