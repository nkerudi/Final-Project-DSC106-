import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
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
  const marginBottom = 73;
  const marginLeft = 28;
  const marginRight = 28;

  const n = DATA.length;
  const axisY = marginTop + MAX_R + 8;
  const svgHeight = axisY + MAX_R + marginBottom + 10;
  const svgWidth = marginLeft + n * STEP + marginRight;

  const maxTSDiam = d3.max(DATA, d => d.tropicalstorm_force_diameter);
  const rScale = d3.scaleSqrt().domain([0, maxTSDiam]).range([MIN_R, MAX_R]);

  const svg = d3.select("#chart")
    .attr("width", svgWidth)
    .attr("height", svgHeight)
    .attr("viewBox", `0 0 ${svgWidth} ${svgHeight}`);

  svg.append("line")
    .attr("class", "axis-line")
    .attr("x1", marginLeft)
    .attr("x2", svgWidth - marginRight)
    .attr("y1", axisY)
    .attr("y2", axisY);

  DATA.forEach((d, i) => {
    const cx = marginLeft + i * STEP + STEP / 2;
    const cy = axisY;

    const g = svg.append("g")
      .attr("class", "storm-group")
      .attr("transform", `translate(${cx}, ${cy})`);

    const tsR = rScale(d.tropicalstorm_force_diameter);
    const hurR = d.hurricane_force_diameter > 0 ? rScale(d.hurricane_force_diameter) : 0;

    g.append("circle")
      .attr("class", "ts-circle")
      .attr("r", tsR)
      .attr("fill", "rgba(45,212,191,0.15)")
      .attr("stroke", "#2dd4bf");

    if (hurR > 0) {
      g.append("circle")
        .attr("class", "hur-circle")
        .attr("r", hurR)
        .attr("fill", "rgba(251,113,133,0.2)")
        .attr("stroke", "#fb7185");
    }

    g.append("text")
      .attr("y", MAX_R + 20)
      .attr("text-anchor", "middle")
      .attr("fill", "#8892a4")
      .attr("font-size", "9px")
      .text(d.name);
  });
});