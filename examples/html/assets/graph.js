(function () {
  async function renderGraph(targetId, dot) {
    const container = document.getElementById(targetId);
    if (!container) {
      return;
    }

    try {
      const viz = new Viz();
      const svg = await viz.renderSVGElement(dot);
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      svg.style.maxWidth = "100%";
      svg.style.height = "auto";
      container.innerHTML = "";
      container.appendChild(svg);
    } catch (err) {
      container.innerHTML = "";
      const message = document.createElement("div");
      message.textContent = "Viz render failed: " + (err && err.message ? err.message : String(err));
      message.style.color = "#fca5a5";
      container.appendChild(message);
    }
  }

  window.renderGraph = renderGraph;
})();
