import { describe, it, expect } from 'vitest';
import * as api from '../../legacy.ts';

describe('public runtime exports', () => {
  it('exports the Worldline-first open helper and handle', () => {
    expect(api.openWarpWorldline).toBeDefined();
    expect(api.WarpWorldline).toBeDefined();
    expect(api.WarpWorldlineCoordinate).toBeDefined();
    expect(api.WarpWorldlineOpticBasis).toBeDefined();
    expect(api.ProjectionHandle).toBeDefined();
    expect('Worldline' in api).toBe(false);
  });

  it('does not export the retired browser viewer service', () => {
    expect('WarpServeService' in api).toBe(false);
  });

  it('does not export the retired browser viewer websocket port', () => {
    expect('WebSocketServerPort' in api).toBe(false);
  });
});
