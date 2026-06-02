const mapDataCache = new Map();
const scenarioConfigs = [
  { scenario: "ssp126" },
  { scenario: "ssp245" },
  { scenario: "ssp370" },
  { scenario: "ssp585" }
];

const variableConfigs = {
  ts:  { label: "Global Temperature",    maxAbsAnomaly: 10 },
  tos: { label: "Sea Surface Temperature", maxAbsAnomaly: 10 },
  zos: { label: "Sea Level",             maxAbsAnomaly: 1  }
};

let activeMapFrameIndex = 0;
let activeMapVariable   = "tos";
let activeMapDatasets   = [];
let mapResizeHandler    = null;
let mapInitGeneration   = 0;   // incremented on every initMap call; stale calls self-abort

function getActiveVariableConfig(variable = activeMapVariable) {
  return variableConfigs[variable] ?? variableConfigs.tos;
}
function getActiveVariableMaxAbsAnomaly(variable = activeMapVariable) {
  return getActiveVariableConfig(variable).maxAbsAnomaly;
}

// ── Fetch with retry ─────────────────────────────────────────────────────────
// 3 total attempts; waits 600 ms then 1200 ms between retries.
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
// Failures are never cached so a subsequent initMap() will re-attempt the fetch.
async function fetchPrecomputedMapAnomaly(ssp, variable = "tos") {
  const cacheKey = `${variable}:${ssp}`;

  if (!mapDataCache.has(cacheKey)) {
    const request = fetchWithRetry(`../../data/map/${variable}_anom_${ssp}.json`)
      .then(async res => {
        const data = await res.json();
        if (!data || !Array.isArray(data.frames)) {
          throw new Error(`Invalid data format for ${variable}:${ssp}`);
        }
        return data;
      })
      .catch(err => {
        mapDataCache.delete(cacheKey); // don't persist failures
        throw err;
      });

    mapDataCache.set(cacheKey, request);
  }

  return mapDataCache.get(cacheKey);
}

// ── Canvas helpers ────────────────────────────────────────────────────────────

// Draw a status message (loading / error) directly on the canvas.
function drawCanvasStatus(canvasId, text, isError = false) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
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

    // Guard: canvas may have zero size if the tab hasn't painted yet
    const targetW = Math.max(1, Math.round((canvasEl.clientWidth  || 300) * dpr));
    const targetH = Math.max(1, Math.round((canvasEl.clientHeight || 150) * dpr));

    const tmpCanvas  = document.createElement('canvas');
    tmpCanvas.width  = targetW;
    tmpCanvas.height = targetH;
    const tmpCtx     = tmpCanvas.getContext('2d');
    tmpCtx.imageSmoothingEnabled = false;

    const { latMin, latMax, lonMin, lonMax } = sharedGeo || getMapGeometryMeta(ds.data);
    const { nLon, nLat } = ds.data;
    const cellW    = tmpCanvas.width  / nLon;
    const cellH    = tmpCanvas.height / nLat;
    const toX      = lon => ((lon - lonMin) / (lonMax - lonMin)) * tmpCanvas.width;
    const toY      = lat => ((latMax - lat) / (latMax - latMin)) * tmpCanvas.height;
    const maxAbs   = getActiveVariableMaxAbsAnomaly();
    const colorScale = d3.scaleDiverging(t => d3.interpolateRdBu(1 - t)).domain([-maxAbs, 0, maxAbs]);

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
    await new Promise(r => setTimeout(r, 10)); // yield to keep UI responsive
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
  const colorScale = d3.scaleDiverging(t => d3.interpolateRdBu(1 - t)).domain([-maxAbsAnomaly, 0, maxAbsAnomaly]);
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

// ── Main init ─────────────────────────────────────────────────────────────────

async function initMap() {
  const gen      = ++mapInitGeneration;
  const isStale  = () => gen !== mapInitGeneration;

  // Release bitmaps from the previous run
  for (const ds of activeMapDatasets) {
    ds.bitmaps?.forEach(b => { try { b?.close(); } catch {} });
  }
  activeMapDatasets = [];

  const slider         = document.getElementById('map-year-slider');
  const variableSelect = document.getElementById('variable-select');
  const mapsHeader     = document.querySelector('.maps-header');

  // Ensure loading indicator element exists
  let loadingEl = document.getElementById('maps-loading');
  if (!loadingEl && mapsHeader) {
    loadingEl = document.createElement('div');
    loadingEl.id = 'maps-loading';
    loadingEl.style.cssText = 'font-size:0.85rem;color:#526173;margin-top:6px;';
    mapsHeader.appendChild(loadingEl);
  }

  // Disable controls and show per-canvas loading state
  if (slider)         slider.disabled         = true;
  if (variableSelect) variableSelect.disabled = true;

  for (const { scenario } of scenarioConfigs) {
    drawCanvasStatus(getMapCanvasId(activeMapVariable, scenario), 'Loading…');
  }

  // Fetch all scenarios in parallel, tracking individual outcomes
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
        return null; // partial failure — continue with other scenarios
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

  const sharedYears    = activeMapDatasets[0].data.years || [];
  const maxFrameIndex  = Math.max(0, Math.min(...activeMapDatasets.map(d => d.data.frames.length - 1)));

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

    for (const { data, canvasId, bitmaps } of activeMapDatasets) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) continue;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      resizeCanvasToDisplaySize(canvas);

      if (Array.isArray(bitmaps) && bitmaps[frameIndex]) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        try {
          ctx.drawImage(bitmaps[frameIndex], 0, 0, canvas.width, canvas.height);
        } catch {
          renderMapFrame(data, frameIndex, canvasId, maxAbsAnomaly, sharedGeo);
        }
      } else {
        renderMapFrame(data, frameIndex, canvasId, maxAbsAnomaly, sharedGeo);
      }
    }
  };

  drawFrame(0);

  if (slider) {
    let rafId = 0;
    slider.oninput = ({ target }) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => drawFrame(Number(target.value)));
    };
  }

  if (mapResizeHandler) window.removeEventListener('resize', mapResizeHandler);
  mapResizeHandler = () => drawFrame(activeMapFrameIndex);
  window.addEventListener('resize', mapResizeHandler);

  if (loadingEl) loadingEl.textContent = '';
  if (variableSelect) variableSelect.disabled = false;
}

async function setMapVariable(variable) {
  activeMapVariable = variable;
  updateMapCanvasIds(variable);
  await initMap();
}

document.getElementById('variable-select')?.addEventListener('change', ({ target }) => {
  setMapVariable(target.value).catch(err => console.error('Could not switch map variable:', err));
});

updateMapCanvasIds(activeMapVariable);
initMap().catch(err => console.error('Could not initialize maps:', err));
