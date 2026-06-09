// globe.js — interactive globe with variable + SSP + basin selection
(function () {
  const LAND_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';

  const VAR_CONFIGS = {
    ts: { label: 'Atmospheric Temperature Anomaly', maxAbs: 10, unit: '°C anomaly', sequential: false },
    tos: { label: 'Sea Surface Temperature Anomaly', maxAbs: 10, unit: '°C anomaly', sequential: false },
    zos: { label: 'Sea Level Anomaly', maxAbs: 1, unit: 'm anomaly', sequential: false },
    storm_risk: { label: 'Storm Risk (SST > 27 °C)', maxAbs: 1, unit: 'fraction at risk', sequential: true },
    tchp: { label: 'TC Heat Potential Proxy', maxAbs: 100, unit: 'kJ/cm²', sequential: true },
  };

  const SSP_LABELS = {
    ssp126: 'SSP1-2.6', ssp245: 'SSP2-4.5',
    ssp370: 'SSP3-7.0', ssp585: 'SSP5-8.5',
  };

  const canvas = document.getElementById('globe-canvas');
  const slider = document.getElementById('globe-year-slider');
  const yearLabel = document.getElementById('globe-year-label');
  const statusEl = document.getElementById('globe-status');
  const varSelect = document.getElementById('globe-var-select');
  const sspSelect = document.getElementById('globe-ssp-select');
  if (!canvas) return;

  // ── Canvas sizing ──────────────────────────────────────────────────────────
  const dpr = window.devicePixelRatio || 1;
  // parentElement.clientWidth is 0 when hidden; fall back to 440 so canvas is pre-sized correctly
  const SIZE = Math.max(280, Math.min(440, (canvas.parentElement.clientWidth || 440) - 32));
  canvas.width = SIZE * dpr;
  canvas.height = SIZE * dpr;
  canvas.style.width = SIZE + 'px';
  canvas.style.height = SIZE + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // ── D3 projection ──────────────────────────────────────────────────────────
  const radius = SIZE / 2 - 6;
  const projection = d3.geoOrthographic()
    .scale(radius)
    .translate([SIZE / 2, SIZE / 2])
    .clipAngle(90)
    .rotate([0, -20]);

  const pathGen = d3.geoPath(projection, ctx);
  const graticule = d3.geoGraticule()();
  const sphere = { type: 'Sphere' };

  // ── State ─────────────────────────────────────────────────────────────────
  let climate = null;
  let land = null;
  let years = [];
  let frameIdx = 0;
  let activeVar = document.querySelector('.var-btn.active')?.dataset.var ?? 'ts';
  let activeSsp = 'ssp585';
  let colorScale = buildColorScale(activeVar);

  window.setGlobeVariable = (varKey) => {
    if (!VAR_CONFIGS[varKey]) return;
    activeVar = varKey;
    frameIdx = 0;
    loadData();
  };

  window.setGlobeScenario = (ssp) => {
    activeSsp = ssp;
    loadData();
  };

  function buildColorScale(varKey) {
    const { maxAbs, sequential } = VAR_CONFIGS[varKey];
    if (sequential)
      return d3.scaleSequential(d3.interpolateYlOrRd).domain([0, maxAbs]);
    return d3.scaleDiverging(t => d3.interpolateRdBu(1 - t))
      .domain([-maxAbs, 0, maxAbs]);
  }

  function latLonForIndex(d, i) {
    if (d.lats.length === d.frames[0].length)
      return { lat: d.lats[i], lon: d.lons[i] };
    return { lat: d.lats[Math.floor(i / d.nLon)], lon: d.lons[i % d.nLon] };
  }

  // ── Draw ──────────────────────────────────────────────────────────────────
  function draw() {
    ctx.clearRect(0, 0, SIZE, SIZE);

    ctx.beginPath(); pathGen(sphere);
    ctx.fillStyle = '#dbeafe'; ctx.fill();

    if (climate) {
      const frame = climate.frames[frameIdx];
      const [rl, rp] = projection.rotate();
      const cLon = -rl, cLat = -rp;
      const cellPx = Math.max(1.5, radius * (360 / climate.nLon) * Math.PI / 180) * 1.05;

      for (let i = 0; i < frame.length; i++) {
        const v = frame[i];
        if (v == null || !Number.isFinite(v)) continue;
        const { lat, lon } = latLonForIndex(climate, i);
        if (lat == null) continue;

        const φ1 = lat * Math.PI / 180, φ2 = cLat * Math.PI / 180;
        const Δλ = (lon - cLon) * Math.PI / 180;
        if (Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ) < 0)
          continue;

        const p = projection([lon, lat]);
        if (!p) continue;

        ctx.fillStyle = colorScale(v);
        ctx.fillRect(p[0] - cellPx / 2, p[1] - cellPx / 2, cellPx, cellPx);
      }
    
    }

    ctx.beginPath(); pathGen(graticule);
    ctx.strokeStyle = 'rgba(100,116,139,0.18)';
    ctx.lineWidth = 0.5; ctx.stroke();

    if (land) {
      ctx.beginPath(); pathGen(land);
      ctx.fillStyle = '#8db87a';
      ctx.fill();
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 0.6; ctx.stroke();
    }

    ctx.beginPath(); pathGen(sphere);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1; ctx.stroke();
  }

  // ── Drag to rotate ────────────────────────────────────────────────────────
  let rotStart = null, dragOrigin = null;
  d3.select(canvas).call(
    d3.drag()
      .on('start', e => {
        rotStart = projection.rotate().slice();
        dragOrigin = [e.x, e.y];
        canvas.style.cursor = 'grabbing';
      })
      .on('drag', e => {
        const dx = e.x - dragOrigin[0], dy = e.y - dragOrigin[1];
        projection.rotate([
          rotStart[0] + dx * 0.4,
          Math.max(-90, Math.min(90, rotStart[1] - dy * 0.4)),
        ]);
        draw();
      })
      .on('end', () => { canvas.style.cursor = 'grab'; })
  );

  // ── Legend ────────────────────────────────────────────────────────────────
  function drawLegend() {
    const svgEl = document.getElementById('globe-legend-svg');
    if (!svgEl) return;
    const { maxAbs, unit, sequential } = VAR_CONFIGS[activeVar];

    const totalW = Math.max(svgEl.clientWidth || 600, 300);
    const totalH = 52;
    const mL = 48, mR = 48;
    const barW = totalW - mL - mR;
    const barH = 14;
    const barY = 8;

    d3.select(svgEl).selectAll('*').remove();
    d3.select(svgEl)
      .attr('viewBox', `0 0 ${totalW} ${totalH}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const svg = d3.select(svgEl);
    const defs = svg.append('defs');
    const grad = defs.append('linearGradient').attr('id', 'globe-grad')
      .attr('x1', '0%').attr('x2', '100%');

    const stops = d3.range(0, 1.001, 0.05);
    if (sequential) {
      stops.forEach(t => grad.append('stop')
        .attr('offset', `${(t * 100).toFixed(1)}%`)
        .attr('stop-color', d3.interpolateYlOrRd(t)));
    } else {
      stops.forEach(t => grad.append('stop')
        .attr('offset', `${(t * 100).toFixed(1)}%`)
        .attr('stop-color', d3.interpolateRdBu(1 - t)));
    }

    svg.append('rect')
      .attr('x', mL).attr('y', barY)
      .attr('width', barW).attr('height', barH)
      .attr('fill', 'url(#globe-grad)').attr('rx', 4);

    svg.append('rect')
      .attr('x', mL).attr('y', barY)
      .attr('width', barW).attr('height', barH)
      .attr('fill', 'none')
      .attr('stroke', '#dbe3ee').attr('stroke-width', 1)
      .attr('rx', 4);

    const domain = sequential ? [0, maxAbs] : [-maxAbs, maxAbs];
    const xScale = d3.scaleLinear().domain(domain).range([mL, mL + barW]);
    const nTicks = 5;
    const tickVals = sequential
      ? d3.range(0, nTicks).map(i => maxAbs * i / (nTicks - 1))
      : d3.range(0, nTicks).map(i => -maxAbs + (2 * maxAbs) * i / (nTicks - 1));

    svg.selectAll('.ltick')
      .data(tickVals).join('line').attr('class', 'ltick')
      .attr('x1', d => xScale(d)).attr('x2', d => xScale(d))
      .attr('y1', barY + barH).attr('y2', barY + barH + 4)
      .attr('stroke', '#94a3b8').attr('stroke-width', 1);

    const fmt = v => {
      if (maxAbs >= 10) return v.toFixed(0);
      if (maxAbs >= 1) return v.toFixed(1);
      return v.toFixed(2);
    };

    svg.selectAll('.llabel')
      .data(tickVals).join('text').attr('class', 'llabel')
      .attr('x', d => xScale(d))
      .attr('y', barY + barH + 16)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px').attr('fill', '#526173')
      .text(fmt);

    svg.append('text')
      .attr('x', mL + barW / 2).attr('y', totalH - 1)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px').attr('fill', '#94a3b8')
      .text(unit);
  }

  function updateSubtitle() {
    const el = document.getElementById('globe-demo-sub');
    if (el) el.textContent =
      `${SSP_LABELS[activeSsp]} · ${VAR_CONFIGS[activeVar].label} · Drag to rotate`;
  }

  // ── Load data ─────────────────────────────────────────────────────────────
  function fetchJson(path) {
    return fetch(path).then(r => r.json());
  }

  function loadData() {
    if (statusEl) statusEl.textContent = 'Loading…';
    slider.disabled = true;
    climate = null;
    draw();

    let promise;
    const ssp = activeSsp;
    if (activeVar === 'storm_risk') {
      promise = fetchJson(`../../data/map/tos_raw_${ssp}.json`)
        .then(computeStormRiskData);
    } else if (activeVar === 'tchp') {
      promise = Promise.all([
        fetchJson(`../../data/map/tos_anom_${ssp}.json`),
        fetchJson(`../../data/map/zos_anom_${ssp}.json`),
      ]).then(([tosAnom, zosAnom]) => computeTCHPData(tosAnom, zosAnom));
    } else {
      promise = fetchJson(`../../data/map/${activeVar}_anom_${ssp}.json`);
    }

    promise.then(cd => {
      climate = cd;
      years = cd.years || [];
      frameIdx = Math.min(frameIdx, cd.frames.length - 1);
      slider.min = 0; slider.max = cd.frames.length - 1;
      slider.value = frameIdx; slider.disabled = false;
      if (yearLabel) yearLabel.textContent = years[frameIdx] ?? '';
      if (statusEl) statusEl.textContent = '';
      colorScale = buildColorScale(activeVar);
      drawLegend();
      updateSubtitle();
      draw();
    }).catch(err => {
      console.error('Globe load error:', err);
      if (statusEl) statusEl.textContent = 'Failed to load data.';
    });
  }

  // Load land topology once, then initial data load
  if (statusEl) statusEl.textContent = 'Loading globe data…';
  fetch(LAND_URL).then(r => r.json()).catch(() => null).then(landTopo => {
    if (landTopo) land = topojson.feature(landTopo, landTopo.objects.land);
    loadData();
  });

  slider.addEventListener('input', () => {
    frameIdx = +slider.value;
    if (yearLabel) yearLabel.textContent = years[frameIdx] ?? frameIdx;
    draw();
  });

  if (varSelect) varSelect.addEventListener('change', () => {
    activeVar = varSelect.value;
    loadData();
  });

  if (sspSelect) sspSelect.addEventListener('change', () => {
    activeSsp = sspSelect.value;
    loadData();
  });

  // ── Basin spin ────────────────────────────────────────────────────────────
  let spinTimer = null;

  function spinToBasin(targetLon, targetLat) {
    if (spinTimer) { cancelAnimationFrame(spinTimer); spinTimer = null; }
    const startRot = projection.rotate().slice();
    let deltaLon = -targetLon - startRot[0];
    while (deltaLon > 180) deltaLon -= 360;
    while (deltaLon < -180) deltaLon += 360;
    const endRot = [startRot[0] + deltaLon, -targetLat];
    const rotateFn = d3.interpolate(startRot, endRot);
    const duration = 900;
    const t0 = performance.now();

    function step(now) {
      const t = Math.min((now - t0) / duration, 1);
      projection.rotate(rotateFn(d3.easeCubicInOut(t)));
      draw();
      if (t < 1) spinTimer = requestAnimationFrame(step);
      else spinTimer = null;
    }
    spinTimer = requestAnimationFrame(step);
  }

  document.querySelectorAll('.globe-basin-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.globe-basin-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      spinToBasin(+btn.dataset.lon, +btn.dataset.lat);
    });
  });

  document.addEventListener('globe:show', () => {
    const newVar = document.querySelector('.var-btn.active')?.dataset.var ?? activeVar;
    if (newVar !== activeVar) {
      activeVar = newVar;
      colorScale = buildColorScale(activeVar);
      loadData();
    } else {
      draw();
      drawLegend();
    }
  });
})();
