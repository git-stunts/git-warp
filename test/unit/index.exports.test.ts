import { describe, it, expect } from 'vitest';
import * as api from '../../index.js';

describe('public runtime exports', () => {
  it('does not export the retired browser viewer service', () => {
    expect('WarpServeService' in api).toBe(false);
  });

  it('does not export the retired browser viewer websocket port', () => {
    expect('WebSocketServerPort' in api).toBe(false);
  });
});
