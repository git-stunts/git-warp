<script setup>
import { ref, watch } from 'vue';
import { useGraphStore } from '../stores/graphStore.js';

const store = useGraphStore();

const sliderValue = ref(0);
const isLive = ref(true);

watch(
  () => store.maxCeiling,
  (newMax) => {
    if (isLive.value && newMax !== undefined) {
      sliderValue.value = newMax;
    }
  },
);

function onSliderInput(event) {
  const val = parseInt(event.target.value, 10);
  sliderValue.value = val;
  isLive.value = val >= store.maxCeiling;
  store.setCeiling(isLive.value ? Infinity : val);
}

function goLive() {
  isLive.value = true;
  sliderValue.value = store.maxCeiling;
  store.setCeiling(Infinity);
}
</script>

<template>
  <div class="time-slider">
    <label class="slider-label">
      <span class="slider-icon">T</span>
      <input
        type="range"
        :min="0"
        :max="Math.max(store.maxCeiling, 1)"
        :value="sliderValue"
        class="slider"
        @input="onSliderInput"
      />
      <span class="slider-value" :class="{ live: isLive }">
        {{ isLive ? 'LIVE' : `t=${sliderValue}` }}
      </span>
      <button
        v-if="!isLive"
        class="btn-live"
        @click="goLive"
      >
        GO LIVE
      </button>
    </label>
  </div>
</template>

<style scoped>
.time-slider {
  display: flex;
  align-items: center;
}
.slider-label {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  font-size: 11px;
}
.slider-icon {
  color: #d2a8ff;
  font-weight: 700;
  font-size: 12px;
  font-style: italic;
}
.slider {
  flex: 1;
  height: 4px;
  accent-color: #d2a8ff;
}
.slider-value {
  font-family: monospace;
  color: #8b949e;
  min-width: 50px;
  text-align: right;
}
.slider-value.live {
  color: #7ee787;
  font-weight: 600;
}
.btn-live {
  padding: 2px 6px;
  font-size: 10px;
  border: 1px solid #238636;
  border-radius: 3px;
  background: transparent;
  color: #7ee787;
  cursor: pointer;
  font-weight: 600;
}
.btn-live:hover { background: #238636; color: #fff; }
</style>
