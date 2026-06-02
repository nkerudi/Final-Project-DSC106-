const parseDate = d3.timeParse("%Y-%m-%d %H:%M:%S");
const fmtDate = d3.timeFormat("%b %d, %Y");

function cleanNumber(value, missingCodes = []) {
  const num = +value;
  if (Number.isNaN(num)) return null;
  if (missingCodes.includes(num)) return null;
  if (num < 0) return null;
  return num;
}

d3.csv("./storms_aggregated.csv", d => {
  const start = parseDate(d.start_time);
  const end = parseDate(d.end_time);

  const year = start ? start.getFullYear() : null;

  return {
    name: d.name ? d.name.trim() : "Unknown",
    year: year,

    start: start,
    end: end,

    duration_days: +d.duration_days || null,

    wind: cleanNumber(d.wind),
    pressure: cleanNumber(d.pressure, [-999]),

    tropicalstorm_force_diameter: cleanNumber(
      d.tropicalstorm_force_diameter,
      [-1998]
    ),

    hurricane_force_diameter: cleanNumber(
      d.hurricane_force_diameter,
      [-1998]
    )
  };
}).then(DATA => {
  DATA = DATA.filter(d =>
    d.year &&
    d.wind !== null
  );

  DATA.sort((a, b) => a.start - b.start);

  const decades = [1970, 1980, 1990, 2000, 2010, 2020];

  const STEP = 88;
  const MAX_R = 38;
  const MIN_R = 4;
  const marginTop = 60;
  const marginBottom = 90;
  const marginLeft = 40;
  const marginRight = 40;

  const axisY = marginTop + MAX_R + 25;
  const svgHeight = axisY + MAX_R + marginBottom;

  const maxDiameter = d3.max(DATA, d => d.tropicalstorm_force_diameter);

  const rScale = d3.scaleSqrt()
    .domain([0, maxDiameter])
    .range([MIN_R, MAX_R]);



    
  const maxWind = d3.max(DATA, d => d.wind);

  const windScale = d3.scaleSqrt()
    .domain([0, maxWind])
    .range([MIN_R, MAX_R * 0.75]);

  const svg = d3.select("#chart");
  const tooltip = document.getElementById("tooltip");
  const slider = document.getElementById("decade-slider");
  const decadeLabel = document.getElementById("decade-label");

  function getDecade(year) {
    return Math.floor(year / 10) * 10;
  }

  function render(selectedDecade) {
    const decadeData = DATA.filter(
      d => getDecade(d.start.getFullYear()) === selectedDecade
    );

    svg.selectAll("*").remove();

    const n = decadeData.length;
    const svgWidth = Math.max(900, marginLeft + n * STEP + marginRight);

    svg
      .attr("width", svgWidth)
      .attr("height", svgHeight)
      .attr("viewBox", `0 0 ${svgWidth} ${svgHeight}`);

    svg.append("text")
      .attr("x", svgWidth / 2)
      .attr("y", 20)
      .attr("text-anchor", "middle")
      .attr("fill", "#8892a4")
      .attr("font-size", "12px")
      .attr("letter-spacing", "0.08em")
      .text(`${selectedDecade}s`);

    svg.append("line")
      .attr("class", "axis-line")
      .attr("x1", marginLeft)
      .attr("x2", svgWidth - marginRight)
      .attr("y1", axisY)
      .attr("y2", axisY);

    if (decadeData.length === 0) {
      svg.append("text")
        .attr("x", svgWidth / 2)
        .attr("y", axisY)
        .attr("text-anchor", "middle")
        .attr("fill", "#8892a4")
        .attr("font-size", "13px")
        .text("No storms available for this decade");
      return;
    }

    decadeData.forEach((d, i) => {
      const cx = marginLeft + i * STEP + STEP / 2;
      const cy = axisY;

      const tsR = d.tropicalstorm_force_diameter !== null
        ? rScale(d.tropicalstorm_force_diameter)
        : windScale(d.wind);
      const hurR = d.hurricane_force_diameter !== null
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
        .attr("stroke-dasharray", d.tropicalstorm_force_diameter === null ? "4 4" : "none")
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

      g.append("text")
        .attr("y", MAX_R + 38)
        .attr("text-anchor", "middle")
        .attr("fill", "#5f6b7c")
        .attr("font-size", "8px")
        .text(d.start.getFullYear());

      g.on("mousemove", event => {
        const pressureText = d.pressure !== null
          ? `${d.pressure.toFixed(1)} mb`
          : "missing";

        const hurLine = d.hurricane_force_diameter !== null
          ? `<div class="tt-row"><span class="tt-label-hur">● hur. diam.</span><span>${d.hurricane_force_diameter.toFixed(1)} nmi</span></div>`
          : "";
        const tsLine = d.tropicalstorm_force_diameter !== null 
          ? `<div class="tt-row"><span class="tt-label-ts">● ts. diam.</span><span>${d.tropicalstorm_force_diameter.toFixed(1)} nmi</span></div>`
          : `<div class="tt-row"><span class="tt-label-ts">● size estimate</span><span>based on wind</span></div>`;

        tooltip.innerHTML = `
          <div class="tt-name">${d.name}</div>
          <div class="tt-row"><span>start</span><span>${fmtDate(d.start)}</span></div>
          <div class="tt-row"><span>end</span><span>${fmtDate(d.end)}</span></div>
          <div class="tt-row"><span>duration</span><span>${d.duration_days.toFixed(1)} days</span></div>
          <div class="tt-row"><span>max wind</span><span>${d.wind.toFixed(1)} kt</span></div>
          <div class="tt-row"><span>pressure</span><span>${pressureText}</span></div>
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

  slider.min = 0;
  slider.max = decades.length - 1;
  slider.step = 1;
  slider.value = 0;

  decadeLabel.textContent = "1970s";
  render(1970);
}).catch(error => {
  console.error("Error loading or drawing storm timeline:", error);
});