import { defineStore } from 'pinia';
import { ref, reactive, markRaw } from 'vue';
import {
  WarpGraph,
  InMemoryGraphAdapter,
  WebCryptoAdapter,
  generateWriterId,
} from '@git-stunts/git-warp/browser';
import { sha1sync } from '@git-stunts/git-warp/sha1sync';
import InsecureCryptoAdapter from '../sync/InsecureCryptoAdapter.js';
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

/**
 * @typedef {Object} Scenario
 * @property {string} name
 * @property {string} description
 * @property {Array<{action: string, args: unknown[], delay?: number}>} steps
 */

/** @type {Scenario[]} */
const SCENARIOS = [
  {
    name: 'Two Writers, One Graph',
    description: 'Alpha and Beta each add nodes, then sync to see each other\'s work.',
    steps: [
      { action: 'addNode', args: ['v0'], delay: 400 },
      { action: 'addNode', args: ['v0'], delay: 400 },
      { action: 'addNode', args: ['v1'], delay: 400 },
      { action: 'addNode', args: ['v1'], delay: 400 },
      { action: 'syncAll', args: [], delay: 600 },
    ],
  },
  {
    name: 'Offline Divergence',
    description: 'All writers go offline, each adds nodes, then come online and sync — CRDT merge!',
    steps: [
      { action: 'toggleOnline', args: ['v0'], delay: 200 },
      { action: 'toggleOnline', args: ['v1'], delay: 200 },
      { action: 'toggleOnline', args: ['v2'], delay: 200 },
      { action: 'toggleOnline', args: ['v3'], delay: 200 },
      { action: 'addNode', args: ['v0'], delay: 300 },
      { action: 'addNode', args: ['v0'], delay: 300 },
      { action: 'addNode', args: ['v1'], delay: 300 },
      { action: 'addNode', args: ['v1'], delay: 300 },
      { action: 'addNode', args: ['v2'], delay: 300 },
      { action: 'addNode', args: ['v3'], delay: 300 },
      { action: 'addNode', args: ['v3'], delay: 300 },
      { action: 'toggleOnline', args: ['v0'], delay: 400 },
      { action: 'toggleOnline', args: ['v1'], delay: 400 },
      { action: 'toggleOnline', args: ['v2'], delay: 400 },
      { action: 'toggleOnline', args: ['v3'], delay: 400 },
      { action: 'syncAll', args: [], delay: 600 },
    ],
  },
  {
    name: 'Add & Remove',
    description: 'Alpha adds three nodes, removes the middle one, syncs to Beta.',
    steps: [
      { action: 'addNode', args: ['v0'], delay: 400 },
      { action: 'addNode', args: ['v0'], delay: 400 },
      { action: 'addNode', args: ['v0'], delay: 400 },
      { action: 'removeLatestNode', args: ['v0', 1], delay: 600 },
      { action: 'syncPair', args: ['v0', 'v1'], delay: 600 },
    ],
  },
  {
    name: 'Edge Network',
    description: 'Build a small connected graph across two writers.',
    steps: [
      { action: 'addNode', args: ['v0'], delay: 300 },
      { action: 'addNode', args: ['v0'], delay: 300 },
      { action: 'addNode', args: ['v1'], delay: 300 },
      { action: 'syncAll', args: [], delay: 400 },
      { action: 'addEdgeBetweenLatest', args: ['v0', 0, 1], delay: 400 },
      { action: 'addEdgeBetweenLatest', args: ['v1', 1, 2], delay: 400 },
      { action: 'syncAll', args: [], delay: 600 },
    ],
  },
  {
    name: 'Time Travel',
    description: 'Add nodes over time, then scrub the timeline to watch the graph grow.',
    steps: [
      { action: 'addNode', args: ['v0'], delay: 400 },
      { action: 'addNode', args: ['v0'], delay: 400 },
      { action: 'addNode', args: ['v0'], delay: 400 },
      { action: 'addNode', args: ['v0'], delay: 400 },
      { action: 'addNode', args: ['v0'], delay: 400 },
      { action: 'setCeiling', args: ['v0', 1], delay: 600 },
      { action: 'setCeiling', args: ['v0', 2], delay: 600 },
      { action: 'setCeiling', args: ['v0', 3], delay: 600 },
      { action: 'setCeiling', args: ['v0', 4], delay: 600 },
      { action: 'setCeiling', args: ['v0', 5], delay: 600 },
      { action: 'setCeiling', args: ['v0', Infinity], delay: 400 },
    ],
  },
];

export const useGraphStore = defineStore('graph', () => {
  const viewportIds = ref(['v0', 'v1', 'v2', 'v3']);

  /** @type {Record<string, ViewportState>} */
  const viewports = reactive({});
  const syncBus = new InProcessSyncBus();

  // All viewports share one persistence layer (simulating a shared Git repo)
  const sharedPersistence = new InMemoryGraphAdapter({ hash: sha1sync });
  // Use WebCryptoAdapter when crypto.subtle is available (HTTPS/localhost),
  // fall back to InsecureCryptoAdapter for plain HTTP (e.g. Docker access).
  const sharedCrypto = globalThis.crypto?.subtle
    ? new WebCryptoAdapter()
    : new InsecureCryptoAdapter();

  let _initialized = false;

  async function init() {
    if (_initialized) { return; }
    _initialized = true;

    for (let i = 0; i < 4; i++) {
      const id = `v${i}`;
      const writerId = generateWriterId();
      // markRaw prevents Vue from wrapping the graph in a reactive
      // Proxy. WarpGraph uses ES private fields (#index in ProvenanceIndex,
      // etc.) which break under Proxy — private field access requires
      // `this` to be the real instance, not a Proxy wrapper.
      const graph = markRaw(await WarpGraph.open({
        persistence: sharedPersistence,
        graphName: 'browsa',
        writerId,
        crypto: sharedCrypto,
      }));

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

    // Extract alive nodes — must check tombstones, not just entries.
    // ORSet.entries contains ALL elements (including tombstoned ones);
    // an element is alive only if it has at least one non-tombstoned dot.
    const nodes = [];
    for (const [nodeId, dots] of state.nodeAlive.entries) {
      let alive = false;
      for (const dot of dots) {
        if (!state.nodeAlive.tombstones.has(dot)) { alive = true; break; }
      }
      if (!alive) { continue; }

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

    // Extract alive edges — same tombstone check as nodes.
    const edges = [];
    for (const [edgeKey, dots] of state.edgeAlive.entries) {
      let alive = false;
      for (const dot of dots) {
        if (!state.edgeAlive.tombstones.has(dot)) { alive = true; break; }
      }
      if (!alive) { continue; }

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

  // ── Scenario runner ─────────────────────────────────────────────────

  const scenarios = ref(SCENARIOS);
  const scenarioRunning = ref(false);
  const scenarioStep = ref(-1);
  /** @type {import('vue').Ref<string|null>} */
  const scenarioName = ref(null);
  let _scenarioAbort = new AbortController();

  /** Ordered list of node IDs added during a scenario (for referencing by index). */
  let _scenarioNodes = [];

  /**
   * Remove the nth node added during this scenario from a viewport.
   * @param {string} viewportId
   * @param {number} index
   */
  async function removeLatestNode(viewportId, index) {
    const nodeId = _scenarioNodes[index];
    if (nodeId) {
      await removeNode(viewportId, nodeId);
    }
  }

  /**
   * Add an edge between scenario nodes by index.
   * @param {string} viewportId
   * @param {number} fromIdx
   * @param {number} toIdx
   */
  async function addEdgeBetweenLatest(viewportId, fromIdx, toIdx) {
    const from = _scenarioNodes[fromIdx];
    const to = _scenarioNodes[toIdx];
    if (from && to) {
      await addEdge(viewportId, from, to);
    }
  }

  /** @type {Record<string, Function>} */
  const scenarioActions = {
    addNode: async (/** @type {string} */ vpId, /** @type {string|undefined} */ color) => {
      await addNode(vpId, color);
      // Track the node we just added
      const vp = viewports[vpId];
      if (vp?.nodes.length > 0) {
        const newest = vp.nodes[vp.nodes.length - 1];
        if (!_scenarioNodes.includes(newest.id)) {
          _scenarioNodes.push(newest.id);
        }
      }
    },
    addEdge,
    removeNode,
    removeLatestNode,
    addEdgeBetweenLatest,
    syncPair,
    syncAll,
    toggleOnline,
    setCeiling,
    selectNode,
    materializeViewport,
  };

  /**
   * Run a scenario by index.
   * @param {number} index
   */
  async function runScenario(index) {
    if (scenarioRunning.value) { stopScenario(); }
    const scenario = SCENARIOS[index];
    if (!scenario) { return; }

    _scenarioAbort = new AbortController();
    scenarioRunning.value = true;
    scenarioName.value = scenario.name;
    scenarioStep.value = 0;
    _scenarioNodes = [];

    for (let i = 0; i < scenario.steps.length; i++) {
      if (_scenarioAbort.signal.aborted) { break; }
      scenarioStep.value = i;
      const step = scenario.steps[i];
      const fn = scenarioActions[step.action];
      if (fn) {
        await fn(...step.args);
      }
      if (_scenarioAbort.signal.aborted) { break; }
      const delay = step.delay || 300;
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, delay);
        _scenarioAbort.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve(undefined);
        }, { once: true });
      });
    }

    scenarioRunning.value = false;
    scenarioStep.value = -1;
    scenarioName.value = null;
  }

  function stopScenario() {
    _scenarioAbort.abort();
    scenarioRunning.value = false;
    scenarioStep.value = -1;
    scenarioName.value = null;
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
    // Scenarios
    scenarios,
    scenarioRunning,
    scenarioStep,
    scenarioName,
    runScenario,
    stopScenario,
  };
});
