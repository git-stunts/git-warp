<script setup>
import { computed, ref } from 'vue';
import { useGraphStore } from '../stores/graphStore.js';

const props = defineProps({ viewportId: String });
const store = useGraphStore();
const vp = computed(() => store.viewports[props.viewportId]);

const colorInput = ref('#ffffff');

function addNode() {
  store.addNode(props.viewportId, colorInput.value);
}

function removeSelected() {
  if (vp.value?.selectedNode) {
    store.removeNode(props.viewportId, vp.value.selectedNode);
  }
}

const syncTargets = computed(() =>
  store.viewportIds.filter((id) => id !== props.viewportId),
);

async function syncWith(targetId) {
  if (!vp.value?.online) { return; }
  const target = store.viewports[targetId];
  if (!target?.online) { return; }
  await store.syncPair(props.viewportId, targetId);
}
</script>

<template>
  <div class="controls" v-if="vp">
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
        :disabled="!vp.selectedNode"
        @click="removeSelected"
      >
        - Node
      </button>
      <button
        class="btn btn-online"
        :class="vp.online ? 'online' : 'offline'"
        @click="store.toggleOnline(props.viewportId)"
      >
        {{ vp.online ? 'ONLINE' : 'OFFLINE' }}
      </button>
    </div>
    <div class="control-row">
      <button
        v-for="targetId in syncTargets"
        :key="targetId"
        class="btn btn-sync"
        :disabled="!vp.online || !store.viewports[targetId]?.online"
        @click="syncWith(targetId)"
      >
        Sync {{ store.viewports[targetId]?.label }}
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
.btn-online.online { border-color: #238636; color: #7ee787; }
.btn-online.offline { border-color: #da3633; color: #ff7b72; background: #21262d; }
.btn-sync { border-color: #1f6feb; color: #79c0ff; font-size: 10px; }
</style>
