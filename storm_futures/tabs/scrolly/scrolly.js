// scrolly.js — TCHP globe for scrollytelling tab
(function () {
  const LAND_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';
  const TCHP_MAX = 100; // kJ/cm²

  const canvas    = document.getElementById('globe-canvas');
  const slider    = document.getElementById('globe-year-slider');
  const yearLabel = document.getElementById('globe-year-label');
  const statusEl  = document.getElementById('globe-status');
  if (!canvas) return;

  // ── Canvas sizing ─────────────────────────────────────────────────────────
  const dpr  = window.devicePixelRatio || 1;
  const SIZE = Math.max(550, Math.min(500, (canvas.parentElement.clientWidth || 500) - 16));
  canvas.width  = SIZE * dpr;
  canvas.height = SIZE * dpr;
  canvas.style.width  = SIZE + 'px';
  canvas.style.height = SIZE + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // ── D3 projection ─────────────────────────────────────────────────────────
  const radius = SIZE / 2 - 6;
  const projection = d3.geoOrthographic()
    .scale(radius)
    .translate([SIZE / 2, SIZE / 2])
    .clipAngle(90)
    .rotate([0, -20]);

  const pathGen   = d3.geoPath(projection, ctx);
  const graticule = d3.geoGraticule()();
  const sphere    = { type: 'Sphere' };

  const colorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, TCHP_MAX]);

  // ── State ─────────────────────────────────────────────────────────────────
  let climate  = null;
  let land     = null;
  let years    = [];
  let frameIdx = 0;
  let activeSsp = 'ssp126';

  // ── Auto-rotation ─────────────────────────────────────────────────────────
  let autoRotating = false;
  let autoRafId    = null;
  let resumeTimer  = null;

  function autoRotateStep() {
    if (!autoRotating) return;
    const r = projection.rotate();
    projection.rotate([r[0] + 0.12, r[1]]);
    draw();
    autoRafId = requestAnimationFrame(autoRotateStep);
  }

  function pauseAutoRotate() {
    autoRotating = false;
    if (autoRafId) { cancelAnimationFrame(autoRafId); autoRafId = null; }
    if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
    resumeTimer = setTimeout(startAutoRotate, 2000);
  }

  function startAutoRotate() {
    if (autoRafId) cancelAnimationFrame(autoRafId);
    autoRotating = true;
    autoRotateStep();
  }

  // ── Draw ──────────────────────────────────────────────────────────────────
  function latLonForIndex(d, i) {
    if (d.lats.length === d.frames[0].length)
      return { lat: d.lats[i], lon: d.lons[i] };
    return { lat: d.lats[Math.floor(i / d.nLon)], lon: d.lons[i % d.nLon] };
  }

  function draw() {
    ctx.clearRect(0, 0, SIZE, SIZE);

    ctx.beginPath(); pathGen(sphere);
    ctx.fillStyle = '#dbeafe'; ctx.fill();

    if (climate) {
      const frame    = climate.frames[frameIdx];
      const [rl, rp] = projection.rotate();
      const cLon = -rl, cLat = -rp;
      const cellPx = Math.max(1.5, radius * (360 / climate.nLon) * Math.PI / 180) * 1.05;

      for (let i = 0; i < frame.length; i++) {
        const v = frame[i];
        if (v == null || !Number.isFinite(v) || v <= 0) continue;
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
        pauseAutoRotate();
        rotStart   = projection.rotate().slice();
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

    const totalW = Math.max(svgEl.clientWidth || 500, 300);
    const totalH = 52;
    const mL = 48, mR = 48;
    const barW = totalW - mL - mR;
    const barH = 14, barY = 8;

    d3.select(svgEl).selectAll('*').remove();
    d3.select(svgEl)
      .attr('viewBox', `0 0 ${totalW} ${totalH}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const svg  = d3.select(svgEl);
    const defs = svg.append('defs');
    const grad = defs.append('linearGradient').attr('id', 'scrolly-tchp-grad')
      .attr('x1', '0%').attr('x2', '100%');
    d3.range(0, 1.001, 0.05).forEach(t =>
      grad.append('stop')
        .attr('offset', `${(t * 100).toFixed(1)}%`)
        .attr('stop-color', d3.interpolateYlOrRd(t))
    );

    svg.append('rect')
      .attr('x', mL).attr('y', barY)
      .attr('width', barW).attr('height', barH)
      .attr('fill', 'url(#scrolly-tchp-grad)').attr('rx', 4);
    svg.append('rect')
      .attr('x', mL).attr('y', barY)
      .attr('width', barW).attr('height', barH)
      .attr('fill', 'none').attr('stroke', '#dbe3ee').attr('stroke-width', 1).attr('rx', 4);

    const xScale  = d3.scaleLinear().domain([0, TCHP_MAX]).range([mL, mL + barW]);
    const tickVals = d3.range(0, 5).map(i => TCHP_MAX * i / 4);

    svg.selectAll('.ltick').data(tickVals).join('line').attr('class', 'ltick')
      .attr('x1', d => xScale(d)).attr('x2', d => xScale(d))
      .attr('y1', barY + barH).attr('y2', barY + barH + 4)
      .attr('stroke', '#94a3b8').attr('stroke-width', 1);

    svg.selectAll('.llabel').data(tickVals).join('text').attr('class', 'llabel')
      .attr('x', d => xScale(d)).attr('y', barY + barH + 16)
      .attr('text-anchor', 'middle').attr('font-size', '10px').attr('fill', '#526173')
      .text(d => d.toFixed(0));

    svg.append('text')
      .attr('x', mL + barW / 2).attr('y', totalH - 1)
      .attr('text-anchor', 'middle').attr('font-size', '10px').attr('fill', '#94a3b8')
      .text('kJ/cm² — TC Heat Potential Proxy');
  }

  // ── TCHP computation (inline from map.js) ─────────────────────────────────
  function computeTCHPData(tosAnom, zosAnom) {
    const K = 4097844 / 1e7;
    const frames = tosAnom.frames.map((tosFrame, fi) => {
      const zosFrame = zosAnom.frames[fi];
      return tosFrame.map((sst, idx) => {
        if (sst == null || !Number.isFinite(sst)) return null;
        const sla = (zosFrame && zosFrame[idx] != null && Number.isFinite(zosFrame[idx]))
          ? zosFrame[idx] : 0;
        return K * Math.max(sst, 0) * (75 + 4 * sla);
      });
    });
    return {
      frames,
      lats: tosAnom.lats, lons: tosAnom.lons,
      nLat: tosAnom.nLat, nLon: tosAnom.nLon,
      years: tosAnom.years,
    };
  }

  // ── Load data ─────────────────────────────────────────────────────────────
  function loadData() {
    if (statusEl) statusEl.textContent = 'Loading…';
    if (autoRafId) { cancelAnimationFrame(autoRafId); autoRafId = null; }
    autoRotating = false;
    slider.disabled = true;
    climate = null;
    draw();

    Promise.all([
      fetch(`../../data/map/tos_anom_${activeSsp}.json`).then(r => r.json()),
      fetch(`../../data/map/zos_anom_${activeSsp}.json`).then(r => r.json()),
    ]).then(([tosAnom, zosAnom]) => {
      climate  = computeTCHPData(tosAnom, zosAnom);
      years    = climate.years || [];
      frameIdx = Math.min(frameIdx, climate.frames.length - 1);
      slider.min   = 0;
      slider.max   = climate.frames.length - 1;
      slider.value = frameIdx;
      slider.disabled = false;
      if (yearLabel) yearLabel.textContent = years[frameIdx] ?? '';
      if (statusEl)  statusEl.textContent  = '';
      drawLegend();
      startAutoRotate();
    }).catch(err => {
      console.error('Scrolly globe load error:', err);
      if (statusEl) statusEl.textContent = 'Failed to load data.';
    });
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  if (statusEl) statusEl.textContent = 'Loading…';
  fetch(LAND_URL).then(r => r.json()).catch(() => null).then(landTopo => {
    if (landTopo) land = topojson.feature(landTopo, landTopo.objects.land);
    loadData();
  });

  // ── Year slider autoplay ──────────────────────────────────────────────────
  const playBtn = document.getElementById('scrolly-play-btn');
  let playTimer = null;

  function atEnd() { return +slider.value >= +slider.max && +slider.max > 0; }

  function syncPlayBtn() {
    if (!playBtn) return;
    if (playTimer) {
      playBtn.innerHTML = '&#9208;';
      playBtn.setAttribute('aria-label', 'Pause animation');
    } else if (atEnd()) {
      playBtn.innerHTML = '&#8635;';
      playBtn.setAttribute('aria-label', 'Restart animation');
    } else {
      playBtn.innerHTML = '&#9654;';
      playBtn.setAttribute('aria-label', 'Play animation');
    }
  }

  function stopPlay() {
    clearInterval(playTimer);
    playTimer = null;
    syncPlayBtn();
  }

  function playStep() {
    if (atEnd()) { stopPlay(); return; }
    slider.value = +slider.value + 1;
    frameIdx = +slider.value;
    if (yearLabel) yearLabel.textContent = years[frameIdx] ?? frameIdx;
    draw();
    if (atEnd()) syncPlayBtn();
  }

  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (playTimer) {
        stopPlay();
      } else if (atEnd()) {
        slider.value = 0;
        frameIdx = 0;
        if (yearLabel) yearLabel.textContent = years[0] ?? '';
        draw();
        syncPlayBtn();
      } else {
        playBtn.innerHTML = '&#9208;';
        playBtn.setAttribute('aria-label', 'Pause animation');
        playTimer = setInterval(playStep, 150);
      }
    });

    new MutationObserver(() => { playBtn.disabled = slider.disabled; })
      .observe(slider, { attributes: true, attributeFilter: ['disabled'] });
  }

  slider.addEventListener('input', () => {
    pauseAutoRotate();
    stopPlay();
    frameIdx = +slider.value;
    if (yearLabel) yearLabel.textContent = years[frameIdx] ?? frameIdx;
    syncPlayBtn();
    draw();
  });

  document.querySelectorAll('.ssp-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ssp-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeSsp = btn.dataset.ssp;
      loadData();
    });
  });
})();
