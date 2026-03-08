import { defineStore } from 'pinia';
import { ref } from 'vue';
import WarpSocket from '../net/WarpSocket.js';

const STORAGE_KEY_SERVER = 'browsa:serverUrl';
const STORAGE_KEY_WRITER = 'browsa:writerId';
const DEFAULT_SERVER_URL = 'ws://localhost:3000';

export const useGraphStore = defineStore('graph', () => {
  // ── Connection state ──────────────────────────────────────────────
  const connectionStatus = ref('disconnected');
  const serverUrl = ref(DEFAULT_SERVER_URL);
  const availableGraphs = ref([]);
  const activeGraph = ref(null);
  const writerId = ref(null);
  const error = ref(null);

  // ── Graph state (single viewport) ────────────────────────────────
  const nodes = ref([]);
  const edges = ref([]);
  const selectedNode = ref(null);
  const inspectedProps = ref(null);
  const ceiling = ref(Infinity);
  const maxCeiling = ref(0);

  // ── Non-reactive ─────────────────────────────────────────────────
  /** @type {WarpSocket|null} */
  let socket = null;
  let _initialized = false;

  // ── init() ────────────────────────────────────────────────────────

  async function init() {
    if (_initialized) { return; }
    _initialized = true;

    // Read server URL from ?server= query param, localStorage, or default
    const params = new URLSearchParams(globalThis.location?.search || '');
    const urlParam = params.get('server');
    if (urlParam) {
      serverUrl.value = urlParam;
    } else {
      const stored = globalThis.localStorage?.getItem(STORAGE_KEY_SERVER);
      if (stored) {
        serverUrl.value = stored;
      }
    }

    // Generate or load writerId
    const storedWriter = globalThis.localStorage?.getItem(STORAGE_KEY_WRITER);
    if (storedWriter) {
      writerId.value = storedWriter;
    } else {
      writerId.value = globalThis.crypto.randomUUID();
      globalThis.localStorage?.setItem(STORAGE_KEY_WRITER, writerId.value);
    }

    // Persist server URL
    globalThis.localStorage?.setItem(STORAGE_KEY_SERVER, serverUrl.value);

    await connect();
  }

  // ── connect() ─────────────────────────────────────────────────────

  async function connect() {
    error.value = null;
    connectionStatus.value = 'connecting';

    try {
      socket = new WarpSocket(serverUrl.value);
      socket.onDiff(handleDiff);
      socket.onDisconnect(handleDisconnect);

      const hello = await socket.connect();
      connectionStatus.value = 'connected';
      availableGraphs.value = hello.graphs;

      // Auto-open if only 1 graph available
      if (hello.graphs.length === 1) {
        await openGraph(hello.graphs[0]);
      }
    } catch (err) {
      connectionStatus.value = 'disconnected';
      error.value = err instanceof Error ? err.message : 'Connection failed';
      socket = null;
    }
  }

  // ── openGraph(name) ───────────────────────────────────────────────

  async function openGraph(name) {
    if (!socket) { return; }

    activeGraph.value = name;
    selectedNode.value = null;
    inspectedProps.value = null;
    error.value = null;

    try {
      const state = await socket.open({ graph: name, writerId: writerId.value });
      applyFullState(state);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to open graph';
    }
  }

  // ── Mutations ─────────────────────────────────────────────────────

  async function addNode(nodeColor) {
    if (!socket || !activeGraph.value) { return; }

    const nodeId = `node:${writerId.value.slice(0, 8)}-${Date.now().toString(36)}`;
    const color = nodeColor || '#8b949e';

    try {
      await socket.mutate({
        graph: activeGraph.value,
        ops: [
          { op: 'addNode', args: [nodeId] },
          { op: 'setProperty', args: [nodeId, 'color', color] },
          { op: 'setProperty', args: [nodeId, 'label', nodeId.split(':')[1].slice(0, 6)] },
        ],
      });
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Mutation failed';
    }
  }

  async function removeNode(nodeId) {
    if (!socket || !activeGraph.value) { return; }

    if (selectedNode.value === nodeId) {
      selectedNode.value = null;
      inspectedProps.value = null;
    }

    try {
      await socket.mutate({
        graph: activeGraph.value,
        ops: [{ op: 'removeNode', args: [nodeId] }],
      });
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Mutation failed';
    }
  }

  async function addEdge(from, to, label) {
    if (!socket || !activeGraph.value) { return; }

    try {
      await socket.mutate({
        graph: activeGraph.value,
        ops: [{ op: 'addEdge', args: [from, to, label || 'link'] }],
      });
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Mutation failed';
    }
  }

  // ── handleDiff ────────────────────────────────────────────────────

  function handleDiff(payload) {
    if (payload.graph !== activeGraph.value) { return; }
    if (ceiling.value !== Infinity) { return; } // time-travelling — ignore live diffs

    const diff = payload.diff;

    // Remove nodes
    if (diff.nodes.removed.length > 0) {
      const removed = new Set(diff.nodes.removed);
      nodes.value = nodes.value.filter((n) => !removed.has(n.id));
      if (removed.has(selectedNode.value)) {
        selectedNode.value = null;
        inspectedProps.value = null;
      }
    }

    // Add nodes — extract color/label from diff.props.set
    for (const id of diff.nodes.added) {
      const color = findDiffProp(diff.props.set, id, 'color') || '#8b949e';
      const label = findDiffProp(diff.props.set, id, 'label') || id.split(':')[1]?.slice(0, 6) || id;
      nodes.value.push({ id, color, label, x: 0, y: 0 });
    }

    // Update props on existing nodes
    for (const entry of diff.props.set) {
      if (entry.propKey === 'color' || entry.propKey === 'label') {
        const node = nodes.value.find((n) => n.id === entry.nodeId);
        if (node) {
          node[entry.propKey] = entry.newValue;
        }
      }
    }

    // Remove edges
    if (diff.edges.removed.length > 0) {
      const removedSet = new Set(diff.edges.removed.map(
        (e) => `${e.from}\0${e.to}\0${e.label}`,
      ));
      edges.value = edges.value.filter(
        (e) => !removedSet.has(`${e.source}\0${e.target}\0${e.label}`),
      );
    }

    // Add edges
    for (const e of diff.edges.added) {
      edges.value.push({ source: e.from, target: e.to, label: e.label });
    }
  }

  // ── seek / time travel ────────────────────────────────────────────

  async function setCeiling(value) {
    if (!socket || !activeGraph.value) { return; }

    ceiling.value = value;

    try {
      const opts = { graph: activeGraph.value };
      if (value !== Infinity) {
        opts.ceiling = value;
      }
      const state = await socket.seek(opts);
      applyFullState(state);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Seek failed';
    }
  }

  // ── inspect ───────────────────────────────────────────────────────

  async function selectNode(nodeId) {
    selectedNode.value = nodeId;

    if (!nodeId) {
      inspectedProps.value = null;
      return;
    }

    if (!socket || !activeGraph.value) { return; }

    try {
      const result = await socket.inspect({ graph: activeGraph.value, nodeId });
      inspectedProps.value = result.props;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Inspect failed';
    }
  }

  // ── disconnect ────────────────────────────────────────────────────

  function handleDisconnect() {
    connectionStatus.value = 'disconnected';
    error.value = 'Connection lost';
  }

  async function reconnect(url) {
    if (socket) {
      socket.close();
      socket = null;
    }

    if (url) {
      serverUrl.value = url;
      globalThis.localStorage?.setItem(STORAGE_KEY_SERVER, url);
    }

    // Reset state
    activeGraph.value = null;
    availableGraphs.value = [];
    nodes.value = [];
    edges.value = [];
    selectedNode.value = null;
    inspectedProps.value = null;
    ceiling.value = Infinity;
    maxCeiling.value = 0;

    await connect();
  }

  // ── helpers ───────────────────────────────────────────────────────

  function applyFullState(state) {
    nodes.value = state.nodes.map((n) => ({
      id: n.id,
      color: n.props.color || '#8b949e',
      label: n.props.label || n.id.split(':')[1]?.slice(0, 6) || n.id,
      x: 0,
      y: 0,
    }));

    edges.value = state.edges.map((e) => ({
      source: e.from,
      target: e.to,
      label: e.label,
    }));

    const frontierValues = Object.values(state.frontier || {});
    maxCeiling.value = frontierValues.length > 0
      ? Math.max(...frontierValues, 0)
      : 0;
  }

  function findDiffProp(propsSet, nodeId, propKey) {
    for (const entry of propsSet) {
      if (entry.nodeId === nodeId && entry.propKey === propKey) {
        return entry.newValue;
      }
    }
    return null;
  }

  return {
    // Connection
    connectionStatus,
    serverUrl,
    availableGraphs,
    activeGraph,
    writerId,
    error,
    // Graph state
    nodes,
    edges,
    selectedNode,
    inspectedProps,
    ceiling,
    maxCeiling,
    // Actions
    init,
    openGraph,
    addNode,
    removeNode,
    addEdge,
    setCeiling,
    selectNode,
    reconnect,
  };
});
