import { vi } from 'vitest';

export class WarpGraphMockLogger {
  readonly debug = vi.fn();
  readonly info = vi.fn();
  readonly warn = vi.fn();
  readonly error = vi.fn();
  readonly child = vi.fn(() => this);
}

export function createMockLogger(): WarpGraphMockLogger {
  return new WarpGraphMockLogger();
}
