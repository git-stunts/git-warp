import { describe, it, expect } from 'vitest';
import TreePort from '../../../src/ports/TreePort.js';

describe('TreePort', () => {
  it('throws on direct call to writeTree()', async () => {
    const port = new TreePort();
    await expect(port.writeTree(['100644 blob abc\tfile.txt'])).rejects.toThrow('not implemented');
  });

  it('throws on direct call to readTree()', async () => {
    const port = new TreePort();
    await expect(port.readTree('abc123')).rejects.toThrow('not implemented');
  });

  it('throws on direct call to readTreeOids()', async () => {
    const port = new TreePort();
    await expect(port.readTreeOids('abc123')).rejects.toThrow('not implemented');
  });

  it('throws on direct access to emptyTree getter', () => {
    const port = new TreePort();
    expect(() => port.emptyTree).toThrow('not implemented');
  });
});
