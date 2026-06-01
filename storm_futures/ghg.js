// ghg.js — Greenhouse Gas Projections
// Reads: data/ghg_long.csv
// Columns expected: year, scenario, gas, value
//   gas values: co2_ppm | ch4_ppb | n2o_ppb
//   scenario values: Historical | SSP1-1.9 | SSP1-2.6 | SSP2-4.5 | SSP3-7.0 | SSP5-8.5

(function () {

  // ── Config ──────────────────────────────────────────────────────────────
  const CSV_PATH = "data/ghg_long.csv";

  const SCENARIO_STYLE = {
    "Historical": { color: "#888780", dash: "",      width: 2.5 },
    "SSP1-1.9":   { color: "#1D9E75", dash: "6 4",  width: 1.8 },
    "SSP1-2.6":   { color: "#378ADD", dash: "4 3",  width: 1.8 },
    "SSP2-4.5":   { color: "#EF9F27", dash: "",      width: 1.8 },
    "SSP3-7.0":   { color: "#D85A30", dash: "2 2",  width: 1.8 },
    "SSP5-8.5":   { color: "#A32D2D", dash: "",      width: 2.5 },
  };

  // Gas metadata for panel and y-axis labels
  const GAS_META = {
    co2_ppm: {
      label:    "CO₂",
      yLabel:   "CO₂ concentration (ppm)",
      accentClass: "active-co2",
      factClass:   "co2",
      name:     "Carbon dioxide",
      what:     "A colorless, odorless gas released when coal, oil, and gas are burned, and by cement manufacturing and deforestation.",
      harm:     "The primary driver of long-term warming. CO₂ persists for hundreds to thousands of years, making each emission effectively permanent on human timescales.",
      potency:  "1× — the reference gas against which all others are measured",
      sources:  "Fossil fuel combustion, land-use change, cement production",
    },
    ch4_ppb: {
      label:    "CH₄",
      yLabel:   "CH₄ concentration (ppb)",
      accentClass: "active-ch4",
      factClass:   "ch4",
      name:     "Methane",
      what:     "Produced by livestock digestion, rice paddies, landfills, wetlands, and the extraction and transport of fossil fuels.",
      harm:     "Roughly 80× more effective at trapping heat than CO₂ over a 20-year window, though it breaks down within about a decade — meaning cuts have fast payoff.",
      potency:  "~80× CO₂ over 20 years · ~30× over 100 years",
      sources:  "Livestock, wetlands, fossil fuel leakage, landfills, rice agriculture",
    },
    n2o_ppb: {
      label:    "N₂O",
      yLabel:   "N₂O concentration (ppb)",
      accentClass: "active-n2o",
      factClass:   "n2o",
      name:     "Nitrous oxide",
      what:     "Produced primarily by nitrogen-based fertilizers in agricultural soils, livestock manure, and certain industrial processes.",
      harm:     "Nearly 270× more potent than CO₂ over 100 years and persists for ~110 years. Also destroys stratospheric ozone, the layer shielding Earth from UV radiation.",
      potency:  "~270× CO₂ over 100 years · atmospheric lifetime ≈ 110 years",
      sources:  "Nitrogen fertilizers, livestock manure, industrial processes, combustion",
    },
  };

  // Molecule SVG inner markup keyed by gas
  const MOLECULES = {
    co2_ppm: `
      <circle cx="36" cy="36" r="10" fill="#378ADD" opacity="0.92"/>
      <text x="36" y="40" text-anchor="middle" font-size="9" fill="white" font-weight="bold" font-family="Arial">C</text>
      <circle cx="10" cy="36" r="8"  fill="#A32D2D" opacity="0.88"/>
      <text x="10" y="40" text-anchor="middle" font-size="8" fill="white" font-weight="bold" font-family="Arial">O</text>
      <circle cx="62" cy="36" r="8"  fill="#A32D2D" opacity="0.88"/>
      <text x="62" y="40" text-anchor="middle" font-size="8" fill="white" font-weight="bold" font-family="Arial">O</text>
      <line x1="20" y1="33" x2="26" y2="33" stroke="#94a3b8" stroke-width="1.8"/>
      <line x1="20" y1="39" x2="26" y2="39" stroke="#94a3b8" stroke-width="1.8"/>
      <line x1="46" y1="33" x2="52" y2="33" stroke="#94a3b8" stroke-width="1.8"/>
      <line x1="46" y1="39" x2="52" y2="39" stroke="#94a3b8" stroke-width="1.8"/>
    `,
    ch4_ppb: `
      <circle cx="36" cy="36" r="11" fill="#EF9F27" opacity="0.92"/>
      <text x="36" y="40.5" text-anchor="middle" font-size="9" fill="white" font-weight="bold" font-family="Arial">C</text>
      <circle cx="14" cy="17" r="7"  fill="#888780" opacity="0.85"/>
      <text x="14" y="21"   text-anchor="middle" font-size="8" fill="white" font-weight="bold" font-family="Arial">H</text>
      <circle cx="58" cy="17" r="7" fill="#888780" opacity="0.85"/>
      <text x="58" y="21"   text-anchor="middle" font-size="8" fill="white" font-weight="bold" font-family="Arial">H</text>
      <circle cx="14" cy="55" r="7" fill="#888780" opacity="0.85"/>
      <text x="14" y="59"   text-anchor="middle" font-size="8" fill="white" font-weight="bold" font-family="Arial">H</text>
      <circle cx="58" cy="55" r="7" fill="#888780" opacity="0.85"/>
      <text x="58" y="59"   text-anchor="middle" font-size="8" fill="white" font-weight="bold" font-family="Arial">H</text>
      <line x1="26" y1="28" x2="20" y2="23" stroke="#94a3b8" stroke-width="1.8"/>
      <line x1="46" y1="28" x2="52" y2="23" stroke="#94a3b8" stroke-width="1.8"/>
      <line x1="26" y1="44" x2="20" y2="49" stroke="#94a3b8" stroke-width="1.8"/>
      <line x1="46" y1="44" x2="52" y2="49" stroke="#94a3b8" stroke-width="1.8"/>
    `,
    n2o_ppb: `
      <circle cx="18" cy="36" r="9"  fill="#1D9E75" opacity="0.92"/>
      <text x="18" y="40"   text-anchor="middle" font-size="9" fill="white" font-weight="bold" font-family="Arial">N</text>
      <circle cx="40" cy="36" r="9"  fill="#1D9E75" opacity="0.85"/>
      <text x="40" y="40"   text-anchor="middle" font-size="9" fill="white" font-weight="bold" font-family="Arial">N</text>
      <circle cx="62" cy="36" r="8"  fill="#A32D2D" opacity="0.85"/>
      <text x="62" y="40"   text-anchor="middle" font-size="8" fill="white" font-weight="bold" font-family="Arial">O</text>
      <line x1="27" y1="33" x2="31" y2="33" stroke="#94a3b8" stroke-width="1.8"/>
      <line x1="27" y1="39" x2="31" y2="39" stroke="#94a3b8" stroke-width="1.8"/>
      <line x1="27" y1="36" x2="31" y2="36" stroke="#94a3b8" stroke-width="1.2"/>
      <line x1="49" y1="33" x2="54" y2="33" stroke="#94a3b8" stroke-width="1.8"/>
      <line x1="49" y1="39" x2="54" y2="39" stroke="#94a3b8" stroke-width="1.8"/>
    `,
  };

  // ── State ────────────────────────────────────────────────────────────────
  let allData   = null;   // full parsed CSV
  let activeGas = "co2_ppm";

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const svgEl      = document.getElementById("ghg-chart");
  const molSvg     = document.getElementById("ghg-molecule");
  const infoPanel  = document.getElementById("ghg-info-panel");
  const legendEl   = document.getElementById("ghg-legend");
  const tooltipEl  = document.getElementById("ghg-tooltip");

  // ── Chart dimensions ─────────────────────────────────────────────────────
  const margin = { top: 28, right: 32, bottom: 52, left: 68 };

  function chartDims() {
    const rect = svgEl.getBoundingClientRect();
    const w = rect.width  || 800;
    const h = rect.height || 440;
    return {
      w, h,
      iw: w - margin.left - margin.right,
      ih: h - margin.top  - margin.bottom,
    };
  }

  // ── Load CSV ─────────────────────────────────────────────────────────────
  d3.csv(CSV_PATH, d3.autoType).then(raw => {
    // Expected columns: year, scenario, gas, value
    // Filter to only the three gases we use
    allData = raw.filter(d =>
      ["co2_ppm", "ch4_ppb", "n2o_ppb"].includes(d.gas) &&
      d.value != null && d.year != null && d.scenario
    );

    buildLegend();
    render(activeGas);
  }).catch(err => {
    console.error("ghg.js: could not load CSV:", err);
    // Show a friendly error inside the SVG
    const svg = d3.select(svgEl);
    svg.append("text")
      .attr("x", "50%").attr("y", "50%")
      .attr("text-anchor", "middle")
      .attr("fill", "#A32D2D")
      .attr("font-size", 14)
      .text("Could not load " + CSV_PATH + " — check the file path.");
  });

  // ── Render chart for a given gas key ────────────────────────────────────
  function render(gasKey) {
    if (!allData) return;

    const { w, h, iw, ih } = chartDims();
    const meta = GAS_META[gasKey];

    const gasData = allData.filter(d => d.gas === gasKey);

    // Group by scenario
    const grouped = d3.group(gasData, d => d.scenario);

    const x = d3.scaleLinear()
      .domain([1850, 2100])
      .range([margin.left, margin.left + iw]);

    const y = d3.scaleLinear()
      .domain(d3.extent(gasData, d => d.value)).nice()
      .range([margin.top + ih, margin.top]);

    const lineGen = d3.line()
      .x(d => x(d.year))
      .y(d => y(d.value))
      .curve(d3.curveMonotoneX);

    // ── Clear and resize SVG ─────────────────────────────────────────────
    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${w} ${h}`);

    // ── Grid lines ───────────────────────────────────────────────────────
    svg.append("g")
      .attr("class", "grid")
      .attr("transform", `translate(${margin.left}, 0)`)
      .call(
        d3.axisLeft(y).ticks(6)
          .tickSize(-iw)
          .tickFormat("")
      )
      .call(g => g.select(".domain").remove())
      .call(g => g.selectAll("line")
        .attr("stroke", "#e1e8f0")
        .attr("stroke-dasharray", "3 3"));

    // ── 2015 divider line ────────────────────────────────────────────────
    svg.append("line")
      .attr("x1", x(2015)).attr("x2", x(2015))
      .attr("y1", margin.top).attr("y2", margin.top + ih)
      .attr("stroke", "#cbd5e1")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "5 4");

    svg.append("text")
      .attr("x", x(2017)).attr("y", margin.top + ih - 8)
      .attr("fill", "#94a3b8")
      .attr("font-size", 10)
      .attr("font-family", "Arial, sans-serif")
      .text("projections →");

    // ── Lines ────────────────────────────────────────────────────────────
    for (const [scenario, rows] of grouped) {
      const style = SCENARIO_STYLE[scenario];
      if (!style) continue;

      const sorted = [...rows].sort((a, b) => a.year - b.year);

      svg.append("path")
        .datum(sorted)
        .attr("fill", "none")
        .attr("stroke", style.color)
        .attr("stroke-width", style.width)
        .attr("stroke-dasharray", style.dash)
        .attr("opacity", 0.92)
        .attr("d", lineGen);
    }

    // ── Hover overlay ────────────────────────────────────────────────────
    const bisect = d3.bisector(d => d.year).left;

    svg.append("rect")
      .attr("x", margin.left)
      .attr("y", margin.top)
      .attr("width", iw)
      .attr("height", ih)
      .attr("fill", "none")
      .attr("pointer-events", "all")
      .on("mousemove", function (event) {
        const [mx] = d3.pointer(event, this);
        const year = Math.round(x.invert(mx + margin.left));

        const lines = [];
        for (const [scenario, rows] of grouped) {
          const sorted = [...rows].sort((a, b) => a.year - b.year);
          const i = bisect(sorted, year, 1);
          const d = sorted[Math.min(i, sorted.length - 1)];
          if (d) lines.push({ scenario, value: d.value, color: SCENARIO_STYLE[scenario]?.color });
        }

        const svgRect = svgEl.getBoundingClientRect();
        const px = event.clientX - svgRect.left + 14;
        const py = event.clientY - svgRect.top  - 20;

        const rows = lines
          .sort((a, b) => b.value - a.value)
          .map(l => `<div style="display:flex;justify-content:space-between;gap:12px">
            <span style="color:${l.color};font-weight:600">${l.scenario}</span>
            <span>${l.value.toFixed(1)}</span>
          </div>`)
          .join("");

        d3.select(tooltipEl)
          .style("opacity", 1)
          .style("left", px + "px")
          .style("top",  py + "px")
          .html(`<div style="font-weight:700;margin-bottom:6px">${year}</div>${rows}`);
      })
      .on("mouseleave", () => d3.select(tooltipEl).style("opacity", 0));

    // ── X axis ───────────────────────────────────────────────────────────
    svg.append("g")
      .attr("class", "axis x-axis")
      .attr("transform", `translate(0, ${margin.top + ih})`)
      .call(
        d3.axisBottom(x)
          .tickValues([1850, 1875, 1900, 1925, 1950, 1975, 2000, 2025, 2050, 2075, 2100])
          .tickFormat(d3.format("d"))
      );

    // ── Y axis ───────────────────────────────────────────────────────────
    svg.append("g")
      .attr("class", "axis y-axis")
      .attr("transform", `translate(${margin.left}, 0)`)
      .call(d3.axisLeft(y).ticks(6));

    // Y-axis label
    svg.append("text")
      .attr("class", "axis-label")
      .attr("transform", `rotate(-90)`)
      .attr("x", -(margin.top + ih / 2))
      .attr("y", 16)
      .attr("text-anchor", "middle")
      .text(meta.yLabel);

    // X-axis label
    svg.append("text")
      .attr("class", "axis-label")
      .attr("x", margin.left + iw / 2)
      .attr("y", h - 8)
      .attr("text-anchor", "middle")
      .text("Year");
  }

  // ── Build legend ─────────────────────────────────────────────────────────
  function buildLegend() {
    legendEl.innerHTML = "";
    Object.entries(SCENARIO_STYLE).forEach(([label, style]) => {
      const item = document.createElement("div");
      item.className = "legend-item";

      const swatch = document.createElement("div");
      swatch.className = "legend-swatch";
      swatch.style.borderTopColor = style.color;
      swatch.style.borderTopStyle = style.dash ? "dashed" : "solid";

      const text = document.createElement("span");
      text.textContent = label;

      item.appendChild(swatch);
      item.appendChild(text);
      legendEl.appendChild(item);
    });
  }

  // ── Update info panel ─────────────────────────────────────────────────────
  function updatePanel(gasKey) {
    const m = GAS_META[gasKey];
    const fc = m.factClass;
    infoPanel.innerHTML = `
      <div>
        <div class="gas-label">${gasKey.replace("_ppm","").replace("_ppb","").toUpperCase()}</div>
        <h3>${m.name}</h3>
      </div>
      <div class="info-fact ${fc}">
        <div class="info-fact-label">What is it?</div>
        <p>${m.what}</p>
      </div>
      <div class="info-fact ${fc}">
        <div class="info-fact-label">Why harmful?</div>
        <p>${m.harm}</p>
      </div>
      <div class="info-fact ${fc}">
        <div class="info-fact-label">Warming potency</div>
        <p>${m.potency}</p>
      </div>
      <div class="info-fact ${fc}">
        <div class="info-fact-label">Main sources</div>
        <p>${m.sources}</p>
      </div>
    `;
  }

  // ── Update molecule badge ────────────────────────────────────────────────
  function updateMolecule(gasKey) {
    molSvg.innerHTML = MOLECULES[gasKey] || "";
  }

  // ── Update gas toggle buttons ────────────────────────────────────────────
  function updateButtons(gasKey) {
    ["co2_ppm", "ch4_ppb", "n2o_ppb"].forEach(k => {
      const id = "btn-" + k.split("_")[0];
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.className = "gas-btn";
      if (k === gasKey) btn.classList.add(GAS_META[k].accentClass);
    });
  }

  // ── Public switchGas — called from HTML onclick ───────────────────────────
  window.switchGas = function (shortKey) {
    // Accept "co2" → "co2_ppm", "ch4" → "ch4_ppb", "n2o" → "n2o_ppb"
    const map = { co2: "co2_ppm", ch4: "ch4_ppb", n2o: "n2o_ppb" };
    const gasKey = map[shortKey] || shortKey;
    activeGas = gasKey;
    updateButtons(gasKey);
    updateMolecule(gasKey);
    updatePanel(gasKey);
    render(gasKey);
  };

  // ── Re-render on resize ──────────────────────────────────────────────────
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => render(activeGas), 120);
  });

  // ── Initial render (CO₂) ─────────────────────────────────────────────────
  // Panel and molecule render immediately; chart renders after CSV loads
  updateButtons("co2_ppm");
  updateMolecule("co2_ppm");
  updatePanel("co2_ppm");

})();