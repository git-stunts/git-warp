import { describe, it, expect, vi, beforeEach } from 'vitest';
import BitmapNeighborProvider from '../../../../src/domain/services/BitmapNeighborProvider.js';

describe('BitmapNeighborProvider', () => {
  /** @type {*} */
  let mockReader;
  /** @type {*} */
  let provider;

  beforeEach(() => {
    mockReader = {
      getChildren: vi.fn().mockResolvedValue([]),
      getParents: vi.fn().mockResolvedValue([]),
      lookupId: vi.fn().mockResolvedValue(undefined),
    };
    provider = new BitmapNeighborProvider({ indexReader: /** @type {*} */ (mockReader) });
  });

  it('returns outgoing neighbors with empty label', async () => {
    mockReader.getChildren.mockResolvedValue(['sha2', 'sha1', 'sha3']);
    const result = await provider.getNeighbors('sha0', 'out');
    // Sorted by neighborId
    expect(result).toEqual([
      { neighborId: 'sha1', label: '' },
      { neighborId: 'sha2', label: '' },
      { neighborId: 'sha3', label: '' },
    ]);
    expect(mockReader.getChildren).toHaveBeenCalledWith('sha0');
  });

  it('returns incoming neighbors with empty label', async () => {
    mockReader.getParents.mockResolvedValue(['sha5', 'sha4']);
    const result = await provider.getNeighbors('sha0', 'in');
    expect(result).toEqual([
      { neighborId: 'sha4', label: '' },
      { neighborId: 'sha5', label: '' },
    ]);
    expect(mockReader.getParents).toHaveBeenCalledWith('sha0');
  });

  it('returns merged "both" with dedup', async () => {
    mockReader.getChildren.mockResolvedValue(['sha2']);
    mockReader.getParents.mockResolvedValue(['sha2', 'sha1']);
    const result = await provider.getNeighbors('sha0', 'both');
    // sha2 appears in both — dedup
    expect(result).toEqual([
      { neighborId: 'sha1', label: '' },
      { neighborId: 'sha2', label: '' },
    ]);
  });

  it('returns empty when labels filter has no empty string', async () => {
    mockReader.getChildren.mockResolvedValue(['sha1']);
    const result = await provider.getNeighbors('sha0', 'out', { labels: new Set(['manages']) });
    expect(result).toEqual([]);
    // Should not even call the reader
    expect(mockReader.getChildren).not.toHaveBeenCalled();
  });

  it('returns results when labels filter includes empty string', async () => {
    mockReader.getChildren.mockResolvedValue(['sha1']);
    const result = await provider.getNeighbors('sha0', 'out', { labels: new Set(['']) });
    expect(result).toEqual([{ neighborId: 'sha1', label: '' }]);
  });

  it('returns empty for node with no edges', async () => {
    const result = await provider.getNeighbors('sha0', 'out');
    expect(result).toEqual([]);
  });

  it('hasNode returns true when lookupId finds the node', async () => {
    mockReader.lookupId.mockResolvedValue(42);
    expect(await provider.hasNode('sha0')).toBe(true);
    expect(mockReader.lookupId).toHaveBeenCalledWith('sha0');
  });

  it('hasNode returns false when lookupId returns undefined', async () => {
    expect(await provider.hasNode('sha0')).toBe(false);
  });

  it('latencyClass is async-local', () => {
    expect(provider.latencyClass).toBe('async-local');
  });

  it('allows construction without indexReader or logicalIndex (lazy init)', () => {
    const empty = new BitmapNeighborProvider({});
    expect(empty).toBeDefined();
  });

  it('throws on getNeighbors when neither source is configured (B141)', async () => {
    const empty = new BitmapNeighborProvider({});
    await expect(empty.getNeighbors('node:a', 'out')).rejects.toThrow(
      'BitmapNeighborProvider requires either indexReader or logicalIndex',
    );
  });

  it('throws on hasNode when neither source is configured (B141)', async () => {
    const empty = new BitmapNeighborProvider({});
    await expect(empty.hasNode('node:a')).rejects.toThrow(
      'BitmapNeighborProvider requires either indexReader or logicalIndex',
    );
  });
});
