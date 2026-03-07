<script setup>
import { useGraphStore } from '../stores/graphStore.js';

const store = useGraphStore();
</script>

<template>
  <div class="scenario-panel">
    <div class="scenario-header">Scenarios</div>
    <div v-if="store.scenarioRunning" class="scenario-running">
      <span class="running-label">{{ store.scenarioName }}</span>
      <span class="running-step">step {{ store.scenarioStep + 1 }}</span>
      <button class="btn btn-stop" @click="store.stopScenario()">Stop</button>
    </div>
    <div v-else class="scenario-list">
      <button
        v-for="(s, idx) in store.scenarios"
        :key="idx"
        class="scenario-btn"
        @click="store.runScenario(idx)"
        :title="s.description"
      >
        <span class="scenario-name">{{ s.name }}</span>
        <span class="scenario-desc">{{ s.description }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.scenario-panel {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}
.scenario-header {
  font-size: 12px;
  font-weight: 600;
  color: #8b949e;
  white-space: nowrap;
}
.scenario-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.scenario-btn {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px 10px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s;
}
.scenario-btn:hover {
  border-color: #58a6ff;
}
.scenario-name {
  font-size: 11px;
  font-weight: 600;
  color: #c9d1d9;
  font-family: inherit;
}
.scenario-desc {
  font-size: 9px;
  color: #8b949e;
  font-family: inherit;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.scenario-running {
  display: flex;
  align-items: center;
  gap: 8px;
}
.running-label {
  font-size: 12px;
  color: #58a6ff;
  font-weight: 600;
}
.running-step {
  font-size: 11px;
  color: #8b949e;
  font-family: monospace;
}
.btn-stop {
  padding: 3px 10px;
  font-size: 11px;
  border: 1px solid #da3633;
  border-radius: 4px;
  background: #21262d;
  color: #ff7b72;
  cursor: pointer;
  font-family: inherit;
}
.btn-stop:hover {
  background: #da3633;
  color: #fff;
}
</style>
