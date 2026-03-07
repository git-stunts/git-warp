<script setup>
import { onMounted } from 'vue';
import { useGraphStore } from './stores/graphStore.js';
import GraphViewport from './components/GraphViewport.vue';

const store = useGraphStore();
onMounted(() => store.init());
</script>

<template>
  <div class="app-layout">
    <header class="app-header">
      <h1>Browsa</h1>
      <span class="subtitle">git-warp in the Browser</span>
      <button class="sync-all-btn" @click="store.syncAll()">Sync All</button>
    </header>
    <div class="viewport-grid">
      <GraphViewport
        v-for="id in store.viewportIds"
        :key="id"
        :viewport-id="id"
      />
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
.app-header h1 {
  font-size: 18px;
  color: #58a6ff;
}
.subtitle {
  font-size: 13px;
  color: #8b949e;
}
.sync-all-btn {
  margin-left: auto;
  padding: 6px 14px;
  background: #238636;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}
.sync-all-btn:hover { background: #2ea043; }
.viewport-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  flex: 1;
  gap: 1px;
  background: #30363d;
}
@media (max-width: 800px) {
  .viewport-grid {
    grid-template-columns: 1fr;
    grid-template-rows: repeat(4, 1fr);
  }
}
</style>
