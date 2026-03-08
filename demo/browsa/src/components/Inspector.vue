<script setup>
import { computed } from 'vue';
import { useGraphStore } from '../stores/graphStore.js';

defineProps({ nodeId: String });

const store = useGraphStore();

const nodeProps = computed(() => {
  if (!store.inspectedProps) { return []; }
  return Object.entries(store.inspectedProps).map(([key, value]) => ({
    key,
    value,
  }));
});

const connectedEdges = computed(() => {
  return store.edges.filter(
    (e) => e.source === store.selectedNode || e.target === store.selectedNode,
  );
});

function close() {
  store.selectNode(null);
}
</script>

<template>
  <div class="inspector">
    <div class="inspector-header">
      <span class="inspector-title">Inspector</span>
      <span class="inspector-node-id">{{ nodeId }}</span>
      <button class="inspector-close" @click="close">x</button>
    </div>
    <div class="inspector-body">
      <div class="inspector-section">
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
      <div class="inspector-section">
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
.inspector {
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
.inspector-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid #21262d;
}
.inspector-title {
  font-weight: 700;
  color: #d2a8ff;
}
.inspector-node-id {
  flex: 1;
  color: #8b949e;
  font-family: monospace;
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.inspector-close {
  background: none;
  border: none;
  color: #8b949e;
  cursor: pointer;
  font-size: 13px;
  padding: 0 2px;
}
.inspector-close:hover { color: #ff7b72; }
.inspector-body {
  padding: 6px 8px;
  max-height: 200px;
  overflow-y: auto;
}
.inspector-section {
  margin-bottom: 8px;
}
.inspector-section:last-child { margin-bottom: 0; }
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
