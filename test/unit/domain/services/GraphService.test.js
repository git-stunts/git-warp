import { describe, it, expect, vi, beforeEach } from 'vitest';
import GraphService from '../../../../src/domain/services/GraphService.js';
import GraphNode from '../../../../src/domain/entities/GraphNode.js';
import EmptyMessageError from '../../../../src/domain/errors/EmptyMessageError.js';

describe('GraphService', () => {
  let service;
  let mockPersistence;
  let mockParser;

  beforeEach(() => {
    mockPersistence = {
      commitNode: vi.fn().mockResolvedValue('new-sha'),
      showNode: vi.fn().mockResolvedValue('node-content'),
      getNodeInfo: vi.fn().mockResolvedValue({
        sha: 'abc123',
        message: 'test message',
        author: 'Test Author',
        date: '2026-01-29 10:00:00 -0500',
        parents: ['parent1'],
      }),
      nodeExists: vi.fn().mockResolvedValue(true),
      logNodesStream: vi.fn(),
    };

    // Default mock parser that yields nothing
    mockParser = {
      parse: vi.fn().mockImplementation(async function* () {}),
    };

    service = new GraphService({ persistence: mockPersistence, parser: mockParser });
  });

  describe('constructor', () => {
    it('accepts persistence and parser dependencies', () => {
      expect(service.persistence).toBe(mockPersistence);
      expect(service.parser).toBe(mockParser);
    });

    it('uses default GitLogParser when parser not provided', () => {
      const serviceWithDefaults = new GraphService({ persistence: mockPersistence });
      expect(serviceWithDefaults.parser).toBeDefined();
      expect(serviceWithDefaults.parser.constructor.name).toBe('GitLogParser');
    });

    it('throws when persistence is not provided', () => {
      expect(() => new GraphService({}))
        .toThrow('GraphService requires a persistence adapter');
    });

    it('throws when persistence is not provided with empty options', () => {
      expect(() => new GraphService({ parser: mockParser }))
        .toThrow('GraphService requires a persistence adapter');
    });

    it('throws when maxMessageBytes is zero', () => {
      expect(() => new GraphService({ persistence: mockPersistence, maxMessageBytes: 0 }))
        .toThrow('maxMessageBytes must be a positive number');
    });

    it('throws when maxMessageBytes is negative', () => {
      expect(() => new GraphService({ persistence: mockPersistence, maxMessageBytes: -100 }))
        .toThrow('maxMessageBytes must be a positive number');
    });
  });

  describe('createNode()', () => {
    it('delegates to persistence.commitNode', async () => {
      const sha = await service.createNode({ message: 'test' });

      expect(sha).toBe('new-sha');
      expect(mockPersistence.commitNode).toHaveBeenCalledWith({
        message: 'test',
        parents: [],
        sign: false,
      });
    });

    it('passes parents and sign options', async () => {
      await service.createNode({
        message: 'test',
        parents: ['parent1', 'parent2'],
        sign: true,
      });

      expect(mockPersistence.commitNode).toHaveBeenCalledWith({
        message: 'test',
        parents: ['parent1', 'parent2'],
        sign: true,
      });
    });
  });

  describe('message size validation', () => {
    it('accepts message at exactly the max size limit', async () => {
      const maxBytes = 1000; // Use small limit for testing
      const service = new GraphService({
        persistence: mockPersistence,
        maxMessageBytes: maxBytes
      });

      // Create message exactly at limit (accounting for UTF-8)
      const message = 'a'.repeat(maxBytes);
      await service.createNode({ message });

      expect(mockPersistence.commitNode).toHaveBeenCalled();
    });

    it('rejects message exceeding max size limit', async () => {
      const maxBytes = 1000;
      const service = new GraphService({
        persistence: mockPersistence,
        maxMessageBytes: maxBytes
      });

      const message = 'a'.repeat(maxBytes + 1);

      await expect(service.createNode({ message }))
        .rejects.toThrow(/exceeds maximum/);
    });

    it('measures size in bytes not characters (UTF-8)', async () => {
      const maxBytes = 100;
      const service = new GraphService({
        persistence: mockPersistence,
        maxMessageBytes: maxBytes
      });

      // Each emoji is 4 bytes in UTF-8, so 26 emojis = 104 bytes > 100
      const message = '🔥'.repeat(26);
      expect(Buffer.byteLength(message, 'utf-8')).toBe(104);

      await expect(service.createNode({ message }))
        .rejects.toThrow(/104 bytes exceeds maximum.*100 bytes/);
    });

    it('uses default max size of 1MB when not specified', () => {
      const service = new GraphService({ persistence: mockPersistence });
      expect(service.maxMessageBytes).toBe(1048576);
    });

    it('allows custom max size configuration', () => {
      const service = new GraphService({
        persistence: mockPersistence,
        maxMessageBytes: 5000000
      });
      expect(service.maxMessageBytes).toBe(5000000);
    });

    it('error message includes actual and max sizes', async () => {
      const maxBytes = 500;
      const service = new GraphService({
        persistence: mockPersistence,
        maxMessageBytes: maxBytes
      });

      const message = 'x'.repeat(600);

      await expect(service.createNode({ message }))
        .rejects.toThrow(/600 bytes.*500 bytes/);
    });
  });

  describe('empty message validation', () => {
    it('createNode throws EmptyMessageError for empty message', async () => {
      await expect(service.createNode({ message: '' }))
        .rejects.toThrow(EmptyMessageError);
    });

    it('EmptyMessageError has code EMPTY_MESSAGE', async () => {
      try {
        await service.createNode({ message: '' });
        expect.fail('Expected EmptyMessageError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EmptyMessageError);
        expect(error.code).toBe('EMPTY_MESSAGE');
      }
    });

    it('EmptyMessageError has operation createNode', async () => {
      try {
        await service.createNode({ message: '' });
        expect.fail('Expected EmptyMessageError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EmptyMessageError);
        expect(error.operation).toBe('createNode');
      }
    });

    it('createNodes throws EmptyMessageError for empty message', async () => {
      await expect(service.createNodes([{ message: '' }]))
        .rejects.toThrow(EmptyMessageError);
    });

    it('createNodes EmptyMessageError includes index in context', async () => {
      try {
        await service.createNodes([
          { message: 'Valid' },
          { message: '' }, // Empty at index 1
        ]);
        expect.fail('Expected EmptyMessageError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EmptyMessageError);
        expect(error.code).toBe('EMPTY_MESSAGE');
        expect(error.operation).toBe('createNodes');
        expect(error.context.index).toBe(1);
      }
    });

    it('createNodes does not call persistence for empty message', async () => {
      await expect(service.createNodes([{ message: '' }]))
        .rejects.toThrow(EmptyMessageError);
      expect(mockPersistence.commitNode).not.toHaveBeenCalled();
    });
  });

  describe('readNode()', () => {
    it('delegates to persistence.showNode', async () => {
      const content = await service.readNode('some-sha');

      expect(content).toBe('node-content');
      expect(mockPersistence.showNode).toHaveBeenCalledWith('some-sha');
    });
  });

  describe('hasNode()', () => {
    it('returns true when node exists', async () => {
      mockPersistence.nodeExists.mockResolvedValue(true);

      const exists = await service.hasNode('existing-sha');

      expect(exists).toBe(true);
      expect(mockPersistence.nodeExists).toHaveBeenCalledWith('existing-sha');
    });

    it('returns false when node does not exist', async () => {
      mockPersistence.nodeExists.mockResolvedValue(false);

      const exists = await service.hasNode('nonexistent-sha');

      expect(exists).toBe(false);
      expect(mockPersistence.nodeExists).toHaveBeenCalledWith('nonexistent-sha');
    });

    it('does not throw on non-existent SHA', async () => {
      mockPersistence.nodeExists.mockResolvedValue(false);

      // Should not throw, just return false
      await expect(service.hasNode('bad-sha')).resolves.toBe(false);
    });

    it('delegates to persistence.nodeExists', async () => {
      await service.hasNode('test-sha');

      expect(mockPersistence.nodeExists).toHaveBeenCalledWith('test-sha');
      expect(mockPersistence.nodeExists).toHaveBeenCalledTimes(1);
    });
  });

  describe('getNode()', () => {
    it('returns a GraphNode with all metadata', async () => {
      mockPersistence.getNodeInfo.mockResolvedValue({
        sha: 'abc123def456',
        message: 'My commit message',
        author: 'Alice',
        date: '2026-01-29 10:30:00 -0500',
        parents: ['parent1sha', 'parent2sha'],
      });

      const node = await service.getNode('abc123def456');

      expect(node).toBeInstanceOf(GraphNode);
      expect(node.sha).toBe('abc123def456');
      expect(node.message).toBe('My commit message');
      expect(node.author).toBe('Alice');
      expect(node.date).toBe('2026-01-29 10:30:00 -0500');
      expect(node.parents).toEqual(['parent1sha', 'parent2sha']);
    });

    it('delegates to persistence.getNodeInfo with the sha', async () => {
      await service.getNode('some-sha-value');

      expect(mockPersistence.getNodeInfo).toHaveBeenCalledWith('some-sha-value');
    });

    it('returns a node with empty parents array for root commits', async () => {
      mockPersistence.getNodeInfo.mockResolvedValue({
        sha: 'rootsha123',
        message: 'Initial commit',
        author: 'Bob',
        date: '2026-01-01 00:00:00 +0000',
        parents: [],
      });

      const node = await service.getNode('rootsha123');

      expect(node.parents).toEqual([]);
      expect(node.parents).toHaveLength(0);
    });

    it('returns an immutable GraphNode', async () => {
      const node = await service.getNode('abc123');

      // GraphNode instances are frozen
      expect(Object.isFrozen(node)).toBe(true);
      expect(Object.isFrozen(node.parents)).toBe(true);
    });

    it('propagates errors from persistence layer', async () => {
      mockPersistence.getNodeInfo.mockRejectedValue(new Error('Node not found'));

      await expect(service.getNode('nonexistent'))
        .rejects.toThrow('Node not found');
    });
  });

  describe('listNodes()', () => {
    it('collects nodes from iterateNodes into array', async () => {
      const mockNodes = [
        new GraphNode({ sha: 'sha1', message: 'msg1', author: 'a', date: 'd', parents: [] }),
        new GraphNode({ sha: 'sha2', message: 'msg2', author: 'a', date: 'd', parents: [] }),
      ];

      mockParser.parse = vi.fn().mockImplementation(async function* () {
        for (const node of mockNodes) {
          yield node;
        }
      });

      mockPersistence.logNodesStream.mockResolvedValue({});

      const nodes = await service.listNodes({ ref: 'main', limit: 10 });

      expect(nodes).toHaveLength(2);
      expect(nodes[0].sha).toBe('sha1');
      expect(nodes[1].sha).toBe('sha2');
    });

    it('uses default limit of 50', async () => {
      mockPersistence.logNodesStream.mockResolvedValue({});

      await service.listNodes({ ref: 'main' });

      expect(mockPersistence.logNodesStream).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 })
      );
    });
  });

  describe('iterateNodes()', () => {
    it('delegates stream parsing to injected parser', async () => {
      const mockStream = { async *[Symbol.asyncIterator]() {} };
      mockPersistence.logNodesStream.mockResolvedValue(mockStream);

      const mockNode = new GraphNode({
        sha: 'abc123',
        message: 'test',
        author: 'author',
        date: 'date',
        parents: [],
      });

      mockParser.parse = vi.fn().mockImplementation(async function* () {
        yield mockNode;
      });

      const nodes = [];
      for await (const node of service.iterateNodes({ ref: 'HEAD', limit: 10 })) {
        nodes.push(node);
      }

      expect(mockParser.parse).toHaveBeenCalledWith(mockStream, { signal: undefined });
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toBe(mockNode);
    });

    it('passes correct format to logNodesStream', async () => {
      mockPersistence.logNodesStream.mockResolvedValue({});

      // Consume the generator
      for await (const _ of service.iterateNodes({ ref: 'main', limit: 10 })) {
        // noop
      }

      expect(mockPersistence.logNodesStream).toHaveBeenCalledWith({
        ref: 'main',
        limit: 10,
        format: '%H%n%an%n%ad%n%P%n%B\x00',
      });
    });

    it('uses default limit of 1,000,000', async () => {
      mockPersistence.logNodesStream.mockResolvedValue({});

      for await (const _ of service.iterateNodes({ ref: 'main' })) {
        // noop
      }

      expect(mockPersistence.logNodesStream).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 1000000 })
      );
    });

    describe('limit validation', () => {
      it('throws for limit less than 1', async () => {
        await expect(async () => {
          for await (const _ of service.iterateNodes({ ref: 'main', limit: 0 })) {
            // noop
          }
        }).rejects.toThrow('Invalid limit: 0');
      });

      it('throws for limit greater than 10,000,000', async () => {
        await expect(async () => {
          for await (const _ of service.iterateNodes({ ref: 'main', limit: 10000001 })) {
            // noop
          }
        }).rejects.toThrow('Invalid limit: 10000001');
      });

      it('throws for non-numeric limit', async () => {
        await expect(async () => {
          for await (const _ of service.iterateNodes({ ref: 'main', limit: 'many' })) {
            // noop
          }
        }).rejects.toThrow('Invalid limit: many');
      });

      it('throws for negative limit', async () => {
        await expect(async () => {
          for await (const _ of service.iterateNodes({ ref: 'main', limit: -1 })) {
            // noop
          }
        }).rejects.toThrow('Invalid limit: -1');
      });
    });
  });

  describe('integration with real parser', () => {
    it('works end-to-end with default GitLogParser', async () => {
      // Use real parser (not mocked)
      const realService = new GraphService({ persistence: mockPersistence });

      // NUL-terminated records (no trailing newline needed)
      const mockStream = (async function* () {
        yield 'sha1\nauthor1\ndate1\n\nmsg1\x00';
        yield 'sha2\nauthor2\ndate2\nparent1\nmsg2\x00';
      })();

      mockPersistence.logNodesStream.mockResolvedValue(mockStream);

      const nodes = await realService.listNodes({ ref: 'main' });

      expect(nodes).toHaveLength(2);
      expect(nodes[0]).toBeInstanceOf(GraphNode);
      expect(nodes[0].sha).toBe('sha1');
      expect(nodes[0].message).toBe('msg1');
      expect(nodes[1].sha).toBe('sha2');
      expect(nodes[1].parents).toEqual(['parent1']);
    });
  });

  describe('countNodes()', () => {
    beforeEach(() => {
      mockPersistence.countNodes = vi.fn();
    });

    it('delegates to persistence.countNodes', async () => {
      mockPersistence.countNodes.mockResolvedValue(42);

      const count = await service.countNodes('HEAD');

      expect(count).toBe(42);
      expect(mockPersistence.countNodes).toHaveBeenCalledWith('HEAD');
    });

    it('returns count for branch ref', async () => {
      mockPersistence.countNodes.mockResolvedValue(1000);

      const count = await service.countNodes('main');

      expect(count).toBe(1000);
      expect(mockPersistence.countNodes).toHaveBeenCalledWith('main');
    });

    it('returns count for SHA ref', async () => {
      mockPersistence.countNodes.mockResolvedValue(5);

      const count = await service.countNodes('abc123def456');

      expect(count).toBe(5);
    });

    it('handles large counts', async () => {
      mockPersistence.countNodes.mockResolvedValue(1000000);

      const count = await service.countNodes('HEAD');

      expect(count).toBe(1000000);
    });

    it('returns 0 for empty result', async () => {
      mockPersistence.countNodes.mockResolvedValue(0);

      const count = await service.countNodes('HEAD');

      expect(count).toBe(0);
    });

    it('propagates errors from persistence layer', async () => {
      mockPersistence.countNodes.mockRejectedValue(new Error('Ref not found'));

      await expect(service.countNodes('nonexistent'))
        .rejects.toThrow('Ref not found');
    });
  });

  describe('createNodes()', () => {
    beforeEach(() => {
      let callCount = 0;
      mockPersistence.commitNode.mockImplementation(async () => {
        return `sha-${callCount++}`;
      });
    });

    describe('basic functionality', () => {
      it('creates multiple nodes and returns SHAs in order', async () => {
        const shas = await service.createNodes([
          { message: 'Node A' },
          { message: 'Node B' },
          { message: 'Node C' },
        ]);

        expect(shas).toHaveLength(3);
        expect(shas).toEqual(['sha-0', 'sha-1', 'sha-2']);
        expect(mockPersistence.commitNode).toHaveBeenCalledTimes(3);
      });

      it('passes message and empty parents by default', async () => {
        await service.createNodes([{ message: 'Test message' }]);

        expect(mockPersistence.commitNode).toHaveBeenCalledWith({
          message: 'Test message',
          parents: [],
          sign: false,
        });
      });

      it('passes explicit parents to persistence', async () => {
        await service.createNodes([
          { message: 'Node with parents', parents: ['existing-sha-1', 'existing-sha-2'] },
        ]);

        expect(mockPersistence.commitNode).toHaveBeenCalledWith({
          message: 'Node with parents',
          parents: ['existing-sha-1', 'existing-sha-2'],
          sign: false,
        });
      });
    });

    describe('empty array input', () => {
      it('returns empty array for empty input', async () => {
        const shas = await service.createNodes([]);

        expect(shas).toEqual([]);
        expect(mockPersistence.commitNode).not.toHaveBeenCalled();
      });
    });

    describe('placeholder references', () => {
      it('resolves $0 to first created SHA', async () => {
        await service.createNodes([
          { message: 'Root' },
          { message: 'Child', parents: ['$0'] },
        ]);

        expect(mockPersistence.commitNode).toHaveBeenNthCalledWith(2, {
          message: 'Child',
          parents: ['sha-0'],
          sign: false,
        });
      });

      it('resolves multiple placeholder references', async () => {
        await service.createNodes([
          { message: 'Root A' },
          { message: 'Root B' },
          { message: 'Merge', parents: ['$0', '$1'] },
        ]);

        expect(mockPersistence.commitNode).toHaveBeenNthCalledWith(3, {
          message: 'Merge',
          parents: ['sha-0', 'sha-1'],
          sign: false,
        });
      });

      it('supports complex DAG structures', async () => {
        const shas = await service.createNodes([
          { message: 'Root' },                           // $0
          { message: 'Child A', parents: ['$0'] },       // $1
          { message: 'Child B', parents: ['$0'] },       // $2
          { message: 'Grandchild', parents: ['$1', '$2'] }, // $3
        ]);

        expect(shas).toHaveLength(4);
        expect(mockPersistence.commitNode).toHaveBeenNthCalledWith(4, {
          message: 'Grandchild',
          parents: ['sha-1', 'sha-2'],
          sign: false,
        });
      });

      it('mixes external SHAs with placeholder references', async () => {
        await service.createNodes([
          { message: 'Branch from existing', parents: ['external-sha'] },
          { message: 'Continue', parents: ['$0'] },
        ]);

        expect(mockPersistence.commitNode).toHaveBeenNthCalledWith(1, {
          message: 'Branch from existing',
          parents: ['external-sha'],
          sign: false,
        });
        expect(mockPersistence.commitNode).toHaveBeenNthCalledWith(2, {
          message: 'Continue',
          parents: ['sha-0'],
          sign: false,
        });
      });
    });

    describe('validation - fail fast before any creation', () => {
      it('throws if input is not an array', async () => {
        await expect(service.createNodes('not an array'))
          .rejects.toThrow('createNodes requires an array of node specifications');
        expect(mockPersistence.commitNode).not.toHaveBeenCalled();
      });

      it('throws if input is null', async () => {
        await expect(service.createNodes(null))
          .rejects.toThrow('createNodes requires an array of node specifications');
        expect(mockPersistence.commitNode).not.toHaveBeenCalled();
      });

      it('throws if node spec is not an object', async () => {
        await expect(service.createNodes(['not an object']))
          .rejects.toThrow('Node at index 0 must be an object');
        expect(mockPersistence.commitNode).not.toHaveBeenCalled();
      });

      it('throws if node spec is null', async () => {
        await expect(service.createNodes([null]))
          .rejects.toThrow('Node at index 0 must be an object');
        expect(mockPersistence.commitNode).not.toHaveBeenCalled();
      });

      it('throws if message is not a string', async () => {
        await expect(service.createNodes([{ message: 123 }]))
          .rejects.toThrow('Node at index 0: message must be a string');
        expect(mockPersistence.commitNode).not.toHaveBeenCalled();
      });

      it('throws if message is missing', async () => {
        await expect(service.createNodes([{}]))
          .rejects.toThrow('Node at index 0: message must be a string');
        expect(mockPersistence.commitNode).not.toHaveBeenCalled();
      });

      it('throws if parents is not an array', async () => {
        await expect(service.createNodes([{ message: 'test', parents: 'not-array' }]))
          .rejects.toThrow('Node at index 0: parents must be an array');
        expect(mockPersistence.commitNode).not.toHaveBeenCalled();
      });

      it('throws if parent is not a string', async () => {
        await expect(service.createNodes([{ message: 'test', parents: [123] }]))
          .rejects.toThrow('Node at index 0: parent at index 0 must be a string');
        expect(mockPersistence.commitNode).not.toHaveBeenCalled();
      });

      it('includes index in error message for later nodes', async () => {
        await expect(service.createNodes([
          { message: 'Valid' },
          { message: 'Valid' },
          { message: 123 }, // Invalid at index 2
        ])).rejects.toThrow('Node at index 2: message must be a string');
        expect(mockPersistence.commitNode).not.toHaveBeenCalled();
      });
    });

    describe('message size validation', () => {
      it('throws if message exceeds max size', async () => {
        const smallLimitService = new GraphService({
          persistence: mockPersistence,
          maxMessageBytes: 100,
        });

        const largeMessage = 'x'.repeat(101);
        await expect(smallLimitService.createNodes([{ message: largeMessage }]))
          .rejects.toThrow(/Node at index 0: message size 101 bytes exceeds maximum.*100 bytes/);
        expect(mockPersistence.commitNode).not.toHaveBeenCalled();
      });

      it('validates message size for all nodes before creating any', async () => {
        const smallLimitService = new GraphService({
          persistence: mockPersistence,
          maxMessageBytes: 100,
        });

        const largeMessage = 'x'.repeat(101);
        await expect(smallLimitService.createNodes([
          { message: 'Valid' },
          { message: largeMessage }, // Invalid
        ])).rejects.toThrow('Node at index 1');
        expect(mockPersistence.commitNode).not.toHaveBeenCalled();
      });
    });

    describe('placeholder validation', () => {
      it('throws for invalid placeholder format', async () => {
        await expect(service.createNodes([
          { message: 'Root' },
          { message: 'Child', parents: ['$abc'] }, // Invalid - not a number
        ])).rejects.toThrow("Node at index 1: invalid placeholder '$abc'");
        expect(mockPersistence.commitNode).not.toHaveBeenCalled();
      });

      it('throws for placeholder referencing current index', async () => {
        await expect(service.createNodes([
          { message: 'Self-reference', parents: ['$0'] }, // Can't reference self
        ])).rejects.toThrow("Node at index 0: invalid placeholder '$0'");
        expect(mockPersistence.commitNode).not.toHaveBeenCalled();
      });

      it('throws for placeholder referencing future index', async () => {
        await expect(service.createNodes([
          { message: 'Root' },
          { message: 'Invalid', parents: ['$2'] }, // References future node
          { message: 'Future' },
        ])).rejects.toThrow("Node at index 1: invalid placeholder '$2'");
        expect(mockPersistence.commitNode).not.toHaveBeenCalled();
      });

      it('throws for negative placeholder', async () => {
        await expect(service.createNodes([
          { message: 'Root' },
          { message: 'Invalid', parents: ['$-1'] },
        ])).rejects.toThrow("Node at index 1: invalid placeholder '$-1'");
        expect(mockPersistence.commitNode).not.toHaveBeenCalled();
      });

      it('provides helpful error message with valid range', async () => {
        await expect(service.createNodes([
          { message: 'A' },
          { message: 'B' },
          { message: 'C', parents: ['$5'] },
        ])).rejects.toThrow('Must reference an earlier node index (0 to 1)');
        expect(mockPersistence.commitNode).not.toHaveBeenCalled();
      });
    });

    describe('error propagation', () => {
      it('propagates errors from persistence layer', async () => {
        mockPersistence.commitNode.mockRejectedValue(new Error('Git error'));

        await expect(service.createNodes([{ message: 'Test' }]))
          .rejects.toThrow('Git error');
      });

      it('stops creating nodes on first persistence error', async () => {
        mockPersistence.commitNode
          .mockResolvedValueOnce('sha-0')
          .mockRejectedValueOnce(new Error('Git error'));

        await expect(service.createNodes([
          { message: 'A' },
          { message: 'B' },
          { message: 'C' },
        ])).rejects.toThrow('Git error');

        // Only 2 calls made (second one failed)
        expect(mockPersistence.commitNode).toHaveBeenCalledTimes(2);
      });
    });
  });
});
