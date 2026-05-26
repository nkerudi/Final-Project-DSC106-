const csvPath = "data/scripts/cmip6_sst_scenarios.csv";

const svg = d3.select("#sst-chart");
const tooltip = d3.select("#tooltip");

const width = 1100;
const height = 620;

const margin = {
  top: 40,
  right: 220,
  bottom: 70,
  left: 80
};

const scenarioLabels = {
  ssp126: "Low Emissions",
  ssp245: "Moderate Emissions",
  ssp585: "High Emissions"
};

const scenarioColors = {
  ssp126: "#2563eb",
  ssp245: "#f97316",
  ssp585: "#16a34a"
};

d3.csv(csvPath, d3.autoType)
  .then(data => {
    console.log("CSV loaded:", data);

    data = data
      .filter(d => d.year != null && d.mean_sst_c != null && d.scenario)
      .sort((a, b) => a.year - b.year);

    const years = [...new Set(data.map(d => d.year))].sort((a, b) => a - b);
    const scenarios = [...new Set(data.map(d => d.scenario))];

    const minYear = d3.min(years);
    const maxYear = d3.max(years);

    const x = d3.scaleLinear()
      .domain([minYear, maxYear])
      .range([margin.left, width - margin.right]);

    const y = d3.scaleLinear()
      .domain(d3.extent(data, d => d.mean_sst_c))
      .nice()
      .range([height - margin.bottom, margin.top]);

    svg.selectAll("*").remove();

    svg.append("g")
      .attr("class", "axis x-axis")
      .attr("transform", `translate(0, ${height - margin.bottom})`)
      .call(d3.axisBottom(x).tickFormat(d3.format("d")));

    svg.append("g")
      .attr("class", "axis y-axis")
      .attr("transform", `translate(${margin.left}, 0)`)
      .call(d3.axisLeft(y).ticks(7));

    const line = d3.line()
      .x(d => x(d.year))
      .y(d => y(d.mean_sst_c))
      .curve(d3.curveMonotoneX);

    const grouped = d3.group(data, d => d.scenario);

    for (const [scenario, values] of grouped) {
      values.sort((a, b) => a.year - b.year);

      svg.append("path")
        .datum(values)
        .attr("fill", "none")
        .attr("stroke", scenarioColors[scenario] || "#555")
        .attr("stroke-width", 4)
        .attr("d", line);

      const last = values[values.length - 1];

      svg.append("text")
        .attr("x", x(last.year) -90)
        .attr("y", y(last.mean_sst_c))
        .attr("fill", scenarioColors[scenario] || "#555")
        .attr("font-size", 13)
        .attr("font-weight", 700)
        .text(scenarioLabels[scenario] || scenario);
    }

    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height - 22)
      .attr("text-anchor", "middle")
      .text("Year");

    svg.append("text")
      .attr("x", -height / 2)
      .attr("y", 24)
      .attr("transform", "rotate(-90)")
      .attr("text-anchor", "middle")
      .text("Mean Sea Surface Temperature (°C)");

    const yearMarker = svg.append("line")
      .attr("y1", margin.top)
      .attr("y2", height - margin.bottom)
      .attr("stroke", "#111827")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "6 6");

    const dotGroup = svg.append("g");

    const slider = d3.select("#year-slider");

    slider
      .attr("min", minYear)
      .attr("max", maxYear)
      .attr("step", 1)
      .attr("value", minYear);

    slider.on("input", event => {
      update(+event.target.value);
    });

    update(minYear);

    function update(selectedYear) {
      d3.select("#selected-year").text(selectedYear);

      yearMarker
        .attr("x1", x(selectedYear))
        .attr("x2", x(selectedYear));

      const selectedData = scenarios.map(scenario => {
        const scenarioData = data.filter(d => d.scenario === scenario);

        return scenarioData.reduce((best, current) => {
          return Math.abs(current.year - selectedYear) < Math.abs(best.year - selectedYear)
            ? current
            : best;
        });
      });

      const dots = dotGroup.selectAll("circle")
        .data(selectedData, d => d.scenario);

      dots.enter()
        .append("circle")
        .attr("r", 8)
        .attr("stroke", "white")
        .attr("stroke-width", 2)
        .attr("fill", d => scenarioColors[d.scenario] || "#555")
        .on("mouseover", function(event, d) {
          tooltip
            .style("opacity", 1)
            .html(`
              <strong>${scenarioLabels[d.scenario] || d.scenario}</strong><br>
              Year: ${d.year}<br>
              Mean SST: ${d.mean_sst_c.toFixed(2)} °C
            `);
        })
        .on("mousemove", function(event) {
          tooltip
            .style("left", `${event.pageX + 14}px`)
            .style("top", `${event.pageY - 20}px`);
        })
        .on("mouseout", function() {
          tooltip.style("opacity", 0);
        })
        .merge(dots)
        .attr("cx", d => x(d.year))
        .attr("cy", d => y(d.mean_sst_c));

      dots.exit().remove();

      updateInsightPanel(selectedYear, selectedData);
    }

    function updateInsightPanel(selectedYear, selectedData) {
      d3.select("#insight-title").text(`Ocean futures in ${selectedYear}`);

      const sorted = [...selectedData].sort((a, b) => b.mean_sst_c - a.mean_sst_c);
      const spread = sorted[0].mean_sst_c - sorted[sorted.length - 1].mean_sst_c;

      d3.select("#insight-text")
        .text(`By ${selectedYear}, the warmest and coolest projected futures differ by about ${spread.toFixed(2)}°C.`);

      const readout = d3.select("#scenario-readout");

      const items = readout.selectAll(".readout-item")
        .data(selectedData, d => d.scenario);

      items.enter()
        .append("div")
        .attr("class", "readout-item")
        .merge(items)
        .style("border-left-color", d => scenarioColors[d.scenario] || "#fff")
        .html(d => `
          <span>${scenarioLabels[d.scenario] || d.scenario}</span>
          <strong>${d.mean_sst_c.toFixed(2)} °C</strong>
        `);

      items.exit().remove();
    }
  })
  .catch(error => {
    console.error("Could not load CSV:", error);
  });