<script setup>
import { ref, watch, onMounted } from 'vue';
import { toElkGraph } from '../../../../src/visualization/layouts/elkAdapter.js';
import { runLayout } from '../../../../src/visualization/layouts/elkLayout.js';

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  edges: { type: Array, default: () => [] },
  selectedNode: { type: String, default: null },
});

const emit = defineEmits(['select']);

// PositionedGraph from ELK
const posNodes = ref([]);
const posEdges = ref([]);
const graphWidth = ref(300);
const graphHeight = ref(200);
const PADDING = 20;

const ELK_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.spacing.nodeNode': '20',
  'elk.layered.spacing.nodeNodeBetweenLayers': '30',
  'elk.edgeRouting': 'ORTHOGONAL',
};

async function layout() {
  if (props.nodes.length === 0) {
    posNodes.value = [];
    posEdges.value = [];
    return;
  }

  // Convert to ELK adapter format
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

  posNodes.value = positioned.nodes.map((pn) => {
    const original = props.nodes.find((n) => n.id === pn.id);
    return {
      ...pn,
      color: original?.color || '#8b949e',
      originalId: pn.id,
    };
  });
  posEdges.value = positioned.edges;
  graphWidth.value = Math.max(positioned.width + PADDING * 2, 100);
  graphHeight.value = Math.max(positioned.height + PADDING * 2, 80);
}

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

function handleClick(nodeId) {
  emit('select', props.selectedNode === nodeId ? null : nodeId);
}

function handleBgClick() {
  emit('select', null);
}

watch(
  () => [props.nodes, props.edges],
  () => layout(),
  { deep: true },
);

onMounted(() => layout());
</script>

<template>
  <svg
    :viewBox="`0 0 ${graphWidth} ${graphHeight}`"
    class="graph-svg"
    @click.self="handleBgClick"
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

    <!-- Edges -->
    <g :transform="`translate(0, 0)`">
      <template v-for="edge in posEdges" :key="edge.id">
        <polyline
          v-if="edgePointsStr(edge)"
          :points="edgePointsStr(edge)"
          fill="none"
          stroke="#30363d"
          stroke-width="1.5"
          marker-end="url(#arrowhead)"
        />
      </template>
    </g>

    <!-- Nodes -->
    <g
      v-for="node in posNodes"
      :key="node.originalId"
      class="node-group"
      :class="{ selected: node.originalId === selectedNode }"
      :transform="`translate(${node.x + PADDING}, ${node.y + PADDING})`"
      @click.stop="handleClick(node.originalId)"
    >
      <rect
        :width="node.width"
        :height="node.height"
        rx="6"
        :fill="node.originalId === selectedNode ? '#21262d' : '#161b22'"
        :stroke="node.color"
        stroke-width="2"
        :filter="node.originalId === selectedNode ? 'url(#glow)' : undefined"
        class="node-rect"
      />
      <circle
        :cx="12"
        :cy="node.height / 2"
        r="5"
        :fill="node.color"
      />
      <text
        :x="node.width / 2 + 6"
        :y="node.height / 2"
        text-anchor="middle"
        dominant-baseline="central"
        fill="#c9d1d9"
        font-family="monospace"
        font-size="11"
      >
        {{ node.label }}
      </text>
    </g>

    <!-- Empty state -->
    <text
      v-if="posNodes.length === 0"
      :x="graphWidth / 2"
      :y="graphHeight / 2"
      text-anchor="middle"
      dominant-baseline="central"
      fill="#484f58"
      font-family="monospace"
      font-size="12"
    >
      + Node to start
    </text>
  </svg>
</template>

<style scoped>
.graph-svg {
  width: 100%;
  height: 100%;
  background: #0d1117;
  cursor: default;
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
