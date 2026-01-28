import { describe, it, expect, vi, beforeEach } from 'vitest';
import GraphService from '../../../../src/domain/services/GraphService.js';
import GraphNode from '../../../../src/domain/entities/GraphNode.js';

describe('GraphService', () => {
  let service;
  let mockPersistence;
  let mockParser;

  beforeEach(() => {
    mockPersistence = {
      commitNode: vi.fn().mockResolvedValue('new-sha'),
      showNode: vi.fn().mockResolvedValue('node-content'),
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

  describe('readNode()', () => {
    it('delegates to persistence.showNode', async () => {
      const content = await service.readNode('some-sha');

      expect(content).toBe('node-content');
      expect(mockPersistence.showNode).toHaveBeenCalledWith('some-sha');
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

      expect(mockParser.parse).toHaveBeenCalledWith(mockStream);
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
});
