import { describe, it, expect } from 'vitest';
import * as api from '../../index.ts';

describe('public runtime exports', () => {
  it('exports the Worldline-first open helper and handle', () => {
    expect(api.openWarpWorldline).toBeDefined();
    expect(api.WarpWorldline).toBeDefined();
  });

  it('does not export the retired browser viewer service', () => {
    expect('WarpServeService' in api).toBe(false);
  });

  it('does not export the retired browser viewer websocket port', () => {
    expect('WebSocketServerPort' in api).toBe(false);
  });
});
