<script setup>
import { useGraphStore } from '../stores/graphStore.js';
import GraphCanvas from './GraphCanvas.vue';
import Controls from './Controls.vue';
import TimeSlider from './TimeSlider.vue';
import Inspector from './Inspector.vue';

const store = useGraphStore();
</script>

<template>
  <div class="viewport">
    <div class="viewport-header">
      <div class="viewport-title">
        <span class="viewport-label">{{ store.activeGraph }}</span>
      </div>
      <span class="node-count">{{ store.nodes.length }} nodes</span>
    </div>

    <div class="viewport-body">
      <GraphCanvas
        :nodes="store.nodes"
        :edges="store.edges"
        :selected-node="store.selectedNode"
        @select="(nodeId) => store.selectNode(nodeId)"
      />
    </div>

    <div class="viewport-footer">
      <Controls />
      <TimeSlider />
    </div>

    <Inspector
      v-if="store.selectedNode"
      :node-id="store.selectedNode"
    />
  </div>
</template>

<style scoped>
.viewport {
  display: flex;
  flex-direction: column;
  background: #0d1117;
  position: relative;
  overflow: hidden;
  height: 100%;
}
.viewport-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #161b22;
  border-bottom: 1px solid #21262d;
  font-size: 12px;
  flex-shrink: 0;
}
.viewport-title {
  display: flex;
  align-items: center;
  gap: 6px;
}
.viewport-label {
  font-weight: 600;
  color: #e6edf3;
}
.node-count {
  margin-left: auto;
  color: #8b949e;
}
.viewport-body {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}
.viewport-footer {
  padding: 6px 10px;
  background: #161b22;
  border-top: 1px solid #21262d;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}
</style>
