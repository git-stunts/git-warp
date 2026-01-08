import BitmapIndexService from './BitmapIndexService.js';

/**
 * Service to rebuild the graph index.
 */
export default class CacheRebuildService {
  constructor({ persistence, graphService }) {
    this.persistence = persistence;
    this.graphService = graphService;
  }

  async rebuild(ref) {
    const state = BitmapIndexService.createRebuildState();
    
    for await (const node of this.graphService.iterateNodes({ ref, limit: 1000000 })) {
      BitmapIndexService._getOrCreateId(node.sha, state);
      for (const parentSha of node.parents) {
        BitmapIndexService.addEdge(parentSha, node.sha, state);
      }
    }

    const treeStructure = BitmapIndexService.serialize(state);
    const flatEntries = [];
    for (const [path, buffer] of Object.entries(treeStructure)) {
      const oid = await this.persistence.writeBlob(buffer);
      flatEntries.push(`100644 blob ${oid}	${path}`);
    }

    return await this.persistence.writeTree(flatEntries);
  }

  async load(treeOid) {
    const shardOids = await this.persistence.readTreeOids(treeOid);
    const index = new BitmapIndexService({ persistence: this.persistence });
    index.setup(shardOids);
    return index;
  }
}
