<script setup>
import { onMounted } from 'vue';
import { useGraphStore } from './stores/graphStore.js';
import GraphViewport from './components/GraphViewport.vue';

const store = useGraphStore();
onMounted(() => store.init());

function onGraphChange(event) {
  store.openGraph(event.target.value);
}
</script>

<template>
  <div class="app-layout">
    <header class="app-header">
      <div class="header-left">
        <h1>Browsa</h1>
        <span class="subtitle">git-warp in the Browser</span>
      </div>
      <div class="connection-bar">
        <span
          class="status-dot"
          :class="store.connectionStatus"
        ></span>
        <span class="server-url">{{ store.serverUrl }}</span>
        <select
          v-if="store.availableGraphs.length > 0"
          class="graph-select"
          :value="store.activeGraph"
          @change="onGraphChange"
        >
          <option disabled :value="null">Select graph...</option>
          <option
            v-for="g in store.availableGraphs"
            :key="g"
            :value="g"
          >
            {{ g }}
          </option>
        </select>
        <span class="writer-badge" v-if="store.writerId">
          {{ store.writerId.slice(0, 8) }}
        </span>
      </div>
    </header>

    <div v-if="store.error" class="error-bar">
      {{ store.error }}
    </div>

    <div
      v-if="store.connectionStatus === 'disconnected'"
      class="disconnected-prompt"
    >
      <p>Not connected to server.</p>
      <button class="btn-reconnect" @click="store.reconnect()">
        Reconnect
      </button>
    </div>

    <GraphViewport
      v-else-if="store.activeGraph"
      class="viewport-container"
    />

    <div v-else class="waiting-prompt">
      <p v-if="store.connectionStatus === 'connecting'">Connecting...</p>
      <p v-else>Select a graph to get started.</p>
    </div>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.app-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  background: #161b22;
  border-bottom: 1px solid #30363d;
  flex-shrink: 0;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.app-header h1 {
  font-size: 18px;
  color: #58a6ff;
}
.subtitle {
  font-size: 13px;
  color: #8b949e;
}
.connection-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot.connected { background: #7ee787; }
.status-dot.connecting { background: #d29922; }
.status-dot.disconnected { background: #da3633; }
.server-url {
  font-size: 12px;
  color: #8b949e;
  font-family: monospace;
}
.graph-select {
  padding: 3px 8px;
  font-size: 12px;
  background: #21262d;
  color: #c9d1d9;
  border: 1px solid #30363d;
  border-radius: 4px;
  font-family: inherit;
}
.writer-badge {
  font-size: 11px;
  color: #484f58;
  font-family: monospace;
  padding: 2px 6px;
  background: #21262d;
  border-radius: 3px;
}
.error-bar {
  padding: 6px 16px;
  background: #3d1e20;
  color: #ff7b72;
  font-size: 12px;
  border-bottom: 1px solid #da3633;
  flex-shrink: 0;
}
.disconnected-prompt,
.waiting-prompt {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #8b949e;
  gap: 12px;
}
.btn-reconnect {
  padding: 6px 14px;
  background: #238636;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}
.btn-reconnect:hover { background: #2ea043; }
.viewport-container {
  flex: 1;
  min-height: 0;
}
</style>
