<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  edges: { type: Array, default: () => [] },
  selectedNode: { type: String, default: null },
});

const emit = defineEmits(['select']);

const canvasRef = ref(null);
let animFrameId = null;
let simNodes = [];

// Simple force-directed layout state
let simRunning = false;

function layoutNodes(nodes, edges) {
  // Assign initial positions in a circle if nodes are new
  const existing = new Map(simNodes.map((n) => [n.id, n]));
  const result = nodes.map((n, i) => {
    const prev = existing.get(n.id);
    if (prev) {
      return { ...n, x: prev.x, y: prev.y, vx: prev.vx || 0, vy: prev.vy || 0 };
    }
    const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1);
    const r = 80;
    return { ...n, x: 150 + r * Math.cos(angle), y: 120 + r * Math.sin(angle), vx: 0, vy: 0 };
  });

  simNodes = result;
  if (!simRunning) {
    simRunning = true;
    runSimulation(edges);
  }
}

function runSimulation(edges) {
  let iterations = 0;
  const maxIter = 100;
  const cx = 150;
  const cy = 120;

  function step() {
    if (iterations >= maxIter || simNodes.length === 0) {
      simRunning = false;
      draw();
      return;
    }
    iterations++;

    // Repulsion between all pairs
    for (let i = 0; i < simNodes.length; i++) {
      for (let j = i + 1; j < simNodes.length; j++) {
        const a = simNodes[i];
        const b = simNodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = 800 / (dist * dist);
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        a.vx += dx;
        a.vy += dy;
        b.vx -= dx;
        b.vy -= dy;
      }
    }

    // Attraction along edges
    const nodeMap = new Map(simNodes.map((n) => [n.id, n]));
    for (const e of edges) {
      const a = nodeMap.get(e.source);
      const b = nodeMap.get(e.target);
      if (!a || !b) { continue; }
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - 60) * 0.05;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // Center gravity
    for (const n of simNodes) {
      n.vx += (cx - n.x) * 0.01;
      n.vy += (cy - n.y) * 0.01;
      // Damping
      n.vx *= 0.85;
      n.vy *= 0.85;
      n.x += n.vx;
      n.y += n.vy;
      // Bounds
      n.x = Math.max(20, Math.min(280, n.x));
      n.y = Math.max(20, Math.min(220, n.y));
    }

    draw();
    animFrameId = requestAnimationFrame(() => step());
  }

  step();
}

function draw() {
  const canvas = canvasRef.value;
  if (!canvas) { return; }
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const nodeMap = new Map(simNodes.map((n) => [n.id, n]));

  // Draw edges
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 1.5;
  for (const e of props.edges) {
    const a = nodeMap.get(e.source);
    const b = nodeMap.get(e.target);
    if (!a || !b) { continue; }
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    // Arrow head
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const arrowLen = 8;
    const ax = b.x - 14 * Math.cos(angle);
    const ay = b.y - 14 * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - arrowLen * Math.cos(angle - 0.4), ay - arrowLen * Math.sin(angle - 0.4));
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - arrowLen * Math.cos(angle + 0.4), ay - arrowLen * Math.sin(angle + 0.4));
    ctx.stroke();
  }

  // Draw nodes
  const radius = 12;
  for (const n of simNodes) {
    const isSelected = n.id === props.selectedNode;

    // Glow for selected
    if (isSelected) {
      ctx.shadowColor = n.color;
      ctx.shadowBlur = 12;
    }

    ctx.beginPath();
    ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = n.color;
    ctx.fill();

    if (isSelected) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Label
    ctx.fillStyle = '#fff';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(n.label || '', n.x, n.y + radius + 12);
  }
}

function handleClick(event) {
  const canvas = canvasRef.value;
  if (!canvas) { return; }
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  const radius = 14;
  let clicked = null;
  for (const n of simNodes) {
    const dx = n.x - x;
    const dy = n.y - y;
    if (dx * dx + dy * dy < radius * radius) {
      clicked = n.id;
      break;
    }
  }

  emit('select', clicked);
}

watch(
  () => [props.nodes, props.edges],
  ([newNodes, newEdges]) => {
    layoutNodes(newNodes, newEdges);
  },
  { deep: true },
);

onMounted(() => {
  if (props.nodes.length > 0) {
    layoutNodes(props.nodes, props.edges);
  }
});

onUnmounted(() => {
  if (animFrameId) { cancelAnimationFrame(animFrameId); }
});
</script>

<template>
  <canvas
    ref="canvasRef"
    width="300"
    height="240"
    style="width: 100%; height: 100%; cursor: pointer"
    @click="handleClick"
  />
</template>
