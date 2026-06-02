const mapDataCache = new Map();
const scenarioConfigs = [
  { scenario: "ssp126" },
  { scenario: "ssp245" },
  { scenario: "ssp370" },
  { scenario: "ssp585" }
];

const variableConfigs = {
  ts:     { label: "Global Temperature",              maxAbsAnomaly: 10  },
  tos:    { label: "Sea Surface Temperature",          maxAbsAnomaly: 10  },
  thetao: { label: "Sea Water Potential Temperature",  maxAbsAnomaly: 10  },
  zos:    { label: "Sea Level",                        maxAbsAnomaly: 1   },
  storm_risk: {
    label: "Naive Storm Risk",
    maxAbsAnomaly: 1,
    computed: ['tos_raw'],
    computeFn: ([d]) => computeStormRiskData(d),
    sequential: true,
    binary: true
  },
  tchp: {
    label: "TC Heat Potential Proxy",
    maxAbsAnomaly: 100,
    computed: ['tos', 'zos'],
    computeFn: ([d1, d2]) => computeTCHPData(d1, d2),
    sequential: true
  }
};

// Raw-data variables fetch from {var}_{ssp}.json instead of {var}_anom_{ssp}.json
const RAW_VARIABLES = new Set(['tos_raw', 'zos_raw']);

// Ocean basins used for the regional bar chart (lon in -180…180)
const OCEAN_BASINS = [
  { id: 'natl', name: 'N. Atlantic', latMin:  0, latMax: 65, lonMin: -100, lonMax:  20 },
  { id: 'satl', name: 'S. Atlantic', latMin: -60, latMax: 0, lonMin:  -70, lonMax:  20 },
  { id: 'ind',  name: 'Indian',      latMin: -60, latMax: 30, lonMin:  20, lonMax: 120 },
  { id: 'epac', name: 'E. Pacific',  latMin:   0, latMax: 65, lonMin: -180, lonMax: -70 },
];

const VARIABLE_INFO = {
  ts: {
    label: 'Change in Global Atmospheric Temperature from 2015 Baseline',
    chartTitle: 'Mean Global Temperature Anomaly by Ocean Basin',
    desc: 'Global atmospheric temperature is a key indicator for storm risk and destructiveness globally, as a warmer atmosphere can hold more moisture and can lead to more intense rainfall. A study of 2017\'s Hurricane Harvey shows that global warming made precipitation from storms 15% more intense and 3 times more likely (van Oldenborgh et al. 2017). We note consistent increases across all emission scenarios, with more extreme increases in higher emissions scenarios, which is consistent with the fact that higher emissions lead to more warming globally.'
  },
  tos: {
    label: 'Change in Sea Surface Temperature from 2015 Baseline',
    chartTitle: 'Mean Sea Surface Temperature Anomaly by Ocean Basin',
    desc: 'Sea surface temperature is a well-known indicator for tropical storm and hurricane risk. As warm seawater evaporates, it pumps water into the lower atmosphere (which has already been rising in temperature), and a convective cycle caused by winds in addition to dropping pressure causes hurricanes to form (NOAA Ocean Exploration, 2020). We see similar trends to global temperature, with more extreme sea surface temperature increases in higher emissions scenarios, which suggests that we can expect more intense tropical storms and hurricanes in the future as the oceans warm.'
  },
  thetao: {
    label: 'Change in Sea Water Potential Temperature from 2015 Baseline',
    chartTitle: 'Mean Ocean Potential Temperature Anomaly by Ocean Basin',
    desc: 'In addition to the surface temperature, the temperature of sea water overall affects the formation of tropical storms and hurricanes. Before, cooler deeper water mixing with surface waters during hurricanes weakened them. However, as the oceans themselves become warmer, warmer deep water mixing creates a warmer surface to strengthen hurricanes (Woods Hole Oceanographic Institution). We once again see consistent increases across all emission scenarios, with more extreme increases in higher emissions scenarios, which is consistent with the fact that higher emissions lead to more warming globally.'
  },
  zos: {
    label: 'Change in Sea Level Rise from 2015 Baseline',
    chartTitle: 'Mean Sea Level Anomaly by Ocean Basin',
    desc: 'Sea level rise can also make storms worse. A storm surge happens when waters rise above normal levels and are pushed inland by the wind — as sea levels rise, previous infrastructure to defend against these becomes worse, making tropical storms and hurricanes more destructive (Environmental Defense Fund). For example, Hurricane Ian in 2022 had its storm surge reach as high as 15 feet in Fort Myers Beach, Florida. Note that by 2100, we see the highest sea level rise from our baseline in the North Atlantic Ocean, which is also the region we traditionally associate with tropical storms and hurricanes.'
  },
  storm_risk: {
    label: 'Naive Storm Risk (SST > 27 °C)',
    chartTitle: 'Fraction of Storm-Risk Cells (SST > 27 °C) by Ocean Basin',
    desc: 'A binary indicator flagging every ocean cell where raw sea surface temperature exceeds 27 °C as storm-risk (1) and all others as no-risk (0). The basin chart shows the fraction of at-risk cells per region, revealing how rapidly the storm-favorable ocean area expands under higher emissions scenarios through 2100. In our graphs, we can see that risk expands across the equator under all climate scenarios, but becomes more extreme as emissions increase. Particularly, we see increases in the equator regions, near the North Atlantic. Note that this is a very naive risk indicator that only considers one factor (SST) and does not account for other important factors like wind shear, atmospheric moisture, or ocean heat content, which is why we also include the TCHP proxy as a more robust measure of storm-favorable conditions.'
  },
  tchp: {
    label: 'Change in TCHP (Tropical Cyclone Heat Potential) from 2015 Baseline',
    chartTitle: 'Mean TC Heat Potential Proxy by Ocean Basin',
    desc: 'This is AOML\'s Tropical Cyclone Heat Potential, a robust measure of how much energy is available in the ocean to sustain or modify the intensity of a tropical storm (NOAA Coastwatch, 2019). In our use case, we utilize a proxy for TCHP using raw sea surface temperature and sea level anomaly to determine storm risk per region. We note that there are increases throughout emission scenarios, but the increase in much more extreme in SSP3-7.0 and SSP5-8.5, which is consistent with the fact that these scenarios have much more extreme sea surface temperature and sea level rise increases. This suggests that under higher emissions scenarios, we can expect much more intense tropical storms and hurricanes in the future.'
  }
};

const VARIABLE_UNITS = {
  ts:         '°C anomaly',
  tos:        '°C anomaly',
  zos:        'm anomaly',
  thetao:     '°C anomaly',
  storm_risk: 'Fraction at Risk',
  tchp:       'kJ/cm²'
};

const SCENARIO_COLORS = {
  ssp126: '#3b82f6',
  ssp245: '#22c55e',
  ssp370: '#f97316',
  ssp585: '#ef4444'
};

function normLon(lon) { return lon > 180 ? lon - 360 : lon; }

function inBasin(lat, lon, basin) {
  const nlon = normLon(lon);
  return lat >= basin.latMin && lat <= basin.latMax
      && nlon >= basin.lonMin && nlon <= basin.lonMax;
}

// Storm risk: binary 1 where raw SST > 27°C (storm-favorable), 0 elsewhere.
function computeStormRiskData(tosRawData) {
  const frames = tosRawData.frames.map(frame =>
    frame.map(sst => {
      if (sst == null || !Number.isFinite(sst)) return null;
      return sst > 27 ? 1 : 0;
    })
  );
  return {
    frames,
    lats: tosRawData.lats,
    lons: tosRawData.lons,
    nLat: tosRawData.nLat,
    nLon: tosRawData.nLon,
    years: tosRawData.years
  };
}

// TCHPproxy = 4,097,844 · max(SST_raw − 26, 0) · (75 + 4·SLA_raw) / 1e7  [kJ/cm²]
function computeTCHPData(tosRawData, zosRawData) {
  const K = 4097844 / 1e7;
  const frames = tosRawData.frames.map((tosFrame, fi) => {
    const zosFrame = zosRawData.frames[fi];
    return tosFrame.map((sst, idx) => {
      if (sst == null || !Number.isFinite(sst)) return null;
      const sla = (zosFrame && zosFrame[idx] != null && Number.isFinite(zosFrame[idx]))
        ? zosFrame[idx] : 0;
      return K * Math.max(sst, 0) * (75 + 4 * sla);
    });
  });
  return {
    frames,
    lats: tosRawData.lats,
    lons: tosRawData.lons,
    nLat: tosRawData.nLat,
    nLon: tosRawData.nLon,
    years: tosRawData.years
  };
}

let activeMapFrameIndex = 0;
let activeMapVariable   = "ts";
let activeMapDatasets   = [];
let mapResizeHandler    = null;
let mapInitGeneration   = 0;
let mapZoomState        = null; // { lonMin, lonMax, latMin, latMax } when zoomed, else null
let activeDrawFrame     = null; // reference to current drawFrame closure, for the reset button

function getActiveVariableConfig(variable = activeMapVariable) {
  return variableConfigs[variable] ?? variableConfigs.tos;
}
function getActiveVariableMaxAbsAnomaly(variable = activeMapVariable) {
  return getActiveVariableConfig(variable).maxAbsAnomaly;
}

// ── Fetch with retry ──────────────────────────────────────────────────────────
async function fetchWithRetry(url, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// ── Data fetching ─────────────────────────────────────────────────────────────
// For computed variables (tchp), fetches component datasets and derives the result.
// Failures are never cached so a subsequent initMap() will re-attempt.
async function fetchPrecomputedMapAnomaly(ssp, variable = "tos") {
  const cacheKey = `${variable}:${ssp}`;
  const cfg = variableConfigs[variable];

  if (!mapDataCache.has(cacheKey)) {
    let request;

    if (cfg?.computed) {
      request = Promise.all(cfg.computed.map(v => fetchPrecomputedMapAnomaly(ssp, v)))
        .then(datasets => cfg.computeFn(datasets))
        .catch(err => { mapDataCache.delete(cacheKey); throw err; });
    } else {
      // Raw variables use their full name as the filename prefix (tos_raw_ssp126.json);
      // all others append _anom_ (ts_anom_ssp126.json).
      const urlPath = RAW_VARIABLES.has(variable)
        ? `../../data/map/${variable}_${ssp}.json`
        : `../../data/map/${variable}_anom_${ssp}.json`;
      request = fetchWithRetry(urlPath)
        .then(async res => {
          const data = await res.json();
          if (!data || !Array.isArray(data.frames)) {
            throw new Error(`Invalid data format for ${variable}:${ssp}`);
          }
          return data;
        })
        .catch(err => { mapDataCache.delete(cacheKey); throw err; });
    }

    mapDataCache.set(cacheKey, request);
  }

  return mapDataCache.get(cacheKey);
}

// ── Canvas helpers ────────────────────────────────────────────────────────────

function drawCanvasStatus(canvasId, text, isError = false) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Drive CSS pulse animation via data attribute
  canvas.dataset.status = isError ? 'error' : 'loading';

  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(Math.round((canvas.clientWidth  || 300) * dpr), 1);
  const h = Math.max(Math.round((canvas.clientHeight || 150) * dpr), 1);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width  = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = isError ? '#fee2e2' : '#f1f5f9';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = isError ? '#dc2626' : '#64748b';
  ctx.font = `${Math.max(11, Math.round(w * 0.025))}px Arial, sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);
}

function getMapCanvasId(variable, scenario) {
  return `${variable}-${scenario}`;
}

function updateMapCanvasIds(variable) {
  for (const config of scenarioConfigs) {
    const article = document.querySelector(`article[data-scenario="${config.scenario.toUpperCase()}"]`);
    const canvas  = article?.querySelector("canvas.map-canvas");
    if (canvas) canvas.id = getMapCanvasId(variable, config.scenario);
  }
}

// ── Color scale ───────────────────────────────────────────────────────────────

function makeColorScale(variable, maxAbs) {
  const cfg = variableConfigs[variable] ?? variableConfigs.tos;
  if (cfg.binary) {
    return v => (v != null && v > 0.5) ? '#ef4444' : '#e2e8f0';
  }
  if (cfg.sequential) {
    return d3.scaleSequential(d3.interpolateYlOrRd).domain([0, maxAbs]);
  }
  return d3.scaleDiverging(t => d3.interpolateRdBu(1 - t)).domain([-maxAbs, 0, maxAbs]);
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

function getMapGeometryMeta(data) {
  if (data.mapMeta) return data.mapMeta;
  const validLats = data.lats.filter(v => v != null);
  const validLons = data.lons.filter(v => v != null);
  data.mapMeta = {
    latMin: d3.min(validLats), latMax: d3.max(validLats),
    lonMin: d3.min(validLons), lonMax: d3.max(validLons)
  };
  return data.mapMeta;
}

function getSharedGeometryMeta(datasets) {
  let latMin = Infinity, latMax = -Infinity;
  let lonMin = Infinity, lonMax = -Infinity;
  for (const { data } of datasets) {
    if (!data) continue;
    const lats = Array.isArray(data.lats) ? data.lats.filter(v => v != null) : [];
    const lons = Array.isArray(data.lons) ? data.lons.filter(v => v != null) : [];
    if (lats.length) { latMin = Math.min(latMin, d3.min(lats)); latMax = Math.max(latMax, d3.max(lats)); }
    if (lons.length) { lonMin = Math.min(lonMin, d3.min(lons)); lonMax = Math.max(lonMax, d3.max(lons)); }
  }
  if (!isFinite(latMin) || !isFinite(latMax) || !isFinite(lonMin) || !isFinite(lonMax)) {
    return getMapGeometryMeta(datasets[0]?.data || {});
  }
  return { latMin, latMax, lonMin, lonMax };
}

function latLonForIndex(data, index) {
  const frameLen = data.frames?.[0]?.length ?? 0;
  if (Array.isArray(data.lats) && data.lats.length === frameLen) {
    return { lat: data.lats[index], lon: data.lons[index] };
  }
  if (data.nLon && data.nLat && data.lats.length === data.nLat) {
    return { lat: data.lats[Math.floor(index / data.nLon)], lon: data.lons[index % data.nLon] };
  }
  return { lat: data.lats[index] ?? null, lon: data.lons[index] ?? null };
}

// ── Pre-render ────────────────────────────────────────────────────────────────

async function preRenderAllDatasets(datasets, sharedGeo, loadingEl, isStale) {
  const dpr = window.devicePixelRatio || 1;

  for (let di = 0; di < datasets.length; di++) {
    if (isStale()) return;

    const ds       = datasets[di];
    const canvasEl = document.getElementById(ds.canvasId);

    if (!canvasEl) { ds.bitmaps = null; continue; }

    const targetW = Math.max(1, Math.round((canvasEl.clientWidth  || 300) * dpr));
    const targetH = Math.max(1, Math.round((canvasEl.clientHeight || 150) * dpr));

    const tmpCanvas  = document.createElement('canvas');
    tmpCanvas.width  = targetW;
    tmpCanvas.height = targetH;
    const tmpCtx     = tmpCanvas.getContext('2d');
    tmpCtx.imageSmoothingEnabled = false;

    const { latMin, latMax, lonMin, lonMax } = sharedGeo || getMapGeometryMeta(ds.data);
    const { nLon, nLat } = ds.data;
    const cellW      = tmpCanvas.width  / nLon;
    const cellH      = tmpCanvas.height / nLat;
    const toX        = lon => ((lon - lonMin) / (lonMax - lonMin)) * tmpCanvas.width;
    const toY        = lat => ((latMax - lat) / (latMax - latMin)) * tmpCanvas.height;
    const maxAbs     = getActiveVariableMaxAbsAnomaly();
    const colorScale = makeColorScale(activeMapVariable, maxAbs);

    const frames  = ds.data.frames || [];
    const bitmaps = new Array(frames.length);

    for (let fi = 0; fi < frames.length; fi++) {
      if (isStale()) return;

      const frame = frames[fi];
      tmpCtx.clearRect(0, 0, tmpCanvas.width, tmpCanvas.height);

      for (let idx = 0; idx < frame.length; idx++) {
        const { lat, lon } = latLonForIndex(ds.data, idx);
        if (lat == null || lon == null) continue;
        const value = frame[idx];
        tmpCtx.fillStyle = (value == null || !Number.isFinite(value))
          ? '#cfcfcf'
          : colorScale(value);
        tmpCtx.fillRect(toX(lon) - cellW / 2, toY(lat) - cellH / 2, cellW, cellH);
      }

      try {
        bitmaps[fi] = await createImageBitmap(tmpCanvas);
      } catch {
        bitmaps[fi] = null;
      }
    }

    ds.bitmaps = bitmaps;

    if (loadingEl) {
      loadingEl.textContent = `Pre-rendering… (${di + 1} / ${datasets.length})`;
    }
    await new Promise(r => setTimeout(r, 10));
  }
}

// ── Canvas drawing ────────────────────────────────────────────────────────────

function resizeCanvasToDisplaySize(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w   = Math.max(1, Math.round(canvas.clientWidth  * dpr));
  const h   = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width  = w;
    canvas.height = h;
    return true;
  }
  return false;
}

function renderMapFrame(data, frameIndex, canvasId, maxAbsAnomaly, sharedGeo) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx   = canvas.getContext('2d');
  const frame = data.frames?.[frameIndex];
  if (!ctx || !frame) return;

  resizeCanvasToDisplaySize(canvas);

  const { latMin, latMax, lonMin, lonMax } = sharedGeo || getMapGeometryMeta(data);
  const { nLon, nLat } = data;
  const colorScale = makeColorScale(activeMapVariable, maxAbsAnomaly);
  const cellW = canvas.width  / nLon;
  const cellH = canvas.height / nLat;
  const toX   = lon => ((lon - lonMin) / (lonMax - lonMin)) * canvas.width;
  const toY   = lat => ((latMax - lat) / (latMax - latMin)) * canvas.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  for (let i = 0; i < frame.length; i++) {
    const { lat, lon } = latLonForIndex(data, i);
    if (lat == null || lon == null) continue;
    const value = frame[i];
    ctx.fillStyle = (value == null || !Number.isFinite(value)) ? '#cfcfcf' : colorScale(value);
    ctx.fillRect(toX(lon) - cellW / 2, toY(lat) - cellH / 2, cellW, cellH);
  }
}

function updateMapYearLabel(year) {
  const el = document.getElementById('year-display');
  if (el) el.textContent = year == null ? '--' : year;
}

// ── Basin chart ───────────────────────────────────────────────────────────────

function buildBasinAverages(datasets, frameIndex) {
  const cfg = variableConfigs[activeMapVariable];
  const isSequential = cfg?.sequential;
  const isBinary     = cfg?.binary;
  return OCEAN_BASINS.map(basin => {
    const scenarioAvgs = {};
    for (const ds of datasets) {
      const frame = ds.data.frames[frameIndex];
      if (!frame) { scenarioAvgs[ds.scenario] = null; continue; }
      let sum = 0, count = 0;
      for (let idx = 0; idx < frame.length; idx++) {
        const v = frame[idx];
        // Binary (storm_risk): include 0s so the average = fraction at risk.
        // Sequential non-binary (TCHP): skip zeros (no-heat cells skew average down).
        // Diverging: include all finite values.
        if (v == null || !Number.isFinite(v)) continue;
        if (isSequential && !isBinary && v <= 0) continue;
        const { lat, lon } = latLonForIndex(ds.data, idx);
        if (lat != null && lon != null && inBasin(lat, lon, basin)) {
          sum += v; count++;
        }
      }
      scenarioAvgs[ds.scenario] = count > 0 ? sum / count : null;
    }
    return { basin, scenarioAvgs };
  });
}

function renderBasinChart(basinData, datasets) {
  const container = document.getElementById('basin-chart-container');
  if (!container) return;
  container.style.display = '';

  // Exit loading state
  const basinLoadingEl = document.getElementById('basin-chart-loading');
  const legendEl       = container.querySelector('.basin-legend');
  if (basinLoadingEl) basinLoadingEl.style.display = 'none';
  if (legendEl)       legendEl.style.display       = '';

  const cfg = variableConfigs[activeMapVariable] ?? variableConfigs.ts;

  // Dynamic title and optional formula line
  const titleEl   = container.querySelector('.basin-chart-title');
  const formulaEl = document.getElementById('basin-chart-formula');
  const info = VARIABLE_INFO[activeMapVariable];
  if (titleEl) titleEl.textContent = info?.chartTitle ?? `Mean ${cfg.label} by Ocean Basin`;
  if (formulaEl) formulaEl.style.display = activeMapVariable === 'tchp' ? '' : 'none';

  const svgEl = document.getElementById('basin-chart-svg');
  if (!svgEl) return;
  svgEl.style.display = 'block';

  const margin = { top: 18, right: 18, bottom: 46, left: 56 };
  const totalH = 210;
  const totalW = Math.max(svgEl.clientWidth || 600, 400);
  const W = totalW - margin.left - margin.right;
  const H = totalH - margin.top - margin.bottom;

  d3.select(svgEl).selectAll('*').remove();
  d3.select(svgEl)
    .attr('viewBox', `0 0 ${totalW} ${totalH}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  const svg = d3.select(svgEl).append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const basinNames = basinData.map(d => d.basin.name);
  const scenarios  = datasets.map(d => d.scenario);

  const x0 = d3.scaleBand().domain(basinNames).range([0, W]).padding(0.22);
  const x1 = d3.scaleBand().domain(scenarios).range([0, x0.bandwidth()]).padding(0.06);

  // Build y domain — sequential vars are always ≥ 0; diverging can go negative
  const allVals = basinData.flatMap(d => scenarios.map(s => d.scenarioAvgs[s])).filter(v => v != null);
  const dataMin = allVals.length ? d3.min(allVals) : 0;
  const dataMax = allVals.length ? d3.max(allVals) : 1;
  const yMin = cfg.sequential ? 0 : Math.min(0, dataMin * 1.15);
  const yMax = cfg.sequential ? dataMax * 1.15 : Math.max(0, dataMax * 1.15);
  const y = d3.scaleLinear().domain([yMin || -0.001, yMax || 0.001]).nice().range([H, 0]);
  const zeroY = y(0);

  // Subtle horizontal gridlines
  svg.append('g').call(
    d3.axisLeft(y).ticks(4).tickSize(-W).tickFormat('')
  ).selectAll('line')
    .attr('stroke', '#e1e8f0')
    .attr('stroke-dasharray', '3,3');
  svg.select('.domain').remove();

  // Zero line (visible for diverging variables)
  if (!cfg.sequential) {
    svg.append('line')
      .attr('x1', 0).attr('x2', W)
      .attr('y1', zeroY).attr('y2', zeroY)
      .attr('stroke', '#94a3b8')
      .attr('stroke-width', 1);
  }

  // Bars
  for (const { basin, scenarioAvgs } of basinData) {
    const g = svg.append('g').attr('transform', `translate(${x0(basin.name)},0)`);
    for (const scenario of scenarios) {
      const val = scenarioAvgs[scenario];
      if (val == null) continue;
      const barTop = Math.min(y(val), zeroY);
      const barH   = Math.max(1, Math.abs(y(val) - zeroY));
      g.append('rect')
        .attr('x', x1(scenario))
        .attr('y', barTop)
        .attr('width', x1.bandwidth())
        .attr('height', barH)
        .attr('fill', SCENARIO_COLORS[scenario] ?? '#94a3b8')
        .attr('rx', 2)
        .attr('opacity', 0.85);
    }
  }

  // X-axis always at the bottom of the chart area
  svg.append('g').attr('transform', `translate(0,${H})`)
    .call(d3.axisBottom(x0).tickSize(0))
    .call(g => g.select('.domain').attr('stroke', '#e1e8f0'))
    .selectAll('text')
    .attr('font-size', '10px')
    .attr('fill', '#526173')
    .attr('dy', '1.2em');

  // Y-axis
  svg.append('g')
    .call(d3.axisLeft(y).ticks(4).tickFormat(d => d.toFixed(2)))
    .call(g => g.select('.domain').remove())
    .selectAll('text')
    .attr('font-size', '10px')
    .attr('fill', '#526173');

  const unit = VARIABLE_UNITS[activeMapVariable] ?? '';
  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', -44).attr('x', -H / 2)
    .attr('text-anchor', 'middle')
    .attr('font-size', '10px')
    .attr('fill', '#526173')
    .text(unit);
}

function clearBasinChart() {
  const container = document.getElementById('basin-chart-container');
  if (container) container.style.display = 'none';
}

function showBasinChartLoading() {
  const container = document.getElementById('basin-chart-container');
  if (!container) return;
  container.style.display = '';

  const cfg = variableConfigs[activeMapVariable] ?? variableConfigs.ts;
  const titleEl = container.querySelector('.basin-chart-title');
  const info = VARIABLE_INFO[activeMapVariable];
  if (titleEl) titleEl.textContent = info?.chartTitle ?? `Mean ${cfg.label} by Ocean Basin`;

  const loadingEl = document.getElementById('basin-chart-loading');
  const svgEl     = document.getElementById('basin-chart-svg');
  const legendEl  = container.querySelector('.basin-legend');
  if (loadingEl) loadingEl.style.display = '';
  if (svgEl)     svgEl.style.display     = 'none';
  if (legendEl)  legendEl.style.display  = 'none';
}

// ── Legend ────────────────────────────────────────────────────────────────────

function renderLegend() {
  const svgEl = document.getElementById('legend-svg');
  if (!svgEl) return;

  const cfg    = variableConfigs[activeMapVariable] ?? variableConfigs.tos;
  const maxAbs = cfg.maxAbsAnomaly;
  const unit   = VARIABLE_UNITS[activeMapVariable] ?? '';

  const totalW  = Math.max(svgEl.clientWidth || 600, 300);
  const totalH  = 52;
  const mL = 48, mR = 48;   // room for axis labels at extremes
  const barW = totalW - mL - mR;
  const barH = 14;
  const barY = 8;

  d3.select(svgEl).selectAll('*').remove();
  d3.select(svgEl)
    .attr('viewBox', `0 0 ${totalW} ${totalH}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  const svg   = d3.select(svgEl);
  const defs  = svg.append('defs');
  const gradId = `lgrd-${activeMapVariable}`;
  const grad  = defs.append('linearGradient').attr('id', gradId)
    .attr('x1', '0%').attr('x2', '100%');

  // Binary variable: show two labelled swatches instead of a gradient
  if (cfg.binary) {
    const swW = 80, swH = barH, gap = 24;
    const startX = (totalW - (2 * swW + gap)) / 2;

    svg.append('rect').attr('x', startX).attr('y', barY)
      .attr('width', swW).attr('height', swH)
      .attr('fill', '#e2e8f0').attr('rx', 3)
      .attr('stroke', '#dbe3ee').attr('stroke-width', 1);
    svg.append('text')
      .attr('x', startX + swW / 2).attr('y', barY + swH + 14)
      .attr('text-anchor', 'middle').attr('font-size', '10px').attr('fill', '#526173')
      .text('No risk (SST ≤ 27 °C)');

    svg.append('rect').attr('x', startX + swW + gap).attr('y', barY)
      .attr('width', swW).attr('height', swH)
      .attr('fill', '#ef4444').attr('rx', 3)
      .attr('stroke', '#dbe3ee').attr('stroke-width', 1);
    svg.append('text')
      .attr('x', startX + swW + gap + swW / 2).attr('y', barY + swH + 14)
      .attr('text-anchor', 'middle').attr('font-size', '10px').attr('fill', '#526173')
      .text('At risk (SST > 27 °C)');

    return;
  }

  const stops = d3.range(0, 1.001, 0.05);
  if (cfg.sequential) {
    stops.forEach(t => grad.append('stop')
      .attr('offset', `${(t * 100).toFixed(1)}%`)
      .attr('stop-color', d3.interpolateYlOrRd(t)));
  } else {
    stops.forEach(t => grad.append('stop')
      .attr('offset', `${(t * 100).toFixed(1)}%`)
      .attr('stop-color', d3.interpolateRdBu(1 - t)));
  }

  // Gradient bar
  svg.append('rect')
    .attr('x', mL).attr('y', barY)
    .attr('width', barW).attr('height', barH)
    .attr('fill', `url(#${gradId})`)
    .attr('rx', 4);

  // Thin border around bar
  svg.append('rect')
    .attr('x', mL).attr('y', barY)
    .attr('width', barW).attr('height', barH)
    .attr('fill', 'none')
    .attr('stroke', '#dbe3ee').attr('stroke-width', 1)
    .attr('rx', 4);

  // Axis scale + ticks
  const domain = cfg.sequential ? [0, maxAbs] : [-maxAbs, maxAbs];
  const xScale = d3.scaleLinear().domain(domain).range([mL, mL + barW]);

  const nTicks = cfg.sequential ? 5 : 5;
  const tickVals = cfg.sequential
    ? d3.range(0, nTicks).map(i => maxAbs * i / (nTicks - 1))
    : d3.range(0, nTicks).map(i => -maxAbs + (2 * maxAbs) * i / (nTicks - 1));

  svg.selectAll('.ltick')
    .data(tickVals).join('line').attr('class', 'ltick')
    .attr('x1', d => xScale(d)).attr('x2', d => xScale(d))
    .attr('y1', barY + barH).attr('y2', barY + barH + 4)
    .attr('stroke', '#94a3b8').attr('stroke-width', 1);

  const fmt = v => {
    if (maxAbs >= 10) return v.toFixed(0);
    if (maxAbs >= 1)  return v.toFixed(1);
    return v.toFixed(2);
  };

  svg.selectAll('.llabel')
    .data(tickVals).join('text').attr('class', 'llabel')
    .attr('x', d => xScale(d))
    .attr('y', barY + barH + 16)
    .attr('text-anchor', 'middle')
    .attr('font-size', '10px').attr('fill', '#526173')
    .text(fmt);

  // Unit label centred below the bar
  svg.append('text')
    .attr('x', mL + barW / 2).attr('y', totalH - 1)
    .attr('text-anchor', 'middle')
    .attr('font-size', '10px').attr('fill', '#94a3b8')
    .text(unit);
}

// ── Zoom reset button ─────────────────────────────────────────────────────────

function updateZoomResetBtn() {
  const btn = document.getElementById('zoom-reset-btn');
  if (btn) btn.style.display = mapZoomState ? '' : 'none';
}

// ── Brush / zoom ──────────────────────────────────────────────────────────────
// Attaches a D3 brush to every .brush-overlay SVG.
// Brush-end zooms all 4 canvases together; double-click resets.

function setupMapBrushes(sharedGeo, drawFrameFn) {
  d3.selectAll('.brush-overlay').each(function() {
    const svgEl  = this;
    const svgSel = d3.select(svgEl);
    svgSel.selectAll('*').remove(); // clear any previous brush

    const W = svgEl.clientWidth  || 300;
    const H = svgEl.clientHeight || 150;

    const brush = d3.brush()
      .extent([[0, 0], [W, H]])
      .on('end', ({ selection }) => {
        if (!selection) return;
        const [[x0, y0], [x1, y1]] = selection;

        // Ignore accidental tiny selections (e.g. from double-click)
        if ((x1 - x0) < 6 || (y1 - y0) < 6) {
          svgSel.call(brush.move, null);
          return;
        }

        // Map pixel selection → geo coords, supporting nested zoom
        const geo = mapZoomState ?? sharedGeo;
        mapZoomState = {
          lonMin: geo.lonMin + (x0 / W) * (geo.lonMax - geo.lonMin),
          lonMax: geo.lonMin + (x1 / W) * (geo.lonMax - geo.lonMin),
          latMax: geo.latMax - (y0 / H) * (geo.latMax - geo.latMin),
          latMin: geo.latMax - (y1 / H) * (geo.latMax - geo.latMin),
        };

        svgSel.call(brush.move, null); // clear selection rectangle
        updateZoomResetBtn();
        drawFrameFn(activeMapFrameIndex);
      });

    svgSel.call(brush);

    // Double-click resets zoom
    svgSel.on('dblclick.zoom', () => {
      mapZoomState = null;
      updateZoomResetBtn();
      drawFrameFn(activeMapFrameIndex);
    });
  });
}

// ── Main init ─────────────────────────────────────────────────────────────────

async function initMap() {
  const gen     = ++mapInitGeneration;
  const isStale = () => gen !== mapInitGeneration;

  for (const ds of activeMapDatasets) {
    ds.bitmaps?.forEach(b => { try { b?.close(); } catch {} });
  }
  activeMapDatasets = [];
  mapZoomState = null;
  updateZoomResetBtn();

  showBasinChartLoading();
  renderLegend();

  const slider         = document.getElementById('map-year-slider');
  const variableSelect = document.getElementById('variable-select');
  const mapsHeader     = document.querySelector('.maps-header');

  let loadingEl = document.getElementById('maps-loading');
  if (!loadingEl && mapsHeader) {
    loadingEl = document.createElement('div');
    loadingEl.id = 'maps-loading';
    loadingEl.style.cssText = 'font-size:0.85rem;color:#526173;margin-top:6px;';
    mapsHeader.appendChild(loadingEl);
  }

  if (slider)         slider.disabled         = true;
  if (variableSelect) variableSelect.disabled = true;

  for (const { scenario } of scenarioConfigs) {
    drawCanvasStatus(getMapCanvasId(activeMapVariable, scenario), 'Loading…');
  }

  let loadedCount = 0;
  const total = scenarioConfigs.length;

  const fetchPromises = scenarioConfigs.map(({ scenario }) =>
    fetchPrecomputedMapAnomaly(scenario, activeMapVariable)
      .then(data => {
        if (isStale()) return null;
        loadedCount++;
        if (loadingEl) loadingEl.textContent = `Loading data… (${loadedCount} / ${total})`;
        return { scenario, canvasId: getMapCanvasId(activeMapVariable, scenario), data };
      })
      .catch(err => {
        loadedCount++;
        if (loadingEl) loadingEl.textContent = `Loading data… (${loadedCount} / ${total})`;
        console.warn(`Failed to load ${scenario} for ${activeMapVariable}:`, err);
        drawCanvasStatus(getMapCanvasId(activeMapVariable, scenario), 'Failed to load', true);
        return null;
      })
  );

  const results = await Promise.all(fetchPromises);
  if (isStale()) return;

  activeMapDatasets = results.filter(Boolean);

  if (!activeMapDatasets.length) {
    if (loadingEl) loadingEl.textContent = 'All scenarios failed to load.';
    if (variableSelect) variableSelect.disabled = false;
    return;
  }

  activeMapDatasets.forEach(({ data }) => getMapGeometryMeta(data));
  const sharedGeo = getSharedGeometryMeta(activeMapDatasets);

  if (loadingEl) loadingEl.textContent = 'Pre-rendering frames…';
  await preRenderAllDatasets(activeMapDatasets, sharedGeo, loadingEl, isStale);
  if (isStale()) return;

  const sharedYears   = activeMapDatasets[0].data.years || [];
  const maxFrameIndex = Math.max(0, Math.min(...activeMapDatasets.map(d => d.data.frames.length - 1)));

  if (slider) {
    slider.disabled = false;
    slider.min   = '0';
    slider.max   = String(maxFrameIndex);
    slider.step  = '1';
    slider.value = '0';
  }

  const drawFrame = frameIndex => {
    activeMapFrameIndex = frameIndex;
    updateMapYearLabel(sharedYears[frameIndex] ?? frameIndex);
    const maxAbsAnomaly = getActiveVariableMaxAbsAnomaly();
    const renderGeo = mapZoomState ?? sharedGeo;

    for (const { data, canvasId, bitmaps } of activeMapDatasets) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) continue;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      delete canvas.dataset.status;
      resizeCanvasToDisplaySize(canvas);

      // Toggle CSS class so zoomed state gets smooth interpolation
      canvas.classList.toggle('is-zoomed', !!mapZoomState);

      if (Array.isArray(bitmaps) && bitmaps[frameIndex]) {
        const bm = bitmaps[frameIndex];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        try {
          if (mapZoomState) {
            // Crop the pre-rendered bitmap to the zoomed geo region
            const g  = sharedGeo;
            const sx = ((mapZoomState.lonMin - g.lonMin) / (g.lonMax - g.lonMin)) * bm.width;
            const sy = ((g.latMax - mapZoomState.latMax) / (g.latMax - g.latMin)) * bm.height;
            const sw = Math.max(1, ((mapZoomState.lonMax - mapZoomState.lonMin) / (g.lonMax - g.lonMin)) * bm.width);
            const sh = Math.max(1, ((mapZoomState.latMax - mapZoomState.latMin) / (g.latMax - g.latMin)) * bm.height);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(bm, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          } else {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(bm, 0, 0, canvas.width, canvas.height);
          }
        } catch {
          renderMapFrame(data, frameIndex, canvasId, maxAbsAnomaly, renderGeo);
        }
      } else {
        renderMapFrame(data, frameIndex, canvasId, maxAbsAnomaly, renderGeo);
      }
    }

    const basinData = buildBasinAverages(activeMapDatasets, frameIndex);
    renderBasinChart(basinData, activeMapDatasets);
  };

  activeDrawFrame = drawFrame;
  drawFrame(0);
  setupMapBrushes(sharedGeo, drawFrame);

  if (slider) {
    let rafId = 0;
    slider.oninput = ({ target }) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => drawFrame(Number(target.value)));
    };
  }

  if (mapResizeHandler) window.removeEventListener('resize', mapResizeHandler);
  mapResizeHandler = () => {
    renderLegend();
    drawFrame(activeMapFrameIndex);
    setupMapBrushes(sharedGeo, drawFrame);
  };
  window.addEventListener('resize', mapResizeHandler);

  if (loadingEl) loadingEl.textContent = '';
  if (variableSelect) variableSelect.disabled = false;
}

function updateInfoCard(variable) {
  const info = VARIABLE_INFO[variable] ?? VARIABLE_INFO.tos;
  const labelEl = document.getElementById('var-info-label');
  const descEl  = document.getElementById('var-info-desc');
  if (labelEl) labelEl.textContent = info.label;
  if (descEl)  descEl.textContent  = info.desc;
}

async function setMapVariable(variable) {
  activeMapVariable = variable;
  updateMapCanvasIds(variable);
  updateInfoCard(variable);
  await initMap();
}

document.getElementById('variable-select')?.addEventListener('change', ({ target }) => {
  setMapVariable(target.value).catch(err => console.error('Could not switch map variable:', err));
});

document.getElementById('zoom-reset-btn')?.addEventListener('click', () => {
  mapZoomState = null;
  updateZoomResetBtn();
  activeDrawFrame?.(activeMapFrameIndex);
});

updateMapCanvasIds(activeMapVariable);
updateInfoCard(activeMapVariable);
initMap().catch(err => console.error('Could not initialize maps:', err));
