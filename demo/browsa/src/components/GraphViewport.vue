<script setup>
import { computed } from 'vue';
import { useGraphStore } from '../stores/graphStore.js';
import GraphCanvas from './GraphCanvas.vue';
import Controls from './Controls.vue';
import TimeSlider from './TimeSlider.vue';
import DaCone from './DaCone.vue';

const props = defineProps({ viewportId: String });
const store = useGraphStore();
const vp = computed(() => store.viewports[props.viewportId]);
</script>

<template>
  <div class="viewport" :class="{ offline: vp && !vp.online }">
    <div class="viewport-header" v-if="vp">
      <div class="viewport-title">
        <span class="writer-badge" :style="{ background: vp.color }"></span>
        <span class="viewport-label">{{ vp.label }}</span>
        <span class="writer-id">{{ vp.writerId.slice(0, 12) }}...</span>
      </div>
      <span class="node-count">{{ vp.nodes.length }} nodes</span>
      <span v-if="!vp.online" class="offline-badge">OFFLINE</span>
    </div>

    <div class="viewport-body" v-if="vp">
      <GraphCanvas
        :nodes="vp.nodes"
        :edges="vp.edges"
        :selected-node="vp.selectedNode"
        @select="(nodeId) => store.selectNode(props.viewportId, nodeId)"
      />
    </div>

    <div class="viewport-footer" v-if="vp">
      <Controls :viewport-id="props.viewportId" />
      <TimeSlider :viewport-id="props.viewportId" />
    </div>

    <DaCone
      v-if="vp && vp.selectedNode"
      :viewport-id="props.viewportId"
      :node-id="vp.selectedNode"
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
}
.viewport.offline {
  opacity: 0.7;
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
.writer-badge {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.viewport-label {
  font-weight: 600;
  color: #e6edf3;
}
.writer-id {
  color: #484f58;
  font-family: monospace;
  font-size: 11px;
}
.node-count {
  margin-left: auto;
  color: #8b949e;
}
.offline-badge {
  background: #da3633;
  color: #fff;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 700;
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
