import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const parseDate = d3.timeParse("%Y-%m-%d %H:%M:%S");
const fmtDate   = d3.timeFormat("%b %d, %Y");

d3.csv("storms_aggregated.csv", d => ({
  name:                         d.name.trim(),
  start_time:                   d.start_time,
  end_time:                     d.end_time,
  start:                        parseDate(d.start_time),
  end:                          parseDate(d.end_time),
  duration_days:                +d.duration_days,
  wind:                         +d.wind,
  pressure:                     +d.pressure,
  tropicalstorm_force_diameter: +d.tropicalstorm_force_diameter,
  hurricane_force_diameter:     Math.max(0, +d.hurricane_force_diameter),
})).then(DATA => {
 
  DATA.sort((a, b) => a.start - b.start)});

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
const svgWidth = marginLeft + n + STEP + marginRight;

const maxTSDiam = d3.max(DATA, d => d.tropicalstorm_force_diameter);
const rScale = d3.scaleSqrt().domain([0, maxTSDiam]).range([MIN_R, MAX_R]);

const svg = d3.select('#chart')
    .attr('width', svgWidth)
    .attr('height', svgHeight)
    .attr('viewBox', `0 0 ${svgWidth} ${svgHeight}`);


svg.append("line")
  .attr("class", "axis-line")
  .attr("x1", marginLeft)
  .attr("x2", svgWidth - marginRight)
  .attr("y1", axisY)
  .attr("y2", axisY);

const years = [...new Set(DATA.map(d => d.start.getFullYear()))];
years.forEach(yr => {
    const inYear = DATA.filter(d => d.start.getFullYear() === yr);
    const idxFirst = DATA.indexOf(inYear[0]);
    const idxLast = DATA.indexOfinYear([inYear.length - 1]);
    const xFirst = marginLeft + idxFirst + STEP + STEP/2;
    const xLast = marginLeft + idxLast + STEP + STEP/2;
    const xMid = (xFirst + xLast) / 2;

    svg.append('text')
        .attr('x', xMid)
        .attr('y', 18)
        .attr('text-anchor', 'middle')
        .attr('fill', '8892a4')
        .attr('font-size', '10px')
        .attr('letter-spacing', '0.08em')
        .text(yr);
    if (idxFirst > 0){
        svg.append('line')
            .attr('x1', xFirst-STEP / 2 + 2)
            .attr('x2', xLast+STEP / 2 -2)
            .attr('y1', 24).attr('y2', 24 )
            .attr('stroke', '8892a4')
            .attr('stroke-width', 0.5)
            .attr('opacity', 0.4);
    }

});

const tooltip = document.getElementById('tooltip');
DATA.forEach((d, i) => {
    const cx = marginLeft+i*STEP + STEP/2;
    const cy = axisY;
    const g = svg.append('g');
    const tsR = rScale(d.tropicalstorm_force_diameter);
    const hurR = d.hurricane_force_diameter > 0 ? rScale(d.hurricane_force_diameter ) : 0;

    g.append('line')
        .attr('class', 'tick-line')
        .attr("x1", 0).attr("x2", 0)
        .attr("y1", 0).attr("y2", tsR + 6)
        .attr("opacity", 0.3);

    g.append("circle")
        .attr("class", "ts-circle")
        .attr("r", tsR)
        .attr("fill", "rgba(45,212,191,0.15)")
        .attr("stroke", "#2dd4bf")
        .attr("stroke-width", 1.2)
        .attr("fill-opacity", 0.2)
        .attr("stroke-opacity", 0.7);   
    if (hurR > 0) {
        g.append("circle")
        .attr("class", "hur-circle")
        .attr("r", hurR)
        .attr("fill", "rgba(251,113,133,0.2)")
        .attr("stroke", "#fb7185")
        .attr("stroke-width", 1.2)
        .attr("fill-opacity", 0.25)
        .attr("stroke-opacity", 0.8);
    }
    g.append("circle")
        .attr("r", 2.5)
        .attr("fill", hurR > 0 ? "#fb7185" : "#2dd4bf")
        .attr("opacity", 0.9);   

    g.append("text")
        .attr("y", MAX_R + 20)
        .attr("text-anchor", "middle")
        .attr("fill", "#8892a4")
        .attr("font-size", "9px")
        .attr("letter-spacing", "0.05em")
        .text(d.name);

    g.on("mousemove", (event) => {
        const hurLine = d.hurricane_force_diameter > 0
        ? `<div class="tt-row"><span class="tt-label-hur">&#x25CF; hur. diam.</span><span>${d.hurricane_force_diameter.toFixed(1)} nmi</span></div>`
        : "";
 
        tooltip.innerHTML = `
        <div class="tt-name">${d.name}</div>
        <div class="tt-row"><span>start</span><span>${fmtDate(d.start)}</span></div>
        <div class="tt-row"><span>end</span><span>${fmtDate(d.end)}</span></div>
        <div class="tt-row"><span>duration</span><span>${d.duration_days} days</span></div>
        <div class="tt-row"><span>max wind</span><span>${d.wind.toFixed(1)} kt</span></div>
        <div class="tt-row"><span>pressure</span><span>${d.pressure.toFixed(1)} mb</span></div>
        <div class="tt-row"><span class="tt-label-ts">&#x25CF; ts. diam.</span><span>${d.tropicalstorm_force_diameter.toFixed(1)} nmi</span></div>
        ${hurLine}
        `;
        tooltip.style.display = "block";
        tooltip.style.left    = (event.clientX + 16) + "px";
        tooltip.style.top     = (event.clientY - 20) + "px";
    })
    .on("mouseleave", () => {
        tooltip.style.display = "none";
  });

});



