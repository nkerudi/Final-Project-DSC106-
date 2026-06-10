const tipEl = document.getElementById("tooltip");

function showTip(html, ev) {
  tipEl.innerHTML = html;
  tipEl.style.opacity = 1;
  moveTip(ev);
}
function moveTip(ev) {
  const x = Math.min(ev.clientX + 14, window.innerWidth - 240);
  const y = ev.clientY - 14;
  tipEl.style.left = x + "px";
  tipEl.style.top  = y + "px";
}
function hideTip() { tipEl.style.opacity = 0; }
document.addEventListener("mousemove", ev => {
  if (tipEl.style.opacity === "1") moveTip(ev);
});

let currentView = "tc";
let globalData  = [];

d3.json("tc_timeseries.json").then(data => {
  globalData = data;

  const tcTotal   = d3.sum(data, d => d.tc_cost);
  const tcCount   = d3.sum(data, d => d.tc_count);
  const allTotal  = d3.sum(data, d => d.all_cost);
  const pct       = (tcTotal / allTotal * 100).toFixed(0);

  document.getElementById("stat-tc-cost").textContent  = `$${tcTotal.toFixed(0)}B`;
  document.getElementById("stat-tc-count").textContent = tcCount;
  document.getElementById("stat-pct").textContent      = `${pct}%`;

  const top5 = [...data]
    .filter(d => d.tc_cost > 0)
    .sort((a, b) => b.tc_cost - a.tc_cost)
    .slice(0, 5);

  const maxCost = top5[0].tc_cost;
  const container = document.getElementById("worst-years");

  top5.forEach((d, i) => {
    const row = document.createElement("div");
    row.className = "worst-year-row";
    row.innerHTML = `
      <span class="wy-rank">#${i + 1}</span>
      <span class="wy-year">${d.year}</span>
      <div class="wy-bar-track">
        <div class="wy-bar-fill" style="width:0%;" data-pct="${(d.tc_cost / maxCost * 100).toFixed(1)}"></div>
      </div>
      <span class="wy-cost">$${d.tc_cost.toFixed(1)}B</span>
    `;
    container.appendChild(row);
  });

  requestAnimationFrame(() => {
    setTimeout(() => {
      document.querySelectorAll(".wy-bar-fill").forEach(el => {
        el.style.width = el.dataset.pct + "%";
      });
    }, 200);
  });

  drawChart(data, currentView);

  document.getElementById("view-toggle").addEventListener("click", e => {
    const btn = e.target.closest(".pill");
    if (!btn) return;
    document.querySelectorAll("#view-toggle .pill")
      .forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    currentView = btn.dataset.view;
    drawChart(globalData, currentView);
  });

  let raf;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => drawChart(globalData, currentView));
  });
  ro.observe(document.getElementById("chart-svg").parentElement);

}).catch(err => {
  console.error("Could not load tc_timeseries.json:", err);
  document.getElementById("chart-svg").insertAdjacentHTML(
    "afterend",
    `<p style="color:#c0392b;font-size:.85rem;margin-top:12px;">
      ⚠ Could not load tc_timeseries.json — make sure the file is in the same
      folder as impact.html and your notebook has been run.
    </p>`
  );
});

function drawChart(data, view) {
  const svgEl = document.getElementById("chart-svg");
  svgEl.innerHTML = "";

  const W = svgEl.getBoundingClientRect().width || 500;
  const H = Math.max(240, W * 0.48);
  const margin = { top: 12, right: 14, bottom: 40, left: 56 };
  const iW = W - margin.left - margin.right;
  const iH = H - margin.top  - margin.bottom;

  svgEl.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svgEl.setAttribute("height", H);

  const svg = d3.select("#chart-svg");
  const g   = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear()
    .domain(d3.extent(data, d => d.year))
    .range([0, iW]);

  const maxTCcost  = d3.max(data, d => d.tc_upper95);
  const maxAllCost = d3.max(data, d => d.all_cost);

  const yTC = d3.scaleLinear()
    .domain([0, Math.max(maxTCcost, maxAllCost) * 1.12])
    .range([iH, 0]).nice();

  g.append("g")
    .call(d3.axisLeft(yTC).ticks(5).tickSize(-iW).tickFormat(""))
    .call(gg => {
      gg.selectAll("line").attr("stroke", "#eef2f7").attr("stroke-dasharray", "3,3");
      gg.select(".domain").remove();
    });

  if (view !== "all") {
    const area = d3.area()
      .x(d => x(d.year))
      .y0(d => yTC(d.tc_lower95))
      .y1(d => yTC(d.tc_upper95))
      .defined(d => d.tc_upper95 > 0)
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(data)
      .attr("fill", "#2563a8")
      .attr("opacity", 0.12)
      .attr("d", area);
  }

  if (view !== "all") {
    const bw = Math.max(2, iW / data.length - 2);

    g.selectAll(".bar")
      .data(data.filter(d => d.tc_cost > 0))
      .join("rect")
      .attr("class", "bar")
      .attr("x",      d => x(d.year) - bw / 2)
      .attr("width",  bw)
      .attr("rx", 2)
      .attr("fill", "#2563a8")
      .attr("opacity", 0.75)
      .attr("y", iH)
      .attr("height", 0)
      .on("mouseover", (ev, d) => showTip(
        `<strong>${d.year}</strong><br>
         TC damage: <strong>$${d.tc_cost.toFixed(1)}B</strong><br>
         95% range: $${d.tc_lower95.toFixed(1)}B – $${d.tc_upper95.toFixed(1)}B<br>
         Events: <strong>${d.tc_count}</strong><br>
         <span class="tip-sub">All disasters that year: $${d.all_cost.toFixed(1)}B</span>`,
        ev))
      .on("mouseout", hideTip)
      .transition().duration(700).delay((_, i) => i * 12)
      .attr("y", d => yTC(d.tc_cost))
      .attr("height", d => iH - yTC(d.tc_cost));
  }

  if (view !== "tc") {
    const yScale = yTC;

    const line = d3.line()
      .x(d => x(d.year))
      .y(d => yScale(d.all_cost))
      .curve(d3.curveMonotoneX);

    const path = g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#c0392b")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "5,3")
      .attr("d", line);

    const len = path.node().getTotalLength();
    path
      .attr("stroke-dashoffset", len)
      .transition().duration(1200).ease(d3.easeCubicInOut)
      .attr("stroke-dashoffset", 0);

    g.selectAll(".all-dot")
      .data(data)
      .join("circle")
      .attr("class", "all-dot")
      .attr("cx", d => x(d.year))
      .attr("cy", d => yScale(d.all_cost))
      .attr("r", 5)
      .attr("fill", "transparent")
      .attr("stroke", "none")
      .on("mouseover", (ev, d) => showTip(
        `<strong>${d.year}</strong><br>
         All disasters: <strong>$${d.all_cost.toFixed(1)}B</strong><br>
         Total events: <strong>${d.all_count}</strong>`,
        ev))
      .on("mouseout", hideTip);
  }

  g.append("g").attr("class", "axis")
    .attr("transform", `translate(0,${iH})`)
    .call(d3.axisBottom(x)
      .tickValues(d3.range(1980, 2025, 5))
      .tickFormat(d3.format("d")))
    .call(gg => gg.select(".domain").attr("stroke", "#dce6f0"));

  g.append("g").attr("class", "axis")
    .call(d3.axisLeft(yTC).ticks(5).tickFormat(d => `$${d}B`))
    .call(gg => gg.select(".domain").attr("stroke", "#dce6f0"));


const legendEl = document.getElementById("legend");
  legendEl.innerHTML = "";

  if (view !== "all") {
    legendEl.innerHTML += `
      <div class="legend-item">
        <div class="legend-swatch" style="background:#2563a8;opacity:.75;"></div>
        <span>TC damage ($B)</span>
      </div>
      <div class="legend-item">
        <div class="legend-swatch" style="background:#2563a8;opacity:.15;border-radius:2px;width:22px;height:10px;"></div>
        <span>95% uncertainty range</span>
      </div>`;
  }
  if (view !== "tc") {
    legendEl.innerHTML += `
      <div class="legend-item">
        <div class="legend-line" style="background:#c0392b;"></div>
        <span>All disasters ($B)</span>
      </div>`;
  }
}
