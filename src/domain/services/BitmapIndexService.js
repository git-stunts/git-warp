import roaring from 'roaring';
const { RoaringBitmap32 } = roaring;

/**
 * High-performance sharded index with Lazy Loading.
 */
export default class BitmapIndexService {
  constructor({ persistence } = {}) {
    this.persistence = persistence;
    this.shardOids = new Map(); // path -> OID
    this.loadedShards = new Map(); // path -> Data
  }

  async lookupId(sha) {
    const prefix = sha.substring(0, 2);
    const path = `meta_${prefix}.json`;
    const idMap = await this._getOrLoadShard(path, 'json');
    return idMap[sha];
  }

  async _getOrLoadShard(path, format) {
    if (this.loadedShards.has(path)) return this.loadedShards.get(path);
    const oid = this.shardOids.get(path);
    if (!oid) return format === 'json' ? {} : new RoaringBitmap32();

    const buffer = await this.persistence.readBlob(oid);
    const data = format === 'json' 
        ? JSON.parse(new TextDecoder().decode(buffer))
        : RoaringBitmap32.deserialize(buffer, true);

    this.loadedShards.set(path, data);
    return data;
  }

  setup(shardOids) {
    this.shardOids = new Map(Object.entries(shardOids));
  }

  /**
   * REBUILD LOGIC (In-memory)
   */
  static createRebuildState() {
    return {
      shaToId: new Map(),
      idToSha: [],
      bitmaps: new Map() // key -> RoaringBitmap32
    };
  }

  static addEdge(srcSha, tgtSha, state) {
    const srcId = BitmapIndexService._getOrCreateId(srcSha, state);
    const tgtId = BitmapIndexService._getOrCreateId(tgtSha, state);
    BitmapIndexService._addToBitmap(srcSha, tgtId, 'fwd', state);
    BitmapIndexService._addToBitmap(tgtSha, srcId, 'rev', state);
  }

  static _getOrCreateId(sha, state) {
    if (state.shaToId.has(sha)) return state.shaToId.get(sha);
    const id = state.idToSha.length;
    state.idToSha.push(sha);
    state.shaToId.set(sha, id);
    return id;
  }

  static _addToBitmap(keySha, valueId, type, state) {
    const prefix = keySha.substring(0, 2);
    const key = `${type}_${prefix}`;
    if (!state.bitmaps.has(key)) state.bitmaps.set(key, new RoaringBitmap32());
    state.bitmaps.get(key).add(valueId);
  }

  static serialize(state) {
    const tree = {};
    const idShards = {};
    for (const [sha, id] of state.shaToId) {
      const prefix = sha.substring(0, 2);
      if (!idShards[prefix]) idShards[prefix] = {};
      idShards[prefix][sha] = id;
    }
    for (const [prefix, map] of Object.entries(idShards)) {
      tree[`meta_${prefix}.json`] = Buffer.from(JSON.stringify(map));
    }
    for (const [key, bitmap] of state.bitmaps) {
      tree[`shards_${key}.bitmap`] = bitmap.serialize(true);
    }
    return tree;
  }
}