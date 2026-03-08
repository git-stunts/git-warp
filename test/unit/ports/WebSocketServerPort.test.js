import { describe, it, expect } from 'vitest';
import WebSocketServerPort from '../../../src/ports/WebSocketServerPort.js';

describe('WebSocketServerPort', () => {
  it('throws on direct call to createServer()', () => {
    const port = new WebSocketServerPort();
    expect(() => port.createServer(() => {})).toThrow('not implemented');
  });
});
