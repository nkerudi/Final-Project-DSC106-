const csvPath = 'storm_futures/data/scripts/cimp6_sst_scenarios.csv';
const svg = d3.select('#sst-chart');
const tooltip = d3.select('#tooltip');

const width = 900;
const height = 520;

const margin = {
  top: 40,
  right: 150,
  bottom : 70, 
  left: 80
};

const scenarioLabels = {
  ssp126: "Low Emissions (SSP1-2.6)",
  ssp245: "Moderate Emissions (SSP2-4.5)",
  ssp585: "High Emissions (SSP5-8.5)"
};

const scenarioDescriptions = {
  ssp126: "The lower-emissions (SSP1-2.6) future where climate changve action limits long-term ocea warming.",
  ssp245: "The moderate-emissions (SSP2-4.5) pathway where emissions stabilize but warming still continues.",
  ssp585: "A high-emissions (SSP5-8.5) future where continues fossil fuel used leads to m uch stronger ocean warming."
};

const scenarioColors = {
  ssp126: "#2563eb",
  ssp245: "#f97316",
  ssp585: "#16a34a"
};

d3.csv(csvPath, d3.autoType).then(data => {
  data = data
    .filter(d => d.year !== null && d.mean_sst_c !== null && d.scenario)
    .sort((a,b) => d3.ascending(a.year, b.year));
  const years = [...new Set(data.map(d => d.year))].sort((a, b) => a -b);
  const scenarios = [...new Set(data.map(d => d.scenario))];
  
  const minYear = d3.min(years);
  const maxYear = d3.max(years);
  
  const x = d3.scaleLinear()
    .domain([minYear, maxYear])
    .range([margin.left, width - margin.right]);
  const xAxis = d3.axisBottom(x).tickFormat(d3.format('d'));

  const y = d3.scaleLinear()
    .domain(d3.extent(data, d => d.mean_sst_c))
    .nice()
    .range([height - margin.bottom, margin.top]);
  const yAxis = d3.axisLeft().ticks(7);

  svg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0, ${height - margin.bottom})`)
    .call(xAxis);
  svg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left}, 0)`)
    .call(yAxis);

  svg.append("text")
    .attr("class", "axis-label")
    .attr("x", width / 2)
    .attr("y", height - 22)
    .attr("text-anchor", "middle")
    .text("Year");

  svg.append("text")
    .attr("class", "axis-label")
    .attr("x", -height / 2)
    .attr("y", 24)
    .attr("transform", "rotate(-90)")
    .attr("text-anchor", "middle")
    .text("Mean Sea Surface Temperature (°C)");

  const line = d3.line()
    .x(d=> x(d.year))
    .y(d=> y(d.mean_sst_c))
    .curve(d3.curveMonotoneX);
  const grouped = d3.group(data, d => d.scenario);

  for (const [scenario, values] of grouped) {
    values.sort((a,b ) => a.year - b.year);
    svg.append("path")
      .datum(values)
      .attr("class", "scenario-line")
      .attr("stroke", scenarioColors[scenario] || "#555")
      .attr("d", line);
    const last = values[values.length - 1];

    svg.append("text")
      .attr("x", x(last.year) + 10)
      .attr("y", y(last.mean_sst_c))
      .attr("fill", scenarioColors[scenario] || "#555")
      .attr("font-size", "12px")
      .attr("font-weight", 700)
      .text(scenarioLabels[scenario] || scenario);
  }
    const yearMarker = svg.append("line")
      .attr("class", "year-marker")
      .attr("y1", margin.top)
      .attr("y2", height - margin.bottom);

    const dotGroup = svg.append("g").attr("class", "selected-dots");

    const slider = d3.select("#year-slider");

    slider
      .attr("min", minYear)
      .attr("max", maxYear)
      .attr("step", 1)
      .attr("value", minYear);
    slider.on("input", event => {
      const selectedYear = +event.target.value;
      update(selectedYear);
    });

    update(minYear);

    function update(selectedYear) {
      d3.select("#selected-year").text(selectedYear);

      yearMarker
        .transition()
        .duration(250)
        .attr("x1", x(selectedYear))
        .attr("x2", x(selectedYear));
      
        const selectedData = scenarios.map(scenrio => {
          const scenarioData = data.filter(d => d.scenario === scenrio);
          const closest = scenarioData.reduce((best, current) => {
            return Math.abs(current.year - selectedYear) < Math.abs(best.year - selectedYear) ? current : best;
          });
          return closest;
        });
        const dots = dotGroup.selectAll("circle")
          .data(selectedData, d=> d.scenario);

        dots.enter()
          .append("circle")
          .attr("class", "selected-dot")
          .attr("r", 8)
          .attr("fill", d=> scenrioColors[d.scenario] || "#555")
          .attr("cx", d => x(d.year))
          .attr("cy", d => y(d.mean_sst_c))
          .on("mouseover", (event, d) => {
            tooltip
              .style("opacity", 1)
              .html(`<strong>${scenarioLabels[d.scenario] || d.scenario}</strong><br>
                Year: ${d.year}<br>
                Mean SST: ${d.mean_sst_c.toFixed(2)} °C<br>`)
          })
          .on("mousmove", function(event) {
            tooltip
              .style("left", (event.pageX + 14) + "px")
              .style("top", (event.pageY - 20) + "px");
          })
          .on("mousout", function() {
            tooltip.style("opacity", 0);

          })
          .merge(dots)
          .transition()
          .duration(250)
          .attr("cx", d => x(d.year))
          .attr("cy", d => y(d.mean_sst_c));
        dots.exit().remove();

        updateInsightPanel(selectedYear, selectedData);



    }
    function updateInsightPanel(selectedYear, selectedData) {
      d3.select("#insight-title").text(`Ocean futures in ${selectedYear}: `);

      const sorted = selectedData.sort((a, b) => b.mean_sst_c - a.mean_sst_c);
      const warmest = sorted[0];
      const coolest = sorted[sorted.length - 1];
      const spread = warmest.mean_sst_c - coolest.mean_sst_c;

      d3.select("#insight-text")
        .text(
          `By ${selectedYear}, the warmest and coolest projected futures differ by about ${spread.toFixed(2)}°C. This gap represents how much human emissions choices can shape future ocean conditions.`
        );

      const readout = d3.select("#scenrio-readout");

      const items = readout.selectAll(".readout-item")
        .data(selectedData, d => d.scenario);
      items.enter()
        .append("div")
        .attr("class", "readout-item")
        .merge(items)
        .style("border-left-color", d => scenarioColors[d.scenario] || "#fff")
        .html(d => `<strong>${scenarioLabels[d.scenario] || d.scenario}:</strong> ${d.mean_sst_c.toFixed(2)} °C`);
      items.exit().remove();



    }

});

