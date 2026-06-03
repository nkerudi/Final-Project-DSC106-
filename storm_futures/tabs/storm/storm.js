const parseDate = d3.timeParse("%Y-%m-%d %H:%M:%S");

function cleanNumber(value, missingCodes = []) {
  const num = +value;
  if (Number.isNaN(num)) return null;
  if (missingCodes.includes(num)) return null;
  if (num < 0) return null;
  return num;
}

d3.csv("../../data/storm/storms_aggregated.csv", d => {
  const start = parseDate(d.start_time);
  const year = start ? start.getFullYear() : null;
  return {
    name:  d.name ? d.name.trim() : "Unknown",
    year,
    start,
    wind: cleanNumber(d.wind),
    tropicalstorm_force_diameter: cleanNumber(d.tropicalstorm_force_diameter, [-1998]),
    hurricane_force_diameter:     cleanNumber(d.hurricane_force_diameter,     [-1998])
  };
}).then(DATA => {
  DATA = DATA.filter(d => d.year && d.wind !== null);

  const maxWind     = d3.max(DATA, d => d.wind);
  const maxDiameter = d3.max(DATA, d => d.tropicalstorm_force_diameter);
  const MAX_R = 38, MIN_R = 4;

  const windScale    = d3.scaleSqrt().domain([0, maxWind || 1]).range([MIN_R, MAX_R * 0.75]);
  const inverseRScale = d3.scalePow().exponent(2).domain([MIN_R, MAX_R]).range([0, maxDiameter || 1]);

  function estimateDiameter(wind, type = "ts") {
    return inverseRScale(type === "hur" ? windScale(wind) * 0.55 : windScale(wind));
  }

  // Per-year aggregates
  const yearData = d3.groups(DATA, d => d.year)
    .map(([year, storms]) => {
      const validTS  = storms.filter(d => d.tropicalstorm_force_diameter !== null);
      const validHur = storms.filter(d => d.hurricane_force_diameter !== null);
      const avgWind  = d3.mean(storms, d => d.wind);
      const tsStorm  = d3.greatest(validTS,  d => d.tropicalstorm_force_diameter);
      const hurStorm = d3.greatest(validHur, d => d.hurricane_force_diameter);
      return {
        year,
        avgTS:      tsStorm  ? tsStorm.tropicalstorm_force_diameter  : estimateDiameter(avgWind, "ts"),
        avgHur:     hurStorm ? hurStorm.hurricane_force_diameter      : estimateDiameter(avgWind, "hur"),
        tsName:     tsStorm  ? tsStorm.name  : null,
        hurName:    hurStorm ? hurStorm.name : null,
        hasRealTS:  validTS.length  > 0,
        hasRealHur: validHur.length > 0,
        count:      storms.length
      };
    })
    .sort((a, b) => a.year - b.year);

  const maxAvgTS = d3.max(yearData, d => d.avgTS);

  const svg     = d3.select("#chart");
  const tooltip = document.getElementById("tooltip");

  function render() {
    svg.selectAll("*").remove();

    const containerWidth = document.getElementById("chart-container").clientWidth;
    const margin  = { top: 24, right: 28, bottom: 48, left: 72 };
    const svgWidth  = Math.max(600, containerWidth - 48);
    const svgHeight = 380;
    const W = svgWidth  - margin.left - margin.right;
    const H = svgHeight - margin.top  - margin.bottom;

    svg.attr("width", svgWidth).attr("height", svgHeight)
       .attr("viewBox", `0 0 ${svgWidth} ${svgHeight}`);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear()
      .domain(d3.extent(yearData, d => d.year))
      .range([0, W]);

    const yMax = d3.max(yearData, d => Math.max(d.avgTS, d.avgHur)) * 1.12;
    const yScale = d3.scaleLinear().domain([0, yMax]).range([H, 0]);

    // Gridlines
    g.append("g")
      .call(d3.axisLeft(yScale).ticks(5).tickSize(-W).tickFormat(""))
      .call(ax => {
        ax.select(".domain").remove();
        ax.selectAll("line").attr("stroke", "#e1e8f0").attr("stroke-dasharray", "3,3");
      });

    // X axis
    g.append("g").attr("transform", `translate(0,${H})`)
      .call(d3.axisBottom(xScale).ticks(10).tickFormat(d3.format("d")).tickSize(0))
      .call(ax => ax.select(".domain").attr("stroke", "#e1e8f0"))
      .selectAll("text")
      .attr("fill", "#526173").attr("font-size", "11px").attr("dy", "1.4em");

    // Y axis
    g.append("g")
      .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => `${Math.round(d)} nmi`))
      .call(ax => ax.select(".domain").remove())
      .selectAll("text")
      .attr("fill", "#526173").attr("font-size", "11px");

    // Regression helper: returns {slope, intercept} for an array of {x, y}
    function linReg(points) {
      const n  = points.length;
      const mx = d3.mean(points, p => p.x);
      const my = d3.mean(points, p => p.y);
      const num = d3.sum(points, p => (p.x - mx) * (p.y - my));
      const den = d3.sum(points, p => (p.x - mx) ** 2);
      const slope = den ? num / den : 0;
      return { slope, intercept: my - slope * mx };
    }

    // Regression lines (drawn first so they sit behind the data lines)
    for (const [key, color] of [["avgTS", "#0891b2"], ["avgHur", "#e11d48"]]) {
      const pts = yearData.map(d => ({ x: d.year, y: d[key] }));
      const { slope, intercept } = linReg(pts);
      const x0 = yearData[0].year, x1 = yearData[yearData.length - 1].year;
      g.append("line")
        .attr("x1", xScale(x0)).attr("x2", xScale(x1))
        .attr("y1", yScale(slope * x0 + intercept))
        .attr("y2", yScale(slope * x1 + intercept))
        .attr("stroke", color).attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "6 4").attr("opacity", 0.3);
    }

    // Lines
    const lineFn = key => d3.line()
      .x(d => xScale(d.year))
      .y(d => yScale(d[key]))
      .curve(d3.curveMonotoneX);

    g.append("path").datum(yearData)
      .attr("fill", "none").attr("stroke", "#0891b2").attr("stroke-width", 2.5)
      .attr("d", lineFn("avgTS"));

    g.append("path").datum(yearData)
      .attr("fill", "none").attr("stroke", "#e11d48").attr("stroke-width", 2.5)
      .attr("d", lineFn("avgHur"));

    // Static dots
    for (const [key, color] of [["avgTS", "#0891b2"], ["avgHur", "#e11d48"]]) {
      g.selectAll(null).data(yearData).join("circle")
        .attr("cx", d => xScale(d.year)).attr("cy", d => yScale(d[key]))
        .attr("r", 3).attr("fill", color)
        .attr("stroke", "#fff").attr("stroke-width", 1.2);
    }

    // Hover elements
    const hoverLine = g.append("line")
      .attr("stroke", "#94a3b8").attr("stroke-width", 1).attr("stroke-dasharray", "4,3")
      .attr("y1", 0).attr("y2", H).style("opacity", 0);

    const hoverDotTS = g.append("circle")
      .attr("r", 5.5).attr("fill", "#0891b2")
      .attr("stroke", "#fff").attr("stroke-width", 2).style("opacity", 0);

    const hoverDotHur = g.append("circle")
      .attr("r", 5.5).attr("fill", "#e11d48")
      .attr("stroke", "#fff").attr("stroke-width", 2).style("opacity", 0);

    const bisect = d3.bisector(d => d.year).left;
    let lastIdx = -1;

    function nearestPoint(year) {
      const i  = bisect(yearData, year, 1);
      const d0 = yearData[i - 1];
      const d1 = yearData[i];
      if (!d0) return d1;
      if (!d1) return d0;
      return year - d0.year > d1.year - year ? d1 : d0;
    }

    g.append("rect")
      .attr("width", W).attr("height", H)
      .attr("fill", "none").attr("pointer-events", "all")
      .on("mousemove", event => {
        const [mx] = d3.pointer(event);
        const d    = nearestPoint(xScale.invert(mx));
        if (!d) return;

        const idx = yearData.indexOf(d);
        const x   = xScale(d.year);

        hoverLine.attr("x1", x).attr("x2", x).style("opacity", 1);
        hoverDotTS.attr("cx", x).attr("cy", yScale(d.avgTS)).style("opacity", 1);
        hoverDotHur.attr("cx", x).attr("cy", yScale(d.avgHur)).style("opacity", 1);

        if (idx !== lastIdx) {
          lastIdx = idx;
          const TOOLTIP_MAX_R = 46;
          const tsR  = Math.max(5, (d.avgTS  / maxAvgTS) * TOOLTIP_MAX_R);
          const hurR = Math.max(3, (d.avgHur / maxAvgTS) * TOOLTIP_MAX_R);

          const circleSvg = `
            <svg width="110" height="110" viewBox="-55 -55 110 110"
                 style="display:block;margin:4px auto 10px">
              <circle r="${tsR.toFixed(1)}"
                fill="rgba(8,145,178,0.22)" stroke="#0891b2" stroke-width="1.5"
                stroke-dasharray="${d.hasRealTS  ? '6 6' : '4 4'}"/>
              <circle r="${hurR.toFixed(1)}"
                fill="rgba(225,29,72,0.28)" stroke="#e11d48" stroke-width="1.5"
                stroke-dasharray="${d.hasRealHur ? '6 6' : '4 4'}"/>
              <circle r="3" fill="#e11d48"/>
            </svg>`;

          tooltip.innerHTML = `
            <div class="tt-name">${d.year}</div>
            ${circleSvg}
            <div class="tt-row"><span>storms</span><span>${d.count}</span></div>
            <div class="tt-row">
              <span class="tt-label-ts">● ts. diam.</span>
              <span>${d.avgTS.toFixed(1)} nmi${d.hasRealTS ? '' : ' est.'}</span>
            </div>
            ${d.tsName ? `<div class="tt-subrow">largest: ${d.tsName}</div>` : ''}
            <div class="tt-row">
              <span class="tt-label-hur">● hur. diam.</span>
              <span>${d.avgHur.toFixed(1)} nmi${d.hasRealHur ? '' : ' est.'}</span>
            </div>
            ${d.hurName ? `<div class="tt-subrow">largest: ${d.hurName}</div>` : ''}`;
        }

        const ttW  = tooltip.offsetWidth  || 230;
        const ttH  = tooltip.offsetHeight || 210;
        let left   = event.clientX + 18;
        let top    = event.clientY - 20;
        if (left + ttW > window.innerWidth  - 8) left = event.clientX - ttW - 18;
        if (top  + ttH > window.innerHeight - 8) top  = window.innerHeight - ttH - 8;
        tooltip.style.display = "block";
        tooltip.style.left    = `${left}px`;
        tooltip.style.top     = `${top}px`;
      })
      .on("mouseleave", () => {
        lastIdx = -1;
        tooltip.style.display = "none";
        hoverLine.style("opacity", 0);
        hoverDotTS.style("opacity", 0);
        hoverDotHur.style("opacity", 0);
      });
  }

  render();
  window.addEventListener("resize", render);
}).catch(err => console.error("Error loading storm data:", err));
