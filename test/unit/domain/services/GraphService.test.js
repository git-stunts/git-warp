import { describe, it, expect, vi, beforeEach } from 'vitest';
import GraphService from '../../../../src/domain/services/GraphService.js';
import GraphNode from '../../../../src/domain/entities/GraphNode.js';

describe('GraphService', () => {
  let service;
  let mockPersistence;

  beforeEach(() => {
    // Create an async iterable stream for logNodesStream
    const mockStream = {
      async *[Symbol.asyncIterator]() {
        yield 'sha1\nauthor1\ndate1\n\nmsg1\x1E\n';
      }
    };

    mockPersistence = {
      commitNode: vi.fn().mockResolvedValue('new-sha'),
      showNode: vi.fn().mockResolvedValue('node-content'),
      logNodes: vi.fn().mockResolvedValue('sha1\nauthor1\ndate1\nmsg1\n--NODE-END--\n'),
      logNodesStream: vi.fn().mockResolvedValue(mockStream),
    };
    service = new GraphService({ persistence: mockPersistence });
  });

  it('delegates createNode to persistence', async () => {
    const sha = await service.createNode({ message: 'test' });
    expect(sha).toBe('new-sha');
    expect(mockPersistence.commitNode).toHaveBeenCalledWith({ message: 'test', parents: [], sign: false });
  });

  it('delegates readNode to persistence', async () => {
    const content = await service.readNode('some-sha');
    expect(content).toBe('node-content');
    expect(mockPersistence.showNode).toHaveBeenCalledWith('some-sha');
  });

  it('parses listNodes output correctly', async () => {
    const nodes = await service.listNodes({ ref: 'main' });
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toBeInstanceOf(GraphNode);
    expect(nodes[0].sha).toBe('sha1');
    expect(nodes[0].message).toBe('msg1');
  });

  describe('_parseNode edge cases', () => {
    describe('message parsing', () => {
      it('preserves whitespace-only messages without trimming', async () => {
        const mockPersistence = {
          async *logNodesStream() {
            // Message is just spaces - should be preserved
            yield 'abc123\nauthor\n2026-01-01\n\n   \x1E\n';
          }
        };
        const service = new GraphService({ persistence: mockPersistence });

        const nodes = [];
        for await (const node of service.iterateNodes({ ref: 'HEAD', limit: 10 })) {
          nodes.push(node);
        }

        expect(nodes).toHaveLength(1);
        expect(nodes[0].message).toBe('   '); // Preserved, not trimmed
      });

      it('preserves leading and trailing whitespace in messages', async () => {
        const mockPersistence = {
          async *logNodesStream() {
            yield 'abc123\nauthor\n2026-01-01\n\n  hello world  \x1E\n';
          }
        };
        const service = new GraphService({ persistence: mockPersistence });

        const nodes = [];
        for await (const node of service.iterateNodes({ ref: 'HEAD', limit: 10 })) {
          nodes.push(node);
        }

        expect(nodes).toHaveLength(1);
        expect(nodes[0].message).toBe('  hello world  ');
      });

      it('preserves multi-line messages with internal whitespace', async () => {
        const mockPersistence = {
          async *logNodesStream() {
            yield 'abc123\nauthor\n2026-01-01\n\n  line1  \n\n  line2  \x1E\n';
          }
        };
        const service = new GraphService({ persistence: mockPersistence });

        const nodes = [];
        for await (const node of service.iterateNodes({ ref: 'HEAD', limit: 10 })) {
          nodes.push(node);
        }

        expect(nodes).toHaveLength(1);
        expect(nodes[0].message).toBe('  line1  \n\n  line2  ');
      });

      it('skips nodes with completely empty messages', async () => {
        const mockPersistence = {
          async *logNodesStream() {
            // No message content at all (just the 4 header lines)
            yield 'abc123\nauthor\n2026-01-01\n\n\x1E\n';
          }
        };
        const service = new GraphService({ persistence: mockPersistence });

        const nodes = [];
        for await (const node of service.iterateNodes({ ref: 'HEAD', limit: 10 })) {
          nodes.push(node);
        }

        // Empty message nodes are skipped (GraphNode requires non-empty message)
        expect(nodes).toHaveLength(0);
      });
    });
  });
});
