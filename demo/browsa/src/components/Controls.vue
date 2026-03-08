<script setup>
import { ref } from 'vue';
import { useGraphStore } from '../stores/graphStore.js';

const store = useGraphStore();
const colorInput = ref('#ffffff');

function addNode() {
  store.addNode(colorInput.value);
}

function removeSelected() {
  if (store.selectedNode) {
    store.removeNode(store.selectedNode);
  }
}
</script>

<template>
  <div class="controls">
    <div class="control-row">
      <input
        type="color"
        v-model="colorInput"
        class="color-picker"
        :title="'Node color'"
      />
      <button class="btn btn-add" @click="addNode">+ Node</button>
      <button
        class="btn btn-remove"
        :disabled="!store.selectedNode"
        @click="removeSelected"
      >
        - Node
      </button>
    </div>
  </div>
</template>

<style scoped>
.controls {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.control-row {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: wrap;
}
.color-picker {
  width: 24px;
  height: 24px;
  border: none;
  padding: 0;
  cursor: pointer;
  background: transparent;
}
.btn {
  padding: 3px 8px;
  font-size: 11px;
  border: 1px solid #30363d;
  border-radius: 4px;
  background: #21262d;
  color: #c9d1d9;
  cursor: pointer;
  font-family: inherit;
}
.btn:hover:not(:disabled) { background: #30363d; }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-add { border-color: #238636; color: #7ee787; }
.btn-remove { border-color: #da3633; color: #ff7b72; }
</style>
