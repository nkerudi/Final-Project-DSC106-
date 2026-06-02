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
    data.forEach(d => {
      d.mean_sst_c = +d.mean_sst_c + 273.15;
  });


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


    }
    const legend = svg.append("g")
      .attr("class", "legend")
      .attr("transform", `translate(${margin.left + 20}, ${margin.top + 10})`);

    scenarios.forEach((scenario, i) => {
      const legendRow = legend.append("g")
        .attr("transform", `translate(0, ${i * 24})`);

      legendRow.append("line")
        .attr("x1", 0)
        .attr("x2", 24)
        .attr("y1", 0)
        .attr("y2", 0)
        .attr("stroke", scenarioColors[scenario] || "#555")
        .attr("stroke-width", 4);

      legendRow.append("text")
        .attr("x", 34)
        .attr("y", 5)
        .attr("fill", scenarioColors[scenario] || "#555")
        .attr("font-size", 13)
        .attr("font-weight", 700)
        .text(scenarioLabels[scenario] || scenario);
    });

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

const mapDataCache = new Map();
const scenarioConfigs = [
  { scenario: "ssp126" },
  { scenario: "ssp245" },
  { scenario: "ssp370" },
  { scenario: "ssp585" }
];

const variableConfigs = {
  ts: { label: "Global Temperature", maxAbsAnomaly: 10 },
  tos: { label: "Sea Surface Temperature", maxAbsAnomaly: 10 }
};

let activeMapFrameIndex = 0;
let activeMapVariable = "tos";
let activeMapDatasets = [];
let mapResizeHandler = null;

function getActiveVariableConfig(variable = activeMapVariable) {
  return variableConfigs[variable] ?? variableConfigs.tos;
}

function getActiveVariableLabel(variable = activeMapVariable) {
  return getActiveVariableConfig(variable).label;
}

function getActiveVariableMaxAbsAnomaly(variable = activeMapVariable) {
  return getActiveVariableConfig(variable).maxAbsAnomaly;
}

async function fetchPrecomputedMapAnomaly(ssp, variable = "tos") {
  const cacheKey = `${variable}:${ssp}`;

  if (!mapDataCache.has(cacheKey)) {
    const request = fetch(`${variable}_anom_${ssp}.json`).then(async response => {
      if (!response.ok) {
        throw new Error(`Failed to fetch data for ${variable} anomaly under ${ssp}: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data || !Array.isArray(data.frames)) {
        throw new Error(`Invalid data format for ${variable} anomaly under ${ssp}`);
      }

      return data;
    });

    mapDataCache.set(cacheKey, request);
  }

  return mapDataCache.get(cacheKey);
}

function getMapCanvasId(variable, scenario) {
  return `${variable}-${scenario}`;
}

function updateMapCanvasIds(variable) {
  for (const config of scenarioConfigs) {
    const article = document.querySelector(`article[data-scenario="${config.scenario.toUpperCase()}"]`);
    const canvas = article?.querySelector("canvas.map-canvas");

    if (canvas) {
      canvas.id = getMapCanvasId(variable, config.scenario);
    }
  }
}

function getMapGeometryMeta(data) {
  if (data.mapMeta) {
    return data.mapMeta;
  }

  const validLats = data.lats.filter(value => value != null);
  const validLons = data.lons.filter(value => value != null);
  const latMin = d3.min(validLats);
  const latMax = d3.max(validLats);
  const lonMin = d3.min(validLons);
  const lonMax = d3.max(validLons);

  data.mapMeta = {
    latMin,
    latMax,
    lonMin,
    lonMax
  };

  return data.mapMeta;
}

// Compute a shared geographic extent across multiple datasets so
// all canvases use the same geographic->pixel mapping (avoids overlay misalignment).
function getSharedGeometryMeta(datasets) {
  let latMin = Infinity, latMax = -Infinity;
  let lonMin = Infinity, lonMax = -Infinity;

  for (const { data } of datasets) {
    if (!data) continue;
    const validLats = Array.isArray(data.lats) ? data.lats.filter(v => v != null) : [];
    const validLons = Array.isArray(data.lons) ? data.lons.filter(v => v != null) : [];
    if (validLats.length) {
      latMin = Math.min(latMin, d3.min(validLats));
      latMax = Math.max(latMax, d3.max(validLats));
    }
    if (validLons.length) {
      lonMin = Math.min(lonMin, d3.min(validLons));
      lonMax = Math.max(lonMax, d3.max(validLons));
    }
  }

  // Fallback to global if nothing valid
  if (!isFinite(latMin) || !isFinite(latMax) || !isFinite(lonMin) || !isFinite(lonMax)) {
    return getMapGeometryMeta(datasets[0]?.data || {});
  }

  return { latMin, latMax, lonMin, lonMax };
}

function latLonForIndex(data, index) {
  // Case A: lats/lons provided per-cell (length === frame length)
  const frameLen = (data.frames && data.frames[0]) ? data.frames[0].length : 0;
  if (Array.isArray(data.lats) && Array.isArray(data.lons) && data.lats.length === frameLen && data.lons.length === frameLen) {
    return { lat: data.lats[index], lon: data.lons[index] };
  }

  // Case B: lats/lons are axis vectors (nLat, nLon provided)
  if (data.nLon && data.nLat && Array.isArray(data.lats) && Array.isArray(data.lons) && data.lats.length === data.nLat && data.lons.length === data.nLon) {
    const row = Math.floor(index / data.nLon);
    const col = index % data.nLon;
    return { lat: data.lats[row], lon: data.lons[col] };
  }

  // Fallback: attempt direct index
  return { lat: data.lats[index] ?? null, lon: data.lons[index] ?? null };
}

// Pre-render frames to ImageBitmaps for fast playback. Stores `bitmaps` array on each dataset.
async function preRenderAllDatasets(datasets, sharedGeo, loadingEl) {
  const devicePixelRatio = window.devicePixelRatio || 1;

  for (let di = 0; di < datasets.length; di++) {
    const ds = datasets[di];
    const canvasEl = document.getElementById(ds.canvasId);
    if (!canvasEl) {
      ds.bitmaps = null;
      continue;
    }

    const targetW = Math.max(1, Math.round(canvasEl.clientWidth * devicePixelRatio));
    const targetH = Math.max(1, Math.round(canvasEl.clientHeight * devicePixelRatio));

    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = targetW;
    tmpCanvas.height = targetH;
    const tmpCtx = tmpCanvas.getContext('2d');
    tmpCtx.imageSmoothingEnabled = false;

    const { lats, lons, nLat, nLon } = ds.data;
    const { latMin, latMax, lonMin, lonMax } = sharedGeo || getMapGeometryMeta(ds.data);
    const cellW = tmpCanvas.width / nLon;
    const cellH = tmpCanvas.height / nLat;
    const toX = lon => ((lon - lonMin) / (lonMax - lonMin)) * tmpCanvas.width;
    const toY = lat => ((latMax - lat) / (latMax - latMin)) * tmpCanvas.height;

    const maxAbs = getActiveVariableMaxAbsAnomaly();
    const colorScale = d3.scaleDiverging(t => d3.interpolateRdBu(1 - t)).domain([-maxAbs, 0, maxAbs]);

    const frames = ds.data.frames || [];
    const bitmaps = new Array(frames.length);

    for (let fi = 0; fi < frames.length; fi++) {
      const frame = frames[fi];
      tmpCtx.clearRect(0, 0, tmpCanvas.width, tmpCanvas.height);

      for (let idx = 0; idx < frame.length; idx += 1) {
        const value = frame[idx];
        const { lat, lon } = latLonForIndex(ds.data, idx);

        if (lat == null || lon == null) continue;

        if (value == null || !Number.isFinite(value)) {
          tmpCtx.fillStyle = '#cfcfcf';
        } else {
          tmpCtx.fillStyle = colorScale(value);
        }

        tmpCtx.fillRect(toX(lon) - cellW / 2, toY(lat) - cellH / 2, cellW, cellH);
      }

      try {
        // createImageBitmap is async and yields a GPU-backed ImageBitmap for fast draws
        const bitmap = await createImageBitmap(tmpCanvas);
        bitmaps[fi] = bitmap;
      } catch (err) {
        console.warn('createImageBitmap failed, falling back to direct draw', err);
        bitmaps[fi] = null;
      }
    }

    ds.bitmaps = bitmaps;

    if (loadingEl) {
      loadingEl.textContent = `Pre-rendering frames... (${di + 1}/${datasets.length})`;
    }
    // allow the UI to update between heavy loops
    await new Promise(r => setTimeout(r, 10));
  }
}

function resizeCanvasToDisplaySize(canvas) {
  const devicePixelRatio = window.devicePixelRatio || 1;
  const displayWidth = Math.max(1, Math.round(canvas.clientWidth * devicePixelRatio));
  const displayHeight = Math.max(1, Math.round(canvas.clientHeight * devicePixelRatio));

  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    return true;
  }

  return false;
}

function renderMapFrame(data, frameIndex, canvasId, maxAbsAnomaly = getActiveVariableMaxAbsAnomaly(), sharedGeo) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.error(`Canvas with id ${canvasId} not found`);
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const frame = data.frames?.[frameIndex];
  if (!frame) {
    return;
  }

  resizeCanvasToDisplaySize(canvas);

  const { lats, lons, nLat, nLon } = data;
  const { latMin, latMax, lonMin, lonMax } = sharedGeo || getMapGeometryMeta(data);
  const colorScale = d3.scaleDiverging(t => d3.interpolateRdBu(1 - t)).domain([-maxAbsAnomaly, 0, maxAbsAnomaly]);
  const cellW = canvas.width / nLon;
  const cellH = canvas.height / nLat;
  const toX = lon => ((lon - lonMin) / (lonMax - lonMin)) * canvas.width;
  const toY = lat => ((latMax - lat) / (latMax - latMin)) * canvas.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  for (let index = 0; index < frame.length; index += 1) {
    const value = frame[index];
    const { lat, lon } = latLonForIndex(data, index);

    if (lat == null || lon == null) {
      continue;
    }

    // draw gray for missing data, otherwise use the diverging color scale
    if (value == null || !Number.isFinite(value)) {
      ctx.fillStyle = "#cfcfcf"; // light gray for null
    } else {
      ctx.fillStyle = colorScale(value);
    }

    ctx.fillRect(toX(lon) - cellW / 2, toY(lat) - cellH / 2, cellW, cellH);
  }
}

function updateMapYearLabel(year) {
  const label = document.getElementById("year-display");
  if (label) {
    label.textContent = year == null ? "--" : year;
  }
}

async function initMap() {
  const slider = document.getElementById("map-year-slider");
  const mapsHeader = document.querySelector('.maps-header');
  let loadingEl = document.getElementById('maps-loading');
  if (!loadingEl && mapsHeader) {
    loadingEl = document.createElement('div');
    loadingEl.id = 'maps-loading';
    loadingEl.style.fontSize = '0.92rem';
    loadingEl.style.color = '#0f6f73';
    loadingEl.style.marginTop = '6px';
    mapsHeader.appendChild(loadingEl);
  }

  // disable interactive controls while preloading
  if (slider) slider.disabled = true;
  const variableSelect = document.getElementById('variable-select');
  if (variableSelect) variableSelect.disabled = true;

  let loadedCount = 0;
  const total = scenarioConfigs.length;

  const fetchPromises = scenarioConfigs.map(config =>
    fetchPrecomputedMapAnomaly(config.scenario, activeMapVariable)
      .then(data => {
        loadedCount += 1;
        if (loadingEl) loadingEl.textContent = `Loading maps... (${loadedCount}/${total})`;
        return {
          ...config,
          canvasId: getMapCanvasId(activeMapVariable, config.scenario),
          data
        };
      })
      .catch(err => {
        loadedCount += 1;
        if (loadingEl) loadingEl.textContent = `Loading maps... (${loadedCount}/${total})`;
        console.warn(`Failed to load ${config.scenario} for ${activeMapVariable}:`, err);
        // rethrow so Promise.allSettled will catch it
        throw err;
      })
  );

  const settledMaps = await Promise.allSettled(fetchPromises);

  activeMapDatasets = settledMaps
    .filter(result => result.status === 'fulfilled')
    .map(result => result.value);

  if (!activeMapDatasets.length) {
    console.error('No map data could be loaded.');
    if (loadingEl) loadingEl.textContent = 'Failed to load maps.';
    if (variableSelect) variableSelect.disabled = false;
    return;
  }

  activeMapDatasets.forEach(({ data }) => getMapGeometryMeta(data));

  // compute a shared geographic extent so all canvases share the same projection
  const sharedGeo = getSharedGeometryMeta(activeMapDatasets);

  // pre-render frames to ImageBitmaps for smooth slider interaction (use sharedGeo)
  if (loadingEl) loadingEl.textContent = 'Pre-rendering frames...';
  await preRenderAllDatasets(activeMapDatasets, sharedGeo, loadingEl);

  const sharedYears = activeMapDatasets[0].data.years || [];
  const maxFrameIndex = Math.max(0, Math.min(...activeMapDatasets.map(entry => entry.data.frames.length - 1)));

  if (slider) {
    slider.disabled = false;
    slider.min = '0';
    slider.max = String(maxFrameIndex);
    slider.step = '1';
    slider.value = '0';
  }

  const drawFrame = frameIndex => {
    activeMapFrameIndex = frameIndex;
    updateMapYearLabel(sharedYears[frameIndex] ?? frameIndex);

    const maxAbsAnomaly = getActiveVariableMaxAbsAnomaly();

    for (const { data, canvasId, bitmaps } of activeMapDatasets) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) continue;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      resizeCanvasToDisplaySize(canvas);

      if (Array.isArray(bitmaps) && bitmaps[frameIndex]) {
        // fast path: draw the pre-rendered ImageBitmap
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        try {
          ctx.drawImage(bitmaps[frameIndex], 0, 0, canvas.width, canvas.height);
        } catch (err) {
          // fallback
          renderMapFrame(data, frameIndex, canvasId, maxAbsAnomaly, sharedGeo);
        }
      } else {
        // fallback path: render frame directly
        renderMapFrame(data, frameIndex, canvasId, maxAbsAnomaly, sharedGeo);
      }
    }
  };

  drawFrame(0);

  if (slider) {
    let animationFrameId = 0;

    slider.oninput = event => {
      const nextFrameIndex = Number(event.target.value);

      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = requestAnimationFrame(() => {
        drawFrame(nextFrameIndex);
      });
    };
  }

  if (mapResizeHandler) {
    window.removeEventListener('resize', mapResizeHandler);
  }

  mapResizeHandler = () => {
    drawFrame(activeMapFrameIndex);
  };

  window.addEventListener('resize', mapResizeHandler);

  // cleanup loading UI and re-enable variable selector
  if (loadingEl) loadingEl.textContent = '';
  if (variableSelect) variableSelect.disabled = false;
}

async function setMapVariable(variable) {
  activeMapVariable = variable;
  updateMapCanvasIds(variable);
  await initMap();
}

document.getElementById("variable-select")?.addEventListener("change", event => {
  setMapVariable(event.target.value).catch(error => {
    console.error("Could not switch map variable:", error);
  });
});

updateMapCanvasIds(activeMapVariable);

initMap().catch(error => {
  console.error("Could not initialize maps:", error);
});