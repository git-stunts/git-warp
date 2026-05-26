import { describe, it, expect } from 'vitest';
import * as api from '../../index.ts';

describe('public runtime exports', () => {
  it('exports the Worldline-first handle before the open helper slice', () => {
    expect(api.WarpWorldline).toBeDefined();
    expect('openWarpWorldline' in api).toBe(false);
  });

  it('does not export the retired browser viewer service', () => {
    expect('WarpServeService' in api).toBe(false);
  });

  it('does not export the retired browser viewer websocket port', () => {
    expect('WebSocketServerPort' in api).toBe(false);
  });
});
