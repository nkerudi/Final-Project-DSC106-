const parseDate = d3.timeParse("%Y-%m-%d %H:%M:%S");

// Paths from hurricane.svg — 2000×2000 viewBox, hurricane centered at ~(1000,1000)
const HURR_SPIRAL_D = "M 512.117188 1083.03125 C 367.824219 931.109375 336.296875 791.679688 333.203125 776.460938 C 330.816406 759.921875 315.734375 748.128906 298.992188 749.949219 C 281.882812 751.808594 269.519531 767.191406 271.382812 784.300781 L 271.476562 784.289062 C 308.148438 1121.050781 462.355469 1421.617188 828.011719 1464 C 626.050781 1512.640625 490.164062 1471.40625 473.441406 1465.878906 C 457.8125 1459.324219 439.753906 1466.480469 432.886719 1482.050781 C 425.945312 1497.800781 433.085938 1516.195312 448.835938 1523.136719 L 448.886719 1523.097656 C 761.746094 1661 1097.421875 1674.855469 1315.75 1380.933594 C 1257.558594 1577.976562 1155.609375 1675.082031 1140.589844 1688.585938 C 1126.699219 1698.753906 1123.691406 1718.257812 1133.859375 1732.144531 C 1144.019531 1746.027344 1163.53125 1749.042969 1177.410156 1738.875 L 1177.398438 1738.851562 C 1453.21875 1536.871094 1633.019531 1253.054688 1487.800781 917.039062 C 1632.101562 1068.960938 1663.621094 1208.402344 1666.71875 1223.617188 C 1669.101562 1240.15625 1684.191406 1251.953125 1700.929688 1250.132812 C 1718.039062 1248.269531 1730.398438 1232.886719 1728.539062 1215.777344 L 1728.441406 1215.789062 C 1691.429688 875.871094 1535.601562 578.25 1171.910156 536.078125 C 1373.859375 487.441406 1509.738281 528.671875 1526.46875 534.199219 C 1542.101562 540.761719 1560.160156 533.601562 1567.03125 518.03125 C 1573.96875 502.28125 1566.828125 483.878906 1551.078125 476.941406 L 1551.03125 476.980469 C 1238.171875 339.078125 902.492188 325.230469 684.171875 619.148438 C 742.363281 422.109375 844.308594 325 859.328125 311.488281 C 873.214844 301.328125 876.230469 281.820312 866.0625 267.941406 C 855.894531 254.050781 836.394531 251.039062 822.507812 261.210938 L 822.523438 261.230469 C 546.695312 463.210938 366.90625 747.019531 512.117188 1083.03125";
const HURR_EYE_D    = "M 943.753906 790.171875 C 890.960938 804.320312 843.46875 838.28125 813.382812 888.808594 C 812.8125 889.640625 812.269531 890.5 811.757812 891.378906 L 811.867188 891.539062 C 781.859375 943.519531 775.734375 1002.65625 790.09375 1056.246094 C 804.238281 1109.042969 838.199219 1156.53125 888.726562 1186.621094 C 889.554688 1187.1875 890.414062 1187.730469 891.300781 1188.242188 L 891.457031 1188.132812 C 943.4375 1218.144531 1002.570312 1224.269531 1056.160156 1209.90625 C 1108.960938 1195.765625 1156.449219 1161.800781 1186.539062 1111.273438 C 1187.109375 1110.445312 1187.648438 1109.585938 1188.160156 1108.699219 L 1188.050781 1108.546875 C 1218.058594 1056.5625 1224.191406 997.429688 1209.828125 943.839844 C 1195.679688 891.039062 1161.71875 843.550781 1111.191406 813.460938 C 1110.359375 812.890625 1109.5 812.351562 1108.621094 811.839844 L 1108.460938 811.949219 C 1056.480469 781.941406 997.34375 775.808594 943.753906 790.171875";

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
          const tsR  = Math.max(12, (d.avgTS  / maxAvgTS) * TOOLTIP_MAX_R);
          const hurR = Math.max(8,  (d.avgHur / maxAvgTS) * TOOLTIP_MAX_R);

          const baseSpd = Math.max(0.6, 2.5 - (d.avgTS / maxAvgTS) * 1.8);
          const tsSpd  = (baseSpd * 1.40).toFixed(2);
          const hurSpd = (baseSpd * 0.85).toFixed(2);
          const tsSz  = Math.max(28, Math.round(tsR  / TOOLTIP_MAX_R * 110));
          const hurSz = Math.max(16, Math.round(hurR / TOOLTIP_MAX_R * 90));
          const svgH  = Math.max(tsSz, hurSz);
          const svgW  = tsSz + hurSz + 12;
          const tsOffY = Math.round((svgH - tsSz) / 2);
          const hurOffY= Math.round((svgH - hurSz) / 2);

          const circleSvg = `
            <svg width="${svgW}" height="${svgH}"
                 style="display:block;margin:4px auto 10px">
              <svg x="0" y="${tsOffY}" width="${tsSz}" height="${tsSz}" viewBox="260 260 1480 1480">
                <g>
                  <path fill-rule="evenodd" fill="#0891b2" d="${HURR_SPIRAL_D}"/>
                  <path fill="white" d="${HURR_EYE_D}"/>
                  <animateTransform attributeName="transform" type="rotate"
                    from="0 1000 1000" to="360 1000 1000"
                    dur="${tsSpd}s" repeatCount="indefinite"/>
                </g>
              </svg>
              <svg x="${tsSz + 12}" y="${hurOffY}" width="${hurSz}" height="${hurSz}" viewBox="260 260 1480 1480">
                <g>
                  <path fill-rule="evenodd" fill="#e11d48" d="${HURR_SPIRAL_D}"/>
                  <path fill="white" d="${HURR_EYE_D}"/>
                  <animateTransform attributeName="transform" type="rotate"
                    from="0 1000 1000" to="360 1000 1000"
                    dur="${hurSpd}s" repeatCount="indefinite"/>
                </g>
              </svg>
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

// ── Mini charts: max_wind, min_pressure, duration ───────────────────────────

function renderMiniChart(svgId, containerId, yearData, valueKey, yLabel, color, yFormat, nameKey) {
  const svg = d3.select(`#${svgId}`);
  const tooltipEl = document.getElementById("tooltip");

  function render() {
    svg.selectAll("*").remove();
    const containerWidth = document.getElementById(containerId).clientWidth;
    const margin = { top: 16, right: 16, bottom: 36, left: 56 };
    const svgWidth  = Math.max(200, containerWidth - 8);
    const svgHeight = 180;
    const W = svgWidth  - margin.left - margin.right;
    const H = svgHeight - margin.top  - margin.bottom;

    svg.attr("width", svgWidth).attr("height", svgHeight)
       .attr("viewBox", `0 0 ${svgWidth} ${svgHeight}`);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear()
      .domain(d3.extent(yearData, d => d.year))
      .range([0, W]);

    const [yMin, yMax] = d3.extent(yearData, d => d[valueKey]);
    const yPad = (yMax - yMin) * 0.12 || 1;
    const yScale = d3.scaleLinear()
      .domain([yMin - yPad, yMax + yPad])
      .range([H, 0]);

    g.append("g")
      .call(d3.axisLeft(yScale).ticks(4).tickSize(-W).tickFormat(""))
      .call(ax => {
        ax.select(".domain").remove();
        ax.selectAll("line").attr("stroke", "#e1e8f0").attr("stroke-dasharray", "3,3");
      });

    g.append("g").attr("transform", `translate(0,${H})`)
      .call(d3.axisBottom(xScale).ticks(6).tickFormat(d3.format("d")).tickSize(0))
      .call(ax => ax.select(".domain").attr("stroke", "#e1e8f0"))
      .selectAll("text")
      .attr("fill", "#526173").attr("font-size", "10px").attr("dy", "1.4em");

    g.append("g")
      .call(d3.axisLeft(yScale).ticks(4).tickFormat(yFormat))
      .call(ax => ax.select(".domain").remove())
      .selectAll("text")
      .attr("fill", "#526173").attr("font-size", "10px");

    // Regression line
    const regMx  = d3.mean(yearData, d => d.year);
    const regMy  = d3.mean(yearData, d => d[valueKey]);
    const regNum = d3.sum(yearData, d => (d.year - regMx) * (d[valueKey] - regMy));
    const regDen = d3.sum(yearData, d => (d.year - regMx) ** 2);
    const slope     = regDen ? regNum / regDen : 0;
    const intercept = regMy - slope * regMx;
    const x0 = yearData[0].year, x1 = yearData[yearData.length - 1].year;
    g.append("line")
      .attr("x1", xScale(x0)).attr("x2", xScale(x1))
      .attr("y1", yScale(slope * x0 + intercept))
      .attr("y2", yScale(slope * x1 + intercept))
      .attr("stroke", color).attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "6 4").attr("opacity", 0.3);

    g.append("path").datum(yearData)
      .attr("fill", "none").attr("stroke", color).attr("stroke-width", 2)
      .attr("d", d3.line()
        .x(d => xScale(d.year))
        .y(d => yScale(d[valueKey]))
        .curve(d3.curveMonotoneX));

    g.selectAll(null).data(yearData).join("circle")
      .attr("cx", d => xScale(d.year)).attr("cy", d => yScale(d[valueKey]))
      .attr("r", 2.5).attr("fill", color)
      .attr("stroke", "#fff").attr("stroke-width", 1);

    const hoverLine = g.append("line")
      .attr("stroke", "#94a3b8").attr("stroke-width", 1).attr("stroke-dasharray", "4,3")
      .attr("y1", 0).attr("y2", H).style("opacity", 0);

    const hoverDot = g.append("circle")
      .attr("r", 5).attr("fill", color)
      .attr("stroke", "#fff").attr("stroke-width", 2).style("opacity", 0);

    const bisect = d3.bisector(d => d.year).left;

    g.append("rect")
      .attr("width", W).attr("height", H)
      .attr("fill", "none").attr("pointer-events", "all")
      .on("mousemove", event => {
        const [mouseX] = d3.pointer(event);
        const year = xScale.invert(mouseX);
        const i  = bisect(yearData, year, 1);
        const d0 = yearData[i - 1], d1 = yearData[i];
        const d  = !d0 ? d1 : !d1 ? d0 : (year - d0.year > d1.year - year ? d1 : d0);
        if (!d) return;
        const x = xScale(d.year);
        hoverLine.attr("x1", x).attr("x2", x).style("opacity", 1);
        hoverDot.attr("cx", x).attr("cy", yScale(d[valueKey])).style("opacity", 1);
        tooltipEl.innerHTML = `
          <div class="tt-name">${d.year}</div>
          <div class="tt-row"><span>${yLabel}</span><span>${yFormat(d[valueKey])}</span></div>
          ${nameKey && d[nameKey] ? `<div class="tt-subrow">storm: ${d[nameKey]}</div>` : ''}
          <div class="tt-row"><span>storms</span><span>${d.count}</span></div>`;
        const ttW  = tooltipEl.offsetWidth  || 180;
        const ttH  = tooltipEl.offsetHeight || 80;
        let left   = event.clientX + 18, top = event.clientY - 20;
        if (left + ttW > window.innerWidth  - 8) left = event.clientX - ttW - 18;
        if (top  + ttH > window.innerHeight - 8) top  = window.innerHeight - ttH - 8;
        tooltipEl.style.display = "block";
        tooltipEl.style.left    = `${left}px`;
        tooltipEl.style.top     = `${top}px`;
      })
      .on("mouseleave", () => {
        tooltipEl.style.display = "none";
        hoverLine.style("opacity", 0);
        hoverDot.style("opacity", 0);
      });
  }

  render();
  window.addEventListener("resize", render);
}

d3.csv("../../data/storm/storms_aggregated_clean.csv", d => ({
  name:         d.name ? d.name.trim() : null,
  year:         +d.year,
  max_wind:     +d.max_wind > 0      ? +d.max_wind     : null,
  min_pressure: +d.min_pressure > 0  ? +d.min_pressure : null,
  duration_days: +d.duration_days > 0 ? +d.duration_days : null
})).then(clean => {
  clean = clean.filter(d => d.year);

  const yearClean = d3.groups(clean, d => d.year)
    .map(([year, storms]) => {
      const windValid     = storms.filter(d => d.max_wind     != null);
      const pressValid    = storms.filter(d => d.min_pressure != null);
      const durationValid = storms.filter(d => d.duration_days != null);
      const topWind       = d3.greatest(windValid,  d => d.max_wind);
      const topPressure   = d3.least(pressValid,    d => d.min_pressure);
      return {
        year,
        count:         storms.length,
        max_wind:      topWind     ? topWind.max_wind         : null,
        wind_name:     topWind     ? topWind.name             : null,
        min_pressure:  topPressure ? topPressure.min_pressure : null,
        pressure_name: topPressure ? topPressure.name         : null,
        avg_duration:  d3.mean(durationValid, d => d.duration_days)
      };
    })
    .sort((a, b) => a.year - b.year);

  renderMiniChart(
    "chart-wind", "wind-container",
    yearClean.filter(d => d.max_wind != null),
    "max_wind", "peak wind", "#d97706",
    d => `${Math.round(d)} kt`, "wind_name"
  );
  renderMiniChart(
    "chart-pressure", "pressure-container",
    yearClean.filter(d => d.min_pressure != null),
    "min_pressure", "min pressure", "#7c3aed",
    d => `${Math.round(d)} mb`, "pressure_name"
  );
  renderMiniChart(
    "chart-duration", "duration-container",
    yearClean.filter(d => d.avg_duration != null),
    "avg_duration", "avg duration", "#059669",
    d => `${d.toFixed(1)} d`
  );
}).catch(err => console.error("Error loading clean storm data:", err));
