const parseDate = d3.timeParse("%Y-%m-%d %H:%M:%S");
const fmtDate = d3.timeFormat("%b %d, %Y");

function cleanNumber(value, missingCodes = []) {
  const num = +value;
  if (Number.isNaN(num)) return null;
  if (missingCodes.includes(num)) return null;
  if (num < 0) return null;
  return num;
}

d3.csv("../../data/storm/storms_aggregated.csv", d => {
  const start = parseDate(d.start_time);
  const end = parseDate(d.end_time);
  const year = start ? start.getFullYear() : null;

  return {
    name: d.name ? d.name.trim() : "Unknown",
    year,
    start,
    end,
    duration_days: +d.duration_days || null,
    wind: cleanNumber(d.wind),
    pressure: cleanNumber(d.pressure, [-999]),
    tropicalstorm_force_diameter: cleanNumber(d.tropicalstorm_force_diameter, [-1998]),
    hurricane_force_diameter: cleanNumber(d.hurricane_force_diameter, [-1998])
  };
}).then(DATA => {
  DATA = DATA.filter(d => d.year && d.wind !== null);
  DATA.sort((a, b) => a.start - b.start);

  const decades = [1970, 1980, 1990, 2000, 2010, 2020];
  const MAX_R = 38;
  const MIN_R = 4;

  const maxDiameter = d3.max(DATA, d => d.tropicalstorm_force_diameter);
  const maxWind = d3.max(DATA, d => d.wind);

  const rScale = d3.scaleSqrt()
    .domain([0, maxDiameter || 1])
    .range([MIN_R, MAX_R]);

  const windScale = d3.scaleSqrt()
    .domain([0, maxWind || 1])
    .range([MIN_R, MAX_R * 0.75]);

  const inverseRScale = d3.scalePow()
    .exponent(2)
    .domain([MIN_R, MAX_R])
    .range([0, maxDiameter || 1]);

  const svg = d3.select("#chart");
  const tooltip = document.getElementById("tooltip");
  const slider = document.getElementById("decade-slider");
  const decadeLabel = document.getElementById("decade-label");

  function getDecade(year) {
    return Math.floor(year / 10) * 10;
  }

  function estimateDiameterFromWind(wind, type = "ts") {
    const estimatedRadius = type === "hur"
      ? windScale(wind) * 0.55
      : windScale(wind);

    return inverseRScale(estimatedRadius);
  }

  function render(selectedDecade) {
    const decadeData = DATA.filter(
      d => getDecade(d.start.getFullYear()) === selectedDecade
    );

    svg.selectAll("*").remove();

    const containerWidth = document.getElementById("chart-container").clientWidth;
    const svgWidth = Math.max(900, containerWidth - 48);

    const cardW = 150;
    const cardH = 210;
    const gapX = 24;
    const gapY = 28;

    const columns = Math.max(3, Math.floor((svgWidth - 80) / (cardW + gapX)));
    const rows = Math.ceil(decadeData.length / columns);

    const avgTop = 40;
    const avgCenterY = 160;
    const gridTop = 360; // bumped down slightly to accommodate wind label
    const svgHeight = gridTop + rows * (cardH + gapY) + 70;

    svg
      .attr("width", svgWidth)
      .attr("height", svgHeight)
      .attr("viewBox", `0 0 ${svgWidth} ${svgHeight}`);

    if (decadeData.length === 0) {
      svg.append("text")
        .attr("x", svgWidth / 2)
        .attr("y", 120)
        .attr("text-anchor", "middle")
        .attr("fill", "#8892a4")
        .attr("font-size", "13px")
        .text("No storms available for this decade");
      return;
    }

    const validTS = decadeData.filter(d => d.tropicalstorm_force_diameter !== null);
    const validHur = decadeData.filter(d => d.hurricane_force_diameter !== null);

    let avgTS = d3.mean(validTS, d => d.tropicalstorm_force_diameter);
    let avgHur = d3.mean(validHur, d => d.hurricane_force_diameter);

    const avgWind = d3.mean(decadeData, d => d.wind);

    if (avgTS === undefined) {
      avgTS = estimateDiameterFromWind(avgWind, "ts");
    }

    if (avgHur === undefined) {
      avgHur = estimateDiameterFromWind(avgWind, "hur");
    }

    const avgTSRadius = rScale(avgTS);
    const avgHurRadius = rScale(avgHur);

    // ── Section title & subtitle ──────────────────────────────────────────────
    svg.append("text")
      .attr("class", "avg-title")
      .attr("x", svgWidth / 2)
      .attr("y", avgTop)
      .attr("text-anchor", "middle")
      .text(`${selectedDecade}s Average Storm`);

    svg.append("text")
      .attr("class", "avg-subtitle")
      .attr("x", svgWidth / 2)
      .attr("y", avgTop + 26)
      .attr("text-anchor", "middle")
      .text(`Average size across ${decadeData.length} storms`);

    // ── Average circles ───────────────────────────────────────────────────────
    const avgGroup = svg.append("g")
      .attr("transform", `translate(${svgWidth / 2}, ${avgCenterY})`);

    avgGroup.append("circle")
      .attr("r", avgTSRadius)
      .attr("fill", "rgba(45,212,191,0.15)")
      .attr("stroke", "#2dd4bf")
      .attr("stroke-width", 1.6)
      .attr("stroke-dasharray", validTS.length === 0 ? "4 4" : "6 6");

    avgGroup.append("circle")
      .attr("r", avgHurRadius)
      .attr("fill", "rgba(251,113,133,0.2)")
      .attr("stroke", "#fb7185")
      .attr("stroke-width", 1.6)
      .attr("stroke-dasharray", validHur.length === 0 ? "4 4" : "6 6");

    avgGroup.append("circle")
      .attr("r", 3)
      .attr("fill", "#e11d48");

    // ── TS label (left) ───────────────────────────────────────────────────────
    svg.append("text")
      .attr("x", svgWidth / 2 - 260)
      .attr("y", avgCenterY - 10)
      .attr("class", "avg-label-ts")
      .text("○ Tropical storm diameter");

    svg.append("text")
      .attr("x", svgWidth / 2 - 260)
      .attr("y", avgCenterY + 15)
      .attr("class", "avg-value")
      .text(`${avgTS.toFixed(1)} nmi${validTS.length === 0 ? " est." : ""}`);

    // ── Hurricane label (right) ───────────────────────────────────────────────
    svg.append("text")
      .attr("x", svgWidth / 2 + 210)
      .attr("y", avgCenterY - 10)
      .attr("class", "avg-label-hur")
      .text("○ Hurricane force diameter");

    svg.append("text")
      .attr("x", svgWidth / 2 + 210)
      .attr("y", avgCenterY + 15)
      .attr("class", "avg-value")
      .text(`${avgHur.toFixed(1)} nmi${validHur.length === 0 ? " est." : ""}`);

    // ── Avg Wind Speed label (centered, below circles) ───────────────────────
    // Extra gap so it sits clearly beneath the TS ring with breathing room
    const windLabelY = avgCenterY + avgTSRadius + 52;
    const windColor = "#d97706"; // amber-orange — distinct from teal and coral
    const windCenterX = svgWidth / 2;

    // Icon is 20px wide + 8px gap + label ~90px = ~118px total → start at center - 59
    const windRowStartX = windCenterX - 59;

    // Wind icon + label: vertically centered as a unit
    // Icon is 18px tall, label line-height ~14px → center icon at label midpoint
    const iconH = 18;
    const labelLineH = 14;
    const blockH = Math.max(iconH, labelLineH);
    const iconTopY = windLabelY - blockH / 2 - 1;
    const labelMidY = windLabelY - blockH / 2 + labelLineH * 0.75;

    const windIconG = svg.append("g")
      .attr("transform", `translate(${windRowStartX}, ${iconTopY})`);

    // Top line + small curl upward at right end
    windIconG.append("path")
      .attr("d", "M0 3 L13 3 Q17 3 17 0.5 Q17 -1.5 14.5 -1.5 Q12 -1.5 12 1")
      .attr("fill", "none")
      .attr("stroke", windColor)
      .attr("stroke-width", 1.8)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round");

    // Middle line + curl downward at right end (longest)
    windIconG.append("path")
      .attr("d", "M0 8 L16 8 Q20 8 20 11 Q20 14 17 14 Q14 14 14 11")
      .attr("fill", "none")
      .attr("stroke", windColor)
      .attr("stroke-width", 1.8)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round");

    // Bottom line + curl downward at right end (shorter)
    windIconG.append("path")
      .attr("d", "M0 13 L10 13 Q14 13 14 16 Q14 19 11 19 Q8 19 8 16")
      .attr("fill", "none")
      .attr("stroke", windColor)
      .attr("stroke-width", 1.8)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round");

    // "Avg wind speed" label — vertically centered with icon, 10px gap after icon
    svg.append("text")
      .attr("x", windRowStartX + 26)
      .attr("y", labelMidY)
      .attr("class", "avg-label-wind")
      .text("Avg wind speed");

    // Value — centered below, with consistent spacing
    svg.append("text")
      .attr("x", windCenterX)
      .attr("y", windLabelY + blockH / 2 + 16)
      .attr("text-anchor", "middle")
      .attr("class", "avg-value")
      .text(`${avgWind.toFixed(1)} kt`);

    // ── Section divider ───────────────────────────────────────────────────────
    svg.append("line")
      .attr("class", "section-divider")
      .attr("x1", 20)
      .attr("x2", svgWidth - 20)
      .attr("y1", 295)
      .attr("y2", 295);

    svg.append("text")
      .attr("class", "grid-title")
      .attr("x", svgWidth / 2)
      .attr("y", 330)
      .attr("text-anchor", "middle")
      .text(`Storms in the ${selectedDecade}s`);

    // ── Storm cards grid ──────────────────────────────────────────────────────
    const gridWidth = columns * cardW + (columns - 1) * gapX;
    const gridLeft = (svgWidth - gridWidth) / 2;

    decadeData.forEach((d, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);

      const x = gridLeft + col * (cardW + gapX);
      const y = gridTop + row * (cardH + gapY);

      const cx = x + cardW / 2;
      const cy = y + 105;

      const tsDiameter = d.tropicalstorm_force_diameter !== null
        ? d.tropicalstorm_force_diameter
        : estimateDiameterFromWind(d.wind, "ts");

      const hurDiameter = d.hurricane_force_diameter !== null
        ? d.hurricane_force_diameter
        : estimateDiameterFromWind(d.wind, "hur");

      const tsR = rScale(tsDiameter);
      const hurR = rScale(hurDiameter);

      const g = svg.append("g")
        .attr("class", "storm-group");

      g.append("rect")
        .attr("class", "storm-card-bg")
        .attr("x", x)
        .attr("y", y)
        .attr("width", cardW)
        .attr("height", cardH)
        .attr("rx", 14);

      g.append("text")
        .attr("class", "card-name")
        .attr("x", cx)
        .attr("y", y + 28)
        .attr("text-anchor", "middle")
        .text(d.name);

      g.append("text")
        .attr("class", "card-year")
        .attr("x", cx)
        .attr("y", y + 45)
        .attr("text-anchor", "middle")
        .text(d.start.getFullYear());

      g.append("circle")
        .attr("class", "ts-circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", tsR)
        .attr("fill", "rgba(45,212,191,0.15)")
        .attr("stroke", "#2dd4bf")
        .attr("stroke-width", 1.2)
        .attr("stroke-dasharray", d.tropicalstorm_force_diameter === null ? "4 4" : "6 6")
        .attr("fill-opacity", 0.22)
        .attr("stroke-opacity", 0.9);

      g.append("circle")
        .attr("class", "hur-circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", hurR)
        .attr("fill", "rgba(251,113,133,0.2)")
        .attr("stroke", "#fb7185")
        .attr("stroke-width", 1.2)
        .attr("stroke-dasharray", d.hurricane_force_diameter === null ? "4 4" : "6 6")
        .attr("fill-opacity", 0.28)
        .attr("stroke-opacity", 0.9);

      g.append("circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", 3)
        .attr("fill", "#fb7185");

      g.append("text")
        .attr("class", "card-stat")
        .attr("x", cx)
        .attr("y", y + cardH - 34)
        .attr("text-anchor", "middle")
        .text(`${d.wind.toFixed(1)} kt`);

      if (d.pressure !== null) {
        g.append("text")
          .attr("class", "card-pressure")
          .attr("x", cx)
          .attr("y", y + cardH - 17)
          .attr("text-anchor", "middle")
          .text(`${d.pressure.toFixed(1)} mb`);
      }

      g.on("mousemove", event => {
        const pressureLine = d.pressure !== null
          ? `<div class="tt-row"><span>pressure</span><span>${d.pressure.toFixed(1)} mb</span></div>`
          : "";

        const hurLine = d.hurricane_force_diameter !== null
          ? `<div class="tt-row"><span class="tt-label-hur">● hur. diam.</span><span>${d.hurricane_force_diameter.toFixed(1)} nmi</span></div>`
          : `<div class="tt-row"><span class="tt-label-hur">● hur. diam.</span><span>${hurDiameter.toFixed(1)} nmi est.</span></div>`;

        const tsLine = d.tropicalstorm_force_diameter !== null
          ? `<div class="tt-row"><span class="tt-label-ts">● ts. diam.</span><span>${d.tropicalstorm_force_diameter.toFixed(1)} nmi</span></div>`
          : `<div class="tt-row"><span class="tt-label-ts">● ts. diam.</span><span>${tsDiameter.toFixed(1)} nmi est.</span></div>`;

        tooltip.innerHTML = `
          <div class="tt-name">${d.name}</div>
          <div class="tt-row"><span>start</span><span>${fmtDate(d.start)}</span></div>
          <div class="tt-row"><span>end</span><span>${fmtDate(d.end)}</span></div>
          <div class="tt-row"><span>duration</span><span>${d.duration_days ? d.duration_days.toFixed(1) : "missing"} days</span></div>
          <div class="tt-row"><span>max wind</span><span>${d.wind.toFixed(1)} kt</span></div>
          ${pressureLine}
          ${hurLine}
          ${tsLine}
        `;

        tooltip.style.display = "block";
        tooltip.style.left = `${event.clientX + 16}px`;
        tooltip.style.top = `${event.clientY - 20}px`;
      });

      g.on("mouseleave", () => {
        tooltip.style.display = "none";
      });
    });
  }

  slider.addEventListener("input", () => {
    const selectedDecade = decades[+slider.value];
    decadeLabel.textContent = `${selectedDecade}s`;
    render(selectedDecade);
  });

  window.addEventListener("resize", () => {
    const selectedDecade = decades[+slider.value];
    render(selectedDecade);
  });

  slider.min = 0;
  slider.max = decades.length - 1;
  slider.step = 1;
  slider.value = 0;

  decadeLabel.textContent = "1970s";
  render(1970);
}).catch(error => {
  console.error("Error loading or drawing storm timeline:", error);
});


