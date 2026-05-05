import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const warpAppSource = readFileSync(
  fileURLToPath(new URL('../../../src/domain/WarpApp.ts', import.meta.url)),
  'utf8',
);

const worldlineSource = readFileSync(
  fileURLToPath(new URL('../../../src/domain/services/Worldline.ts', import.meta.url)),
  'utf8',
);

describe('public observer label optionality', () => {
  it('declares both labeled and unlabeled observer overloads on Worldline', () => {
    expect(worldlineSource).toContain('observer(config: Aperture): Promise<Observer>;');
    expect(worldlineSource).toContain('observer(name: string, config: Aperture): Promise<Observer>;');
  });

  it('declares both labeled and unlabeled observer overloads with options on WarpApp', () => {
    expect(warpAppSource).toContain('observer(config: Aperture, options?: ObserverOptions): Promise<Observer>;');
    expect(warpAppSource).toContain('observer(name: string, config: Aperture, options?: ObserverOptions): Promise<Observer>;');
  });
});
