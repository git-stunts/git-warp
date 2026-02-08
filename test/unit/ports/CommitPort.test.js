import { describe, it, expect } from 'vitest';
import CommitPort from '../../../src/ports/CommitPort.js';

describe('CommitPort', () => {
  it('throws on direct call to commitNode()', async () => {
    const port = new CommitPort();
    await expect(port.commitNode({ message: 'test' })).rejects.toThrow('not implemented');
  });

  it('throws on direct call to showNode()', async () => {
    const port = new CommitPort();
    await expect(port.showNode('abc123')).rejects.toThrow('not implemented');
  });

  it('throws on direct call to getNodeInfo()', async () => {
    const port = new CommitPort();
    await expect(port.getNodeInfo('abc123')).rejects.toThrow('not implemented');
  });

  it('throws on direct call to logNodes()', async () => {
    const port = new CommitPort();
    await expect(port.logNodes({ ref: 'HEAD' })).rejects.toThrow('not implemented');
  });

  it('throws on direct call to logNodesStream()', async () => {
    const port = new CommitPort();
    await expect(port.logNodesStream({ ref: 'HEAD' })).rejects.toThrow('not implemented');
  });

  it('throws on direct call to countNodes()', async () => {
    const port = new CommitPort();
    await expect(port.countNodes('HEAD')).rejects.toThrow('not implemented');
  });

  it('throws on direct call to ping()', async () => {
    const port = new CommitPort();
    await expect(port.ping()).rejects.toThrow('not implemented');
  });
});
