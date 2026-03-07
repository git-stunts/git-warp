<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { toElkGraph } from '../../../../src/visualization/layouts/elkAdapter.js';
import { runLayout } from '../../../../src/visualization/layouts/elkLayout.js';

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  edges: { type: Array, default: () => [] },
  selectedNode: { type: String, default: null },
});

const emit = defineEmits(['select']);

// ── Full ELK layout (all nodes, computed once) ─────────────────────
const allNodes = ref([]);
const allEdges = ref([]);
const fullWidth = ref(300);
const fullHeight = ref(200);
const PADDING = 20;

// ── Camera ─────────────────────────────────────────────────────────
const svgRef = ref(null);
const containerW = ref(300);
const containerH = ref(200);
const camX = ref(0);
const camY = ref(0);
const zoom = ref(1);

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;
const CULL_MARGIN = 60;

let resizeObs = null;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let camStartX = 0;
let camStartY = 0;

// ── Viewport rect in graph-space ───────────────────────────────────
const viewBox = computed(() => {
  const vw = containerW.value / zoom.value;
  const vh = containerH.value / zoom.value;
  return { x: camX.value, y: camY.value, w: vw, h: vh };
});

function rectIntersects(ax, ay, aw, ah) {
  const vb = viewBox.value;
  const mx = CULL_MARGIN / zoom.value;
  return (
    ax + aw >= vb.x - mx &&
    ay + ah >= vb.y - mx &&
    ax <= vb.x + vb.w + mx &&
    ay <= vb.y + vb.h + mx
  );
}

// ── Visibility pass ────────────────────────────────────────────────
const visibleNodes = computed(() =>
  allNodes.value.filter((n) =>
    rectIntersects(n.x + PADDING, n.y + PADDING, n.width, n.height),
  ),
);

const visibleNodeIds = computed(() =>
  new Set(visibleNodes.value.map((n) => n.originalId)),
);

const visibleEdges = computed(() =>
  allEdges.value.filter((e) => {
    if (visibleNodeIds.value.has(e.source) || visibleNodeIds.value.has(e.target)) {
      return true;
    }
    for (const s of e.sections || []) {
      for (const pt of [s.startPoint, s.endPoint, ...(s.bendPoints || [])]) {
        if (pt && rectIntersects(pt.x + PADDING, pt.y + PADDING, 0, 0)) {
          return true;
        }
      }
    }
    return false;
  }),
);

// ── Object pools (never shrink, only grow) ─────────────────────────
// Pool high-water marks: once allocated, slots persist for the life
// of the component. Vue keys by slot index, so DOM elements are
// reused — never created or destroyed during pan/zoom.
let nodePoolHWM = 0;
let edgePoolHWM = 0;

const EMPTY_NODE = Object.freeze({
  active: false, originalId: '', x: -9999, y: -9999,
  width: 0, height: 0, color: 'transparent', label: '',
});
const EMPTY_EDGE = Object.freeze({
  active: false, id: '', points: '',
});

const nodePool = computed(() => {
  const vis = visibleNodes.value;
  // Grow pool if needed (never shrink)
  nodePoolHWM = Math.max(nodePoolHWM, vis.length);
  const slots = new Array(nodePoolHWM);
  for (let i = 0; i < nodePoolHWM; i++) {
    if (i < vis.length) {
      slots[i] = { ...vis[i], active: true };
    } else {
      slots[i] = EMPTY_NODE;
    }
  }
  return slots;
});

const edgePool = computed(() => {
  const vis = visibleEdges.value;
  edgePoolHWM = Math.max(edgePoolHWM, vis.length);
  const slots = new Array(edgePoolHWM);
  for (let i = 0; i < edgePoolHWM; i++) {
    if (i < vis.length) {
      slots[i] = { active: true, id: vis[i].id, points: edgePointsStr(vis[i]) };
    } else {
      slots[i] = EMPTY_EDGE;
    }
  }
  return slots;
});

const cullStats = computed(() =>
  `${visibleNodes.value.length}/${allNodes.value.length}`,
);

// ── ELK layout ─────────────────────────────────────────────────────
const ELK_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.spacing.nodeNode': '20',
  'elk.layered.spacing.nodeNodeBetweenLayers': '30',
  'elk.edgeRouting': 'ORTHOGONAL',
};

async function layout() {
  if (props.nodes.length === 0) {
    allNodes.value = [];
    allEdges.value = [];
    fullWidth.value = 100;
    fullHeight.value = 80;
    return;
  }

  const graphData = {
    nodes: props.nodes.map((n) => ({
      id: n.id,
      label: n.label || n.id.split(':')[1]?.slice(0, 8) || n.id,
      props: { color: n.color },
    })),
    edges: props.edges.map((e) => ({
      from: e.source,
      to: e.target,
      label: e.label,
    })),
  };

  const elkGraph = toElkGraph(graphData, { layoutOptions: ELK_OPTIONS });
  const positioned = await runLayout(elkGraph);

  allNodes.value = positioned.nodes.map((pn) => {
    const original = props.nodes.find((n) => n.id === pn.id);
    return { ...pn, color: original?.color || '#8b949e', originalId: pn.id };
  });
  allEdges.value = positioned.edges;
  fullWidth.value = Math.max(positioned.width + PADDING * 2, 100);
  fullHeight.value = Math.max(positioned.height + PADDING * 2, 80);

  fitToView();
}

function fitToView() {
  const fw = fullWidth.value;
  const fh = fullHeight.value;
  const cw = containerW.value || 300;
  const ch = containerH.value || 200;
  zoom.value = Math.min(cw / fw, ch / fh, MAX_ZOOM);
  zoom.value = Math.max(zoom.value, MIN_ZOOM);
  const vw = cw / zoom.value;
  const vh = ch / zoom.value;
  camX.value = (fw - vw) / 2;
  camY.value = (fh - vh) / 2;
}

// ── Edge rendering ─────────────────────────────────────────────────
function sectionToPoints(section) {
  const pts = [];
  if (section.startPoint) { pts.push(section.startPoint); }
  if (section.bendPoints) { pts.push(...section.bendPoints); }
  if (section.endPoint) { pts.push(section.endPoint); }
  return pts;
}

function edgePointsStr(edge) {
  const allPts = [];
  for (const s of (edge.sections || [])) {
    allPts.push(...sectionToPoints(s));
  }
  return allPts.map((p) => `${p.x + PADDING},${p.y + PADDING}`).join(' ');
}

// ── Interaction ────────────────────────────────────────────────────
function handleClick(nodeId) {
  emit('select', props.selectedNode === nodeId ? null : nodeId);
}

function handleBgClick() {
  emit('select', null);
}

function onWheel(e) {
  e.preventDefault();
  const rect = svgRef.value.getBoundingClientRect();
  const mx = camX.value + ((e.clientX - rect.left) / zoom.value);
  const my = camY.value + ((e.clientY - rect.top) / zoom.value);

  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom.value * factor));

  camX.value = mx - (e.clientX - rect.left) / newZoom;
  camY.value = my - (e.clientY - rect.top) / newZoom;
  zoom.value = newZoom;
}

const PAN_THRESHOLD = 4; // px movement before it counts as a pan
let didPan = false;
let activePointerId = -1;

function onPointerDown(e) {
  if (e.button !== 0) { return; }
  isPanning = true;
  didPan = false;
  activePointerId = e.pointerId;
  panStartX = e.clientX;
  panStartY = e.clientY;
  camStartX = camX.value;
  camStartY = camY.value;
  // Do NOT setPointerCapture here — it steals click events from child nodes.
  // Capture is deferred until the pan threshold is exceeded.
}

function onPointerMove(e) {
  if (!isPanning || e.pointerId !== activePointerId) { return; }
  const rawDx = e.clientX - panStartX;
  const rawDy = e.clientY - panStartY;
  // Only start panning after exceeding the threshold (allows click-through)
  if (!didPan && (rawDx * rawDx + rawDy * rawDy) < PAN_THRESHOLD * PAN_THRESHOLD) {
    return;
  }
  if (!didPan) {
    didPan = true;
    // Now that we know it's a real drag, capture the pointer so the pan
    // continues even if the cursor leaves the SVG.
    svgRef.value?.setPointerCapture(e.pointerId);
  }
  const dx = (e.clientX - panStartX) / zoom.value;
  const dy = (e.clientY - panStartY) / zoom.value;
  camX.value = camStartX - dx;
  camY.value = camStartY - dy;
}

function onPointerUp(e) {
  if (!isPanning || e.pointerId !== activePointerId) { return; }
  const wasPan = didPan;
  isPanning = false;
  didPan = false;
  activePointerId = -1;
  if (wasPan) {
    svgRef.value?.releasePointerCapture(e.pointerId);
    // Suppress the synthesized click that follows a pointer-captured drag
    svgRef.value?.addEventListener('click', suppressClick, { once: true, capture: true });
  }
}

function suppressClick(e) {
  e.stopPropagation();
  e.preventDefault();
}

// ── Lifecycle ──────────────────────────────────────────────────────
watch(
  () => [props.nodes, props.edges],
  () => layout(),
  { deep: true },
);

onMounted(() => {
  if (svgRef.value) {
    const rect = svgRef.value.getBoundingClientRect();
    containerW.value = rect.width;
    containerH.value = rect.height;

    resizeObs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerW.value = entry.contentRect.width;
        containerH.value = entry.contentRect.height;
      }
    });
    resizeObs.observe(svgRef.value);
  }
  layout();
});

onUnmounted(() => {
  resizeObs?.disconnect();
});
</script>

<template>
  <svg
    ref="svgRef"
    :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`"
    class="graph-svg"
    @click.self="handleBgClick"
    @wheel="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
  >
    <defs>
      <marker
        id="arrowhead"
        markerWidth="8"
        markerHeight="6"
        refX="8"
        refY="3"
        orient="auto"
      >
        <polygon points="0 0, 8 3, 0 6" fill="#484f58" />
      </marker>
      <filter id="glow">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    <!-- Edge pool: fixed slot count, keyed by index -->
    <polyline
      v-for="(slot, idx) in edgePool"
      :key="`e${idx}`"
      v-show="slot.active"
      :points="slot.points"
      fill="none"
      stroke="#30363d"
      stroke-width="1.5"
      marker-end="url(#arrowhead)"
    />

    <!-- Node pool: fixed slot count, keyed by index -->
    <g
      v-for="(slot, idx) in nodePool"
      :key="`n${idx}`"
      v-show="slot.active"
      class="node-group"
      :class="{ selected: slot.active && slot.originalId === selectedNode }"
      :transform="`translate(${slot.x + PADDING}, ${slot.y + PADDING})`"
      @click.stop="slot.active && handleClick(slot.originalId)"
    >
      <rect
        :width="slot.width"
        :height="slot.height"
        rx="6"
        :fill="slot.originalId === selectedNode ? '#21262d' : '#161b22'"
        :stroke="slot.color"
        stroke-width="2"
        :filter="slot.originalId === selectedNode ? 'url(#glow)' : undefined"
        class="node-rect"
      />
      <circle :cx="12" :cy="slot.height / 2" r="5" :fill="slot.color" />
      <text
        :x="slot.width / 2 + 6"
        :y="slot.height / 2"
        text-anchor="middle"
        dominant-baseline="central"
        fill="#c9d1d9"
        font-family="monospace"
        font-size="11"
      >
        {{ slot.label }}
      </text>
    </g>

    <!-- Empty state -->
    <text
      v-if="allNodes.length === 0"
      :x="viewBox.x + viewBox.w / 2"
      :y="viewBox.y + viewBox.h / 2"
      text-anchor="middle"
      dominant-baseline="central"
      fill="#484f58"
      font-family="monospace"
      font-size="12"
    >
      + Node to start
    </text>

    <!-- HUD -->
    <text
      v-if="allNodes.length > 0"
      :x="viewBox.x + viewBox.w - 4"
      :y="viewBox.y + 12 / zoom"
      text-anchor="end"
      fill="#484f58"
      font-family="monospace"
      :font-size="10 / zoom"
    >
      {{ cullStats }}
    </text>
  </svg>
</template>

<style scoped>
.graph-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: #0d1117;
  cursor: grab;
  touch-action: none;
}
.graph-svg:active {
  cursor: grabbing;
}
.node-group {
  cursor: pointer;
}
.node-group:hover .node-rect {
  stroke-width: 3;
}
.node-group.selected .node-rect {
  stroke-width: 3;
}
</style>
