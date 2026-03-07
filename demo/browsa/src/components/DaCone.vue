<script setup>
import { computed } from 'vue';
import { useGraphStore } from '../stores/graphStore.js';

const props = defineProps({
  viewportId: String,
  nodeId: String,
});

const store = useGraphStore();
const vp = computed(() => store.viewports[props.viewportId]);

const nodeProps = computed(() => {
  if (!vp.value?.graph) { return []; }
  // Extract all properties for this node from materialized state
  const state = vp.value;
  const result = [];
  for (const node of state.nodes) {
    if (node.id === props.nodeId) {
      result.push({ key: 'id', value: node.id });
      result.push({ key: 'color', value: node.color });
      result.push({ key: 'label', value: node.label });
      break;
    }
  }
  return result;
});

const connectedEdges = computed(() => {
  if (!vp.value) { return []; }
  return vp.value.edges.filter(
    (e) => e.source === props.nodeId || e.target === props.nodeId,
  );
});

function close() {
  store.selectNode(props.viewportId, null);
}
</script>

<template>
  <div class="da-cone">
    <div class="cone-header">
      <span class="cone-title">Da Cone</span>
      <span class="cone-node-id">{{ nodeId }}</span>
      <button class="cone-close" @click="close">x</button>
    </div>
    <div class="cone-body">
      <div class="cone-section">
        <div class="section-title">Properties</div>
        <div
          v-for="prop in nodeProps"
          :key="prop.key"
          class="prop-row"
        >
          <span class="prop-key">{{ prop.key }}</span>
          <span
            class="prop-value"
            :style="prop.key === 'color' ? { color: String(prop.value) } : {}"
          >
            {{ prop.value }}
          </span>
        </div>
        <div v-if="nodeProps.length === 0" class="empty">No properties</div>
      </div>
      <div class="cone-section">
        <div class="section-title">Edges ({{ connectedEdges.length }})</div>
        <div
          v-for="(edge, idx) in connectedEdges"
          :key="idx"
          class="edge-row"
        >
          <span class="edge-dir">{{ edge.source === nodeId ? 'OUT' : 'IN' }}</span>
          <span class="edge-target">
            {{ edge.source === nodeId ? edge.target : edge.source }}
          </span>
          <span class="edge-label">:{{ edge.label }}</span>
        </div>
        <div v-if="connectedEdges.length === 0" class="empty">No edges</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.da-cone {
  position: absolute;
  bottom: 80px;
  right: 8px;
  width: 220px;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  font-size: 11px;
  z-index: 10;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}
.cone-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid #21262d;
}
.cone-title {
  font-weight: 700;
  color: #d2a8ff;
}
.cone-node-id {
  flex: 1;
  color: #8b949e;
  font-family: monospace;
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cone-close {
  background: none;
  border: none;
  color: #8b949e;
  cursor: pointer;
  font-size: 13px;
  padding: 0 2px;
}
.cone-close:hover { color: #ff7b72; }
.cone-body {
  padding: 6px 8px;
  max-height: 200px;
  overflow-y: auto;
}
.cone-section {
  margin-bottom: 8px;
}
.cone-section:last-child { margin-bottom: 0; }
.section-title {
  color: #58a6ff;
  font-weight: 600;
  margin-bottom: 4px;
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.5px;
}
.prop-row, .edge-row {
  display: flex;
  gap: 6px;
  padding: 2px 0;
  color: #c9d1d9;
}
.prop-key {
  color: #8b949e;
  min-width: 40px;
}
.prop-value {
  font-family: monospace;
}
.edge-dir {
  font-weight: 600;
  color: #7ee787;
  min-width: 24px;
}
.edge-target {
  font-family: monospace;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}
.edge-label {
  color: #484f58;
}
.empty {
  color: #484f58;
  font-style: italic;
}
</style>
