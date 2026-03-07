import { defineStore } from 'pinia';
import { ref, reactive } from 'vue';
import {
  WarpGraph,
  InMemoryGraphAdapter,
  WebCryptoAdapter,
  generateWriterId,
} from '@git-stunts/git-warp/browser';
import { sha1sync } from '@git-stunts/git-warp/sha1sync';
import InProcessSyncBus from '../sync/InProcessSyncBus.js';

const VIEWPORT_COLORS = ['#ff7b72', '#79c0ff', '#7ee787', '#d2a8ff'];
const VIEWPORT_LABELS = ['Alpha', 'Beta', 'Gamma', 'Delta'];

/**
 * @typedef {Object} ViewportState
 * @property {string} id
 * @property {string} label
 * @property {string} writerId
 * @property {string} color
 * @property {boolean} online
 * @property {string|null} selectedNode
 * @property {number} ceiling
 * @property {number} maxCeiling
 * @property {Array<{id: string, color: string, x: number, y: number}>} nodes
 * @property {Array<{source: string, target: string, label: string}>} edges
 * @property {import('@git-stunts/git-warp/browser').WarpGraph|null} graph
 */

export const useGraphStore = defineStore('graph', () => {
  const viewportIds = ref(['v0', 'v1', 'v2', 'v3']);

  /** @type {Record<string, ViewportState>} */
  const viewports = reactive({});
  const syncBus = new InProcessSyncBus();

  // All viewports share one persistence layer (simulating a shared Git repo)
  const sharedPersistence = new InMemoryGraphAdapter({ hash: sha1sync });
  const sharedCrypto = new WebCryptoAdapter();

  let _initialized = false;

  async function init() {
    if (_initialized) { return; }
    _initialized = true;

    for (let i = 0; i < 4; i++) {
      const id = `v${i}`;
      const writerId = generateWriterId();
      const graph = await WarpGraph.open({
        persistence: sharedPersistence,
        graphName: 'browsa',
        writerId,
        crypto: sharedCrypto,
      });

      viewports[id] = {
        id,
        label: VIEWPORT_LABELS[i],
        writerId,
        color: VIEWPORT_COLORS[i],
        online: true,
        selectedNode: null,
        ceiling: Infinity,
        maxCeiling: 0,
        nodes: [],
        edges: [],
        graph,
      };

      syncBus.register(id, graph);
    }
  }

  /**
   * Add a colored node from a specific viewport.
   * @param {string} viewportId
   * @param {string} [nodeColor]
   */
  async function addNode(viewportId, nodeColor) {
    const vp = viewports[viewportId];
    if (!vp?.graph) { return; }

    const nodeId = `node:${vp.writerId.slice(0, 8)}-${Date.now().toString(36)}`;
    const color = nodeColor || vp.color;

    const patch = await vp.graph.createPatch();
    patch.addNode(nodeId);
    patch.setProperty(nodeId, 'color', color);
    patch.setProperty(nodeId, 'label', nodeId.split(':')[1].slice(0, 6));
    await patch.commit();

    await materializeViewport(viewportId);
  }

  /**
   * Add an edge between two nodes from a specific viewport.
   * @param {string} viewportId
   * @param {string} from
   * @param {string} to
   * @param {string} [label]
   */
  async function addEdge(viewportId, from, to, label) {
    const vp = viewports[viewportId];
    if (!vp?.graph) { return; }

    const patch = await vp.graph.createPatch();
    patch.addEdge(from, to, label || 'link');
    await patch.commit();

    await materializeViewport(viewportId);
  }

  /**
   * Remove a node from a specific viewport.
   * @param {string} viewportId
   * @param {string} nodeId
   */
  async function removeNode(viewportId, nodeId) {
    const vp = viewports[viewportId];
    if (!vp?.graph) { return; }

    const patch = await vp.graph.createPatch();
    patch.removeNode(nodeId);
    await patch.commit();

    if (vp.selectedNode === nodeId) {
      vp.selectedNode = null;
    }
    await materializeViewport(viewportId);
  }

  /**
   * Materialize the graph for a viewport and extract renderable state.
   * @param {string} viewportId
   */
  async function materializeViewport(viewportId) {
    const vp = viewports[viewportId];
    if (!vp?.graph) { return; }

    const opts = vp.ceiling === Infinity ? {} : { ceiling: vp.ceiling };
    const state = await vp.graph.materialize(opts);

    // Extract alive nodes
    const nodes = [];
    for (const nodeId of state.nodeAlive.entries.keys()) {
      const propKey = `${nodeId}\0color`;
      const colorReg = state.prop.get(propKey);
      const color = colorReg?.value || '#8b949e';

      const labelKey = `${nodeId}\0label`;
      const labelReg = state.prop.get(labelKey);
      const label = labelReg?.value || nodeId.split(':')[1]?.slice(0, 6) || nodeId;

      nodes.push({
        id: nodeId,
        color,
        label,
        x: 0,
        y: 0,
      });
    }

    // Extract alive edges
    const edges = [];
    for (const edgeKey of state.edgeAlive.entries.keys()) {
      const parts = edgeKey.split('\0');
      if (parts.length >= 3) {
        edges.push({ source: parts[0], target: parts[1], label: parts[2] });
      }
    }

    // Update max ceiling from version vector
    let maxTs = 0;
    if (state.observedFrontier) {
      for (const ts of state.observedFrontier.values()) {
        if (ts > maxTs) { maxTs = ts; }
      }
    }

    vp.nodes = nodes;
    vp.edges = edges;
    vp.maxCeiling = maxTs;
  }

  /**
   * Set the time-travel ceiling for a viewport.
   * @param {string} viewportId
   * @param {number} ceiling
   */
  async function setCeiling(viewportId, ceiling) {
    const vp = viewports[viewportId];
    if (!vp) { return; }
    vp.ceiling = ceiling;
    await materializeViewport(viewportId);
  }

  /**
   * Toggle a viewport's online status.
   * @param {string} viewportId
   */
  function toggleOnline(viewportId) {
    const vp = viewports[viewportId];
    if (vp) { vp.online = !vp.online; }
  }

  /**
   * Sync a specific viewport pair.
   * @param {string} sourceId
   * @param {string} targetId
   */
  async function syncPair(sourceId, targetId) {
    await syncBus.sync(sourceId, targetId);
    await materializeViewport(sourceId);
    await materializeViewport(targetId);
  }

  /**
   * Sync all viewports.
   */
  async function syncAll() {
    await syncBus.syncAll();
    for (const id of viewportIds.value) {
      await materializeViewport(id);
    }
  }

  /**
   * Select a node in a viewport (for Da Cone / provenance).
   * @param {string} viewportId
   * @param {string|null} nodeId
   */
  function selectNode(viewportId, nodeId) {
    const vp = viewports[viewportId];
    if (vp) { vp.selectedNode = nodeId; }
  }

  return {
    viewportIds,
    viewports,
    init,
    addNode,
    addEdge,
    removeNode,
    materializeViewport,
    setCeiling,
    toggleOnline,
    syncPair,
    syncAll,
    selectNode,
  };
});
