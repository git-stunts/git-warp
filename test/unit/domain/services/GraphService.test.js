import { describe, it, expect, vi, beforeEach } from 'vitest';
import GraphService from '../../../../src/domain/services/GraphService.js';
import GraphNode from '../../../../src/domain/entities/GraphNode.js';

describe('GraphService', () => {
  let service;
  let mockPersistence;

  beforeEach(() => {
    mockPersistence = {
      commitNode: vi.fn().mockResolvedValue('new-sha'),
      showNode: vi.fn().mockResolvedValue('node-content'),
      logNodes: vi.fn().mockResolvedValue('sha1\nauthor1\ndate1\nmsg1\n--NODE-END--\n'),
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
});
