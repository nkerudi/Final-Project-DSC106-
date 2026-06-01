const parseDate = d3.timeParse("%Y-%m-%d %H:%M:%S");
const fmtDate = d3.timeFormat("%b %d, %Y");

d3.csv("./storms_aggregated.csv", d => ({
  name: d.name.trim(),
  start: parseDate(d.start_time),
  end: parseDate(d.end_time),
  duration_days: +d.duration_days,
  wind: +d.wind,
  pressure: +d.pressure,
  tropicalstorm_force_diameter: +d.tropicalstorm_force_diameter,
  hurricane_force_diameter: Math.max(0, +d.hurricane_force_diameter),
})).then(DATA => {
  DATA.sort((a, b) => a.start - b.start);

  const STEP = 88;
  const MAX_R = 38;
  const MIN_R = 4;
  const marginTop = 60;
  const marginBottom = 90;
  const marginLeft = 40;
  const marginRight = 40;

  const n = DATA.length;
  const axisY = marginTop + MAX_R + 25;
  const svgHeight = axisY + MAX_R + marginBottom;
  const svgWidth = marginLeft + n * STEP + marginRight;

  const maxDiameter = d3.max(DATA, d => d.tropicalstorm_force_diameter);

  const rScale = d3.scaleSqrt()
    .domain([0, maxDiameter])
    .range([MIN_R, MAX_R]);

  const svg = d3.select("#chart")
    .attr("width", svgWidth)
    .attr("height", svgHeight)
    .attr("viewBox", `0 0 ${svgWidth} ${svgHeight}`);

  svg.selectAll("*").remove();

  svg.append("line")
    .attr("class", "axis-line")
    .attr("x1", marginLeft)
    .attr("x2", svgWidth - marginRight)
    .attr("y1", axisY)
    .attr("y2", axisY);

  const years = [...new Set(DATA.map(d => d.start.getFullYear()))];

  years.forEach(yr => {
    const stormsInYear = DATA.filter(d => d.start.getFullYear() === yr);
    const firstIndex = DATA.indexOf(stormsInYear[0]);
    const lastIndex = DATA.indexOf(stormsInYear[stormsInYear.length - 1]);

    const xFirst = marginLeft + firstIndex * STEP + STEP / 2;
    const xLast = marginLeft + lastIndex * STEP + STEP / 2;
    const xMid = (xFirst + xLast) / 2;

    svg.append("text")
      .attr("x", xMid)
      .attr("y", 20)
      .attr("text-anchor", "middle")
      .attr("fill", "#8892a4")
      .attr("font-size", "10px")
      .attr("letter-spacing", "0.08em")
      .text(yr);

    if (firstIndex > 0) {
      svg.append("line")
        .attr("x1", xFirst - STEP / 2)
        .attr("x2", xFirst - STEP / 2)
        .attr("y1", 32)
        .attr("y2", svgHeight - 25)
        .attr("stroke", "#8892a4")
        .attr("stroke-width", 0.5)
        .attr("opacity", 0.25);
    }
  });

  const tooltip = document.getElementById("tooltip");

  DATA.forEach((d, i) => {
    const cx = marginLeft + i * STEP + STEP / 2;
    const cy = axisY;

    const tsR = rScale(d.tropicalstorm_force_diameter);
    const hurR = d.hurricane_force_diameter > 0
      ? rScale(d.hurricane_force_diameter)
      : 0;

    const g = svg.append("g")
      .attr("class", "storm-group")
      .attr("transform", `translate(${cx}, ${cy})`);

    g.append("line")
      .attr("class", "tick-line")
      .attr("x1", 0)
      .attr("x2", 0)
      .attr("y1", -tsR - 8)
      .attr("y2", tsR + 8)
      .attr("opacity", 0.25);

    g.append("circle")
      .attr("class", "ts-circle")
      .attr("r", tsR)
      .attr("fill", "rgba(45,212,191,0.15)")
      .attr("stroke", "#2dd4bf")
      .attr("stroke-width", 1.2)
      .attr("fill-opacity", 0.22)
      .attr("stroke-opacity", 0.8);

    if (hurR > 0) {
      g.append("circle")
        .attr("class", "hur-circle")
        .attr("r", hurR)
        .attr("fill", "rgba(251,113,133,0.2)")
        .attr("stroke", "#fb7185")
        .attr("stroke-width", 1.2)
        .attr("fill-opacity", 0.28)
        .attr("stroke-opacity", 0.85);
    }

    g.append("circle")
      .attr("r", 2.8)
      .attr("fill", hurR > 0 ? "#fb7185" : "#2dd4bf")
      .attr("opacity", 0.95);

    g.append("text")
      .attr("y", MAX_R + 24)
      .attr("text-anchor", "middle")
      .attr("fill", "#8892a4")
      .attr("font-size", "9px")
      .attr("letter-spacing", "0.05em")
      .text(d.name);

    g.on("mousemove", event => {
      const hurLine = d.hurricane_force_diameter > 0
        ? `<div class="tt-row"><span class="tt-label-hur">● hur. diam.</span><span>${d.hurricane_force_diameter.toFixed(1)} nmi</span></div>`
        : "";

      tooltip.innerHTML = `
        <div class="tt-name">${d.name}</div>
        <div class="tt-row"><span>start</span><span>${fmtDate(d.start)}</span></div>
        <div class="tt-row"><span>end</span><span>${fmtDate(d.end)}</span></div>
        <div class="tt-row"><span>duration</span><span>${d.duration_days} days</span></div>
        <div class="tt-row"><span>max wind</span><span>${d.wind.toFixed(1)} kt</span></div>
        <div class="tt-row"><span>pressure</span><span>${d.pressure.toFixed(1)} mb</span></div>
        <div class="tt-row"><span class="tt-label-ts">● ts. diam.</span><span>${d.tropicalstorm_force_diameter.toFixed(1)} nmi</span></div>
        ${hurLine}
      `;

      tooltip.style.display = "block";
      tooltip.style.left = `${event.clientX + 16}px`;
      tooltip.style.top = `${event.clientY - 20}px`;
    });

    g.on("mouseleave", () => {
      tooltip.style.display = "none";
    });
  });
}).catch(error => {
  console.error("Error loading or drawing storm timeline:", error);
});