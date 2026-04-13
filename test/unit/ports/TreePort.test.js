import { describe, it, expect } from 'vitest';
import TreePort from '../../../src/ports/TreePort.ts';

describe('TreePort', () => {
  it('abstract methods are not callable on base prototype', () => {
    expect(TreePort.prototype.writeTree).toBeUndefined();
    expect(TreePort.prototype.readTree).toBeUndefined();
    expect(TreePort.prototype.readTreeOids).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(TreePort.prototype, 'emptyTree')).toBeUndefined();
  });

  it('concrete subclass satisfies the contract', async () => {
    class TestTree extends TreePort {
      async writeTree() { return 'tree-oid'; }
      async readTree() { return { 'file.txt': new Uint8Array([1]) }; }
      async readTreeOids() { return { 'file.txt': 'blob-oid' }; }
      get emptyTree() { return '4b825dc642cb6eb9a060e54bf8d69288fbee4904'; }
    }
    const tree = new TestTree();
    expect(tree).toBeInstanceOf(TreePort);
    expect(await (/** @type {any} */ (tree)).writeTree(['100644 blob abc\tfile.txt'])).toBe('tree-oid');
    expect(tree.emptyTree).toBe('4b825dc642cb6eb9a060e54bf8d69288fbee4904');
  });
});
