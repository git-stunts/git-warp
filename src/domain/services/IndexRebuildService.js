import BitmapIndexBuilder from './BitmapIndexBuilder.js';
import BitmapIndexReader from './BitmapIndexReader.js';

/**
 * Service for building and loading the bitmap index from the graph.
 *
 * This service orchestrates index creation by walking the graph and persisting
 * the resulting bitmap shards to storage via the IndexStoragePort.
 */
export default class IndexRebuildService {
  /**
   * Creates an IndexRebuildService instance.
   * @param {Object} options
   * @param {import('./GraphService.js').default} options.graphService - Graph service for iterating nodes
   * @param {import('../../ports/IndexStoragePort.js').default} options.storage - Storage adapter for persisting index
   */
  constructor({ graphService, storage }) {
    this.graphService = graphService;
    this.storage = storage;
  }

  /**
   * Rebuilds the bitmap index by walking the graph from a ref.
   *
   * **Persistence**: Creates a Git tree containing sharded JSON blobs:
   * - `meta_XX.json`: SHA→ID mappings (256 shards by SHA prefix)
   * - `shards_fwd_XX.json`: Forward edge bitmaps (child lookups)
   * - `shards_rev_XX.json`: Reverse edge bitmaps (parent lookups)
   *
   * **Memory cost**: O(N) where N is the number of nodes. Each node requires:
   * - ~80 bytes for SHA→ID mapping
   * - ~16-64 bytes per edge in bitmap form (compressed)
   * - For 1M nodes with avg 1.5 parents: ~150-200MB peak RAM
   *
   * **Time complexity**: O(N) - single pass through the graph.
   *
   * @param {string} ref - Git ref to start traversal from (e.g., 'HEAD', branch name, SHA)
   * @param {Object} [options] - Rebuild options
   * @param {number} [options.limit=10000000] - Maximum nodes to process (1 to 10,000,000)
   * @returns {Promise<string>} OID of the created tree containing the index
   * @throws {Error} If ref is invalid or limit is out of range
   * @example
   * // Rebuild index from HEAD
   * const treeOid = await rebuildService.rebuild('HEAD');
   *
   * // Rebuild with custom limit
   * const treeOid = await rebuildService.rebuild('main', { limit: 100000 });
   */
  async rebuild(ref, { limit = 10_000_000 } = {}) {
    const builder = new BitmapIndexBuilder();

    for await (const node of this.graphService.iterateNodes({ ref, limit })) {
      builder.registerNode(node.sha);
      for (const parentSha of node.parents) {
        builder.addEdge(parentSha, node.sha);
      }
    }

    const treeStructure = builder.serialize();
    const flatEntries = [];
    for (const [path, buffer] of Object.entries(treeStructure)) {
      const oid = await this.storage.writeBlob(buffer);
      flatEntries.push(`100644 blob ${oid}\t${path}`);
    }

    return await this.storage.writeTree(flatEntries);
  }

  /**
   * Loads a previously built index from a tree OID.
   *
   * **Memory cost**: Lazy loading - only shards accessed are loaded into memory.
   * - Initial load: O(1) - just stores shard OID mappings (~50KB for 256 shards)
   * - Per-query: Loads 1-3 shards on demand (~1-5KB each, cached after first access)
   * - Worst case (all shards loaded): Similar to rebuild memory (~150-200MB for 1M nodes)
   *
   * **Persistence**: Reads from storage. The tree OID can be stored
   * in a ref (e.g., 'refs/empty-graph/index') for persistence across sessions.
   *
   * @param {string} treeOid - OID of the index tree (from rebuild() or a saved ref)
   * @returns {Promise<BitmapIndexReader>} Configured reader ready for O(1) queries
   * @throws {Error} If treeOid is invalid or tree cannot be read
   * @example
   * // Load from a known tree OID
   * const reader = await rebuildService.load(treeOid);
   * const parents = await reader.getParents(someSha);
   *
   * // Load from a saved ref
   * const savedOid = await storage.readRef('refs/empty-graph/index');
   * const reader = await rebuildService.load(savedOid);
   */
  async load(treeOid) {
    const shardOids = await this.storage.readTreeOids(treeOid);
    const reader = new BitmapIndexReader({ storage: this.storage });
    reader.setup(shardOids);
    return reader;
  }
}
