(() => {
  'use strict';
  // Mirror World: Hyderabad v2 — app logic written by Tab. tour.js (camera fly-through) and legend.css were written by Freebuff.

  const SAT_BOUNDS = [[78.20, 17.62], [78.72, 17.62], [78.72, 17.20], [78.20, 17.20]];
  const PRED_BOUNDS = [[77.95, 17.85], [78.95, 17.85], [78.95, 16.95], [77.95, 16.95]];
  // Imagery: whole-scene Landsat tiles rendered live by Microsoft Planetary Computer's free data API (no key);
  // the pre-rendered core images on the helper sites are only a fallback if those tiles fail.
  const PHOTOS = [
    { year: 1990, tiles: 'https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?collection=landsat-c2-l2&item=LT05_L2SP_144048_19900209_02_T1&assets=red&assets=green&assets=blue&format=webp&rescale=8810,16625&rescale=9054,15393&rescale=8951,14140&color_formula=gamma%20RGB%201.18%2C%20saturation%201.25', url: "https://mirror-hyderabad-sat1.sites.tab.bot/c/1990.webp", label: 'Landsat 5 · 9 Feb 1990 · 30 m' },
    { year: 2000, tiles: 'https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?collection=landsat-c2-l2&item=LE07_L2SP_144048_20000229_02_T1&assets=red&assets=green&assets=blue&format=webp&rescale=8781,16624&rescale=8842,15155&rescale=8874,14596&color_formula=gamma%20RGB%201.18%2C%20saturation%201.25', url: "https://mirror-hyderabad-sat1.sites.tab.bot/c/2000.webp", label: 'Landsat 7 · 29 Feb 2000 · 30 m' },
    { year: 2010, tiles: 'https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?collection=landsat-c2-l2&item=LT05_L2SP_144048_20100131_02_T1&assets=red&assets=green&assets=blue&format=webp&rescale=9066,15477&rescale=9026,15545&rescale=9108,15088&color_formula=gamma%20RGB%201.18%2C%20saturation%201.25', url: "https://mirror-hyderabad-sat2.sites.tab.bot/c/2010.webp", label: 'Landsat 5 · 31 Jan 2010 · 30 m' },
    { year: 2020, tiles: 'https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?collection=landsat-c2-l2&item=LC08_L2SP_144048_20200127_02_T1&assets=red&assets=green&assets=blue&format=webp&rescale=8479,15267&rescale=8402,15229&rescale=8311,15057&color_formula=gamma%20RGB%201.18%2C%20saturation%201.25', url: "https://mirror-hyderabad-sat2.sites.tab.bot/c/2020.webp", label: 'Landsat 8 · 27 Jan 2020 · 30 m' },
    { year: 2026, tiles: 'https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?collection=landsat-c2-l2&item=LC09_L2SP_144048_20260220_02_T1&assets=red&assets=green&assets=blue&format=webp&rescale=8182,16000&rescale=8182,16000&rescale=8182,16000&color_formula=gamma%20RGB%201.18%2C%20saturation%201.25', url: null, label: 'Landsat 9 · 20 Feb 2026 · 30 m' },
  ];
  const SCENE_BOUNDS = [77.2, 16.45, 79.25, 18.3];
  const NOW = 2026, END = 2040;
  const START = { center: [78.435, 17.40], zoom: 11.4, pitch: 62, bearing: -22 };
  const CHARMINAR = [78.47475, 17.36163];
  let city = null, cityIndex = null, timeDim = 1, todToggle = null;
  const TIME_DIM = { day: 1, dusk: 0.62, night: 0.32 };
  function setTimeOfDay(name, fromUser) {
    const S = window.MirrorStyle; if (!S || !map) return;
    timeDim = TIME_DIM[name] || 1;
    if (city) city.setTime(name);
    try { map.setSky(S.SKY[name]); } catch (e) {}
    // streets: daylight greys, warm sodium light at night
    const nightRoad = name === 'night', duskRoad = name === 'dusk';
    if (map.getLayer('roads')) {
      map.setPaintProperty('roads', 'line-color', nightRoad ? ['match', ['get', 'class'], ['motorway', 'trunk'], '#ffbf5e', 'primary', '#ffb054', '#d9904a'] : ['match', ['get', 'class'], ['motorway', 'trunk'], '#ffd38a', 'primary', '#f6efe2', 'secondary', '#ebe5d8', '#d9d4ca']);
      map.setPaintProperty('road-casing', 'line-color', nightRoad ? 'rgba(255,150,60,0.18)' : 'rgba(10,14,18,0.55)');
      map.setPaintProperty('road-casing', 'line-blur', nightRoad ? 6 : 0);
      map.setPaintProperty('roads', 'line-blur', nightRoad ? 0.6 : 0);
    }
    if (map.getLayer('viaduct')) map.setPaintProperty('viaduct', 'fill-extrusion-color', nightRoad ? '#6b6f80' : duskRoad ? ['get', 'color'] : ['get', 'color']);
    if (todToggle && !fromUser) todToggle.set(name);
    applyYear(year);
  }
  function setupTimeOfDay() {
    const S = window.MirrorStyle; if (!S || todToggle) return;
    todToggle = S.createTimeToggle(document.querySelector('.map-tools') || document.body, (n) => setTimeOfDay(n, true), 'day');
    setTimeOfDay('day');
  }
  const DEV_TILES = /[?&]devtiles\b/.test(location.search);
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IS_PHONE = Math.min(window.innerWidth, window.innerHeight) < 600;

  const $ = (id) => document.getElementById(id);
  const world = $('world'), slider = $('yearSlider'), yearNumber = $('yearNumber'), yearKicker = $('yearKicker');
  const areaValue = $('areaValue'), badge = $('predictionBadge'), chip = $('photoChip'), status = $('timelineStatus');
  const playButton = $('playButton'), playLabel = $('playLabel'), toastEl = $('toast'), caption = $('tourCaption');
  const legend = $('whyLegend'), divider = $('compareDivider');

  let map, compareMap = null, tour = null, meta = null;
  let year = NOW, leftYear = 1990, comparing = false, comparePos = 50, introRunning = false, toastTimer = 0, captionTimer = 0;
  let syncing = false;

  // ---------- helpers ----------
  function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 2400); }
  function showCaption(name, sub) {
    caption.innerHTML = ''; caption.append(document.createTextNode(name));
    if (sub) { const s = document.createElement('small'); s.textContent = sub; caption.append(s); }
    caption.classList.add('visible'); clearTimeout(captionTimer);
    captionTimer = setTimeout(() => caption.classList.remove('visible'), 2600);
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // weights of each real photo for a given year (cross-fade between neighbours)
  function photoWeights(y) {
    const w = PHOTOS.map(() => 0);
    if (y >= NOW) { w[PHOTOS.length - 1] = 1; return w; }
    for (let i = 0; i < PHOTOS.length - 1; i++) {
      const a = PHOTOS[i].year, b = PHOTOS[i + 1].year;
      if (y >= a && y <= b) { const t = (y - a) / (b - a); w[i] = 1 - t; w[i + 1] = t; return w; }
    }
    w[0] = 1; return w;
  }
  function builtFor(y) {
    if (!meta) return null;
    const s = meta.stats; const pts = [[1990, s['1990']], [2000, s['2000']], [2010, s['2010']], [2020, s['2020']], [2025, s['2025']], [2040, s['2040']]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, va] = pts[i], [b, vb] = pts[i + 1];
      if (y >= a && y <= b) return Math.round(lerp(va, vb, (y - a) / (b - a)));
    }
    return y < 1990 ? s['1990'] : s['2040'];
  }

  // ---------- style ----------
  function baseStyle() {
    return {
      version: 8,
      glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      sky: { 'sky-color': '#0d1d2e', 'horizon-color': '#e9a46a', 'fog-color': '#15232d', 'sky-horizon-blend': 0.55, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.35, 'atmosphere-blend': 0.6 },
      light: { anchor: 'viewport', color: '#fff1dc', intensity: 0.42, position: [1.35, 215, 38] },
      sources: {
        esri: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics' }
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#0c161b' } },
        { id: 'esri', type: 'raster', source: 'esri', paint: { 'raster-saturation': -0.2, 'raster-brightness-max': 0.8, 'raster-contrast': 0.05, 'raster-opacity': 1 } }
      ]
    };
  }

  function addPhotoLayers(m) {
    PHOTOS.forEach((p) => {
      m.addSource(`sat-${p.year}`, { type: 'raster', tiles: [p.tiles], tileSize: 256, minzoom: 7, maxzoom: 13, bounds: SCENE_BOUNDS, attribution: 'Landsat: USGS/NASA via Microsoft Planetary Computer' });
      m.addLayer({ id: `sat-${p.year}`, type: 'raster', source: `sat-${p.year}`, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0, 'raster-fade-duration': 200, 'raster-resampling': 'linear' } });
    });
  }
  // if the live Landsat tiles fail, fall back to the pre-rendered core images
  const tileErrors = {}; const fallbackAdded = {};
  function watchTileErrors(m) {
    m.on('error', (e) => {
      const id = e && e.sourceId; if (!id || !id.startsWith('sat-') || id.endsWith('-fb')) return;
      tileErrors[id] = (tileErrors[id] || 0) + 1;
      const yr = +id.slice(4), p = PHOTOS.find((q) => q.year === yr);
      if (tileErrors[id] >= 3 && p && p.url && !fallbackAdded[id]) {
        fallbackAdded[id] = true;
        m.addSource(id + '-fb', { type: 'image', url: p.url, coordinates: SAT_BOUNDS });
        m.addLayer({ id: id + '-fb', type: 'raster', source: id + '-fb', paint: { 'raster-opacity': 0, 'raster-fade-duration': 0 } }, id);
        applyYear(year, m);
      }
    });
  }

  function outsideMask() {
    const [w, n] = SAT_BOUNDS[0], [e, s] = SAT_BOUNDS[2];
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[70, 10], [90, 10], [90, 25], [70, 25], [70, 10]], [[w, s], [w, n], [e, n], [e, s], [w, s]]] } };
  }

  function charminarModel() {
    // A simple hand-built Charminar (1591): 20 m square body, upper storey, four 56 m minarets with galleries and domes.
    const [lon0, lat0] = CHARMINAR, mLat = 1 / 111320, mLon = 1 / (111320 * Math.cos(lat0 * Math.PI / 180));
    const sq = (half) => [[[-half, -half], [half, -half], [half, half], [-half, half], [-half, -half]].map(([x, y]) => [lon0 + x * mLon, lat0 + y * mLat])];
    const circ = (cx, cy, r, n = 14) => { const pts = []; for (let k = 0; k <= n; k++) { const a = (k / n) * Math.PI * 2; pts.push([lon0 + (cx + Math.cos(a) * r) * mLon, lat0 + (cy + Math.sin(a) * r) * mLat]); } return [pts]; };
    const f = [];
    const add = (coords, base, height, color) => f.push({ type: 'Feature', properties: { base, height, color }, geometry: { type: 'Polygon', coordinates: coords } });
    add(sq(10), 0, 21, '#e9d6ae');
    add(sq(8.6), 21, 27, '#dcc59a');
    add(sq(5.5), 27, 31, '#f0e2c0');
    [[-9.4, -9.4], [9.4, -9.4], [9.4, 9.4], [-9.4, 9.4]].forEach(([x, y]) => {
      add(circ(x, y, 2.4), 0, 47, '#efdcb4');
      add(circ(x, y, 3.3), 23, 24.6, '#cdb488');
      add(circ(x, y, 3.1), 34, 35.4, '#cdb488');
      add(circ(x, y, 2.9), 44, 45.4, '#cdb488');
      add(circ(x, y, 2.5), 47, 50, '#f4e6c6');
      add(circ(x, y, 2.2), 50, 52.5, '#f6ead0');
      add(circ(x, y, 1.6), 52.5, 54.5, '#f8eed8');
      add(circ(x, y, 0.9), 54.5, 56, '#faf2e2');
      add(circ(x, y, 0.3), 56, 58, '#d9b46a');
    });
    // Hussain Sagar Buddha (1992): ~18 m white granite monolith on the 10 m base mapped in OSM
    const BUD = [78.47501, 17.41557], bLat = 1 / 111320, bLon = 1 / (111320 * Math.cos(BUD[1] * Math.PI / 180));
    const bc = (r, n = 14) => { const pts = []; for (let k = 0; k <= n; k++) { const a = (k / n) * Math.PI * 2; pts.push([BUD[0] + Math.cos(a) * r * bLon, BUD[1] + Math.sin(a) * r * bLat]); } return [pts]; };
    add(bc(2.6), 10, 12, '#d9d3c7'); add(bc(1.9), 12, 24.5, '#f4f1ea'); add(bc(1.5), 24.5, 26.5, '#f7f4ee'); add(bc(1.1), 26.5, 28.4, '#faf8f3');
    return { type: 'FeatureCollection', features: f };
  }

  function addCityLayers(m) {
    m.addSource('omt', { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © OpenMapTiles · © OpenStreetMap contributors' });
    addPhotoLayers(m);
    watchTileErrors(m);
    m.addSource('pred', { type: 'image', url: 'data/pred2040.png', coordinates: PRED_BOUNDS });
    m.addLayer({ id: 'pred', type: 'raster', source: 'pred', paint: { 'raster-opacity': 0, 'raster-fade-duration': 0, 'raster-resampling': 'nearest' } });

    m.addSource('corridors', { type: 'geojson', data: 'data/corridors.json' });
    m.addLayer({ id: 'fc-zone', type: 'fill', source: 'corridors', filter: ['==', ['get', 'k'], 'fc'], paint: { 'fill-color': '#c084fc', 'fill-opacity': 0 } });
    m.addLayer({ id: 'fc-line', type: 'line', source: 'corridors', filter: ['==', ['get', 'k'], 'fc'], paint: { 'line-color': '#c084fc', 'line-width': 1.5, 'line-dasharray': [2, 2], 'line-opacity': 0 } });
    m.addLayer({ id: 'orr-glow', type: 'line', source: 'corridors', filter: ['==', ['get', 'k'], 'orr'], layout: { 'line-join': 'round' }, paint: { 'line-color': '#3ff0d8', 'line-width': 7, 'line-blur': 5, 'line-opacity': 0.25 } });
    m.addLayer({ id: 'orr', type: 'line', source: 'corridors', filter: ['==', ['get', 'k'], 'orr'], layout: { 'line-join': 'round' }, paint: { 'line-color': '#7ffff0', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 14, 2.5], 'line-opacity': 0.75 } });
    m.addLayer({ id: 'rrr', type: 'line', source: 'corridors', filter: ['match', ['get', 'k'], ['rrr', 'rrr_s'], true, false], layout: { 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 1.8, 'line-dasharray': ['case', ['==', ['get', 'k'], 'rrr_s'], ['literal', [1, 2]], ['literal', [3, 1.5]]], 'line-opacity': 0 } });
    m.addLayer({ id: 'metro2', type: 'line', source: 'corridors', filter: ['==', ['get', 'k'], 'metro2'], layout: { 'line-cap': 'round' }, paint: { 'line-color': '#ffb020', 'line-width': 2.2, 'line-dasharray': [1.5, 1.2], 'line-opacity': 0 } });
    m.addLayer({ id: 'metro', type: 'line', source: 'corridors', filter: ['==', ['get', 'k'], 'metro'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['match', ['get', 'line'], 'red', '#ff4d6d', 'green', '#36e27a', '#4da3ff'], 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.4, 15, 4], 'line-opacity': 0 } });

    // v3: roads with casing (OpenFreeMap / OSM), drawn on the photo under the 3D city
    const MAJOR = ['match', ['get', 'class'], ['motorway', 'trunk'], true, false];
    m.addLayer({ id: 'road-casing', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 11.5,
      filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'], true, false],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': 'rgba(10,14,18,0.55)', 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 12, ['case', MAJOR, 2.5, 1], 15, ['match', ['get', 'class'], ['motorway', 'trunk'], 11, 'primary', 9, 'secondary', 7, 'tertiary', 5.5, 3.2], 18, ['match', ['get', 'class'], ['motorway', 'trunk'], 40, 'primary', 32, 'secondary', 26, 'tertiary', 20, 12]],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 11.5, 0, 12.5, ['match', ['get', 'class'], ['minor', 'service'], 0, 0.9], 14.5, 0.9] } });
    m.addLayer({ id: 'roads', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 11.5,
      filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'], true, false],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': ['match', ['get', 'class'], ['motorway', 'trunk'], '#ffd38a', 'primary', '#f6efe2', 'secondary', '#ebe5d8', '#d9d4ca'],
        'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 12, ['case', MAJOR, 1.4, 0.5], 15, ['match', ['get', 'class'], ['motorway', 'trunk'], 8, 'primary', 6.5, 'secondary', 5, 'tertiary', 3.8, 2], 18, ['match', ['get', 'class'], ['motorway', 'trunk'], 34, 'primary', 27, 'secondary', 22, 'tertiary', 16, 9]],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 11.5, 0, 12.5, ['match', ['get', 'class'], ['minor', 'service'], 0, 0.55], 14.5, ['match', ['get', 'class'], ['minor', 'service'], 0.45, 0.62]] } });
    // centre-line dashes on big roads when close
    m.addLayer({ id: 'road-dash', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 15.5,
      filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], true, false],
      paint: { 'line-color': '#fffaf0', 'line-width': 1, 'line-dasharray': [3, 4], 'line-opacity': 0.7 } });

    // City-wide 3D "growth skyline": one bar per ~525 m cell. Bar height = GHSL built-up share of that cell for the slider year (exaggerated); colour = decade it was first built up.
    m.addSource('grid', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    m.addLayer({ id: 'grid', type: 'fill-extrusion', source: 'grid', maxzoom: 12.9, paint: {
      'fill-extrusion-height': 0, 'fill-extrusion-base': 0, 'fill-extrusion-color': '#4fd1ff',
      'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 11.6, 0.82, 12.6, 0],
      'fill-extrusion-vertical-gradient': true,
      'fill-extrusion-height-transition': { duration: 450, delay: 0 }
    } });
    // Close-up 3D buildings: OSM footprints (OpenFreeMap tiles). Only ~0.2% of Hyderabad's OSM buildings carry a height or levels;
    // those use it, the rest are drawn at 2–4 floors (varied per building) so streets don't look like one flat slab.
        const tagged = ['>', ['to-number', ['coalesce', ['get', 'render_height'], 5]], 5.5];
    const h = ['case', tagged, ['to-number', ['get', 'render_height']], ['+', 6.5, ['*', 3.2, ['%', ['to-number', ['coalesce', ['id'], 0]], 3]]]];
    m.addLayer({
      id: 'buildings', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 13,
      filter: ['!=', ['get', 'hide_3d'], true],
      paint: {
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.6, h],
        'fill-extrusion-base': ['to-number', ['coalesce', ['get', 'render_min_height'], 0]],
        'fill-extrusion-color': ['case', tagged, ['interpolate', ['linear'], h, 10, '#c9e4f2', 40, '#8fd0ff', 90, '#5fe3ff', 160, '#d39bff'], ['match', ['%', ['to-number', ['coalesce', ['id'], 0]], 4], 0, '#efe5d6', 1, '#e6ddd0', 2, '#f4eee4', '#dcd6cc']],
        'fill-extrusion-opacity': 0,
        'fill-extrusion-vertical-gradient': true
      }
    });
    // v3: detailed city — ~930k real footprints with real per-building heights (GlobalBuildingAtlas + OSM), drawn by city3d.js
    if (window.MirrorCity3D && !m._isCompare) {
      city = window.MirrorCity3D.create({ id: 'city3d', base: '', index: cityIndex, maxFull: IS_PHONE ? 110000 : 260000 });
      if (window.MirrorStyle) { city.setStyle(window.MirrorStyle.FACADES); city.setTimes(window.MirrorStyle.TIMES); }
      city.setYear(year);
      m.addLayer(city.layer);
      if (!cityIndex) fetch('data/cityindex.json').then((r) => r.json()).then((ix) => { cityIndex = ix; if (DEV_TILES) ix.sites = ix.sites.map(() => 'tiles/'); city.setIndex(ix); }).catch(() => {});
      const inCore = () => { const c = m.getCenter(); return c.lng > 78.295 && c.lng < 78.545 && c.lat > 17.345 && c.lat < 17.488; };
      const syncOsm = () => { const v = inCore() ? 'none' : 'visible'; if (m.getLayoutProperty('buildings', 'visibility') !== v) m.setLayoutProperty('buildings', 'visibility', v); };
      m.on('moveend', syncOsm); syncOsm();
    }
    m.addSource('charminar', { type: 'geojson', data: charminarModel() });
    m.addLayer({ id: 'charminar', type: 'fill-extrusion', source: 'charminar', minzoom: 12.5, paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': true } });

    m.addSource('viaduct', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    m.addLayer({ id: 'viaduct', type: 'fill-extrusion', source: 'viaduct', minzoom: 13.2, paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-opacity': 0, 'fill-extrusion-vertical-gradient': true } });
    fetch('data/corridors.json').then((r) => r.json()).then((fc) => { const s = m.getSource('viaduct'); if (s) s.setData(viaductGeojson(fc)); }).catch(() => {});
    m.addSource('beacons', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    m.addLayer({ id: 'beacons', type: 'fill-extrusion', source: 'beacons', minzoom: 10.5, maxzoom: 15.8, paint: { 'fill-extrusion-color': '#8ffff2', 'fill-extrusion-base': 0, 'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 10.5, 900, 15, 220], 'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 10.5, 0.42, 14.8, 0.22, 15.6, 0] } });
    fetch('data/landmarks.json').then((r) => r.json()).then((l) => { const s = m.getSource('beacons'); if (s) s.setData(beaconsGeojson(l)); }).catch(() => {});
    // area names (OSM suburbs / neighbourhoods) and road names
    m.addLayer({ id: 'place-label', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 12.8,
      filter: ['all', ['match', ['get', 'class'], ['suburb', 'quarter', 'neighbourhood'], true, false], ['!', ['in', ['downcase', ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name'], '']], ['literal', ["abids", "ameerpet", "banjara hills", "begumpet", "birla mandir", "buddha statue", "charminar", "cyber towers", "durgam cheruvu cable bridge", "financial district", "future city (planned)", "gachibowli", "gachibowli stadium", "golconda fort", "hi-tech city", "hitec city", "hussain sagar", "jubilee hills", "kokapet neopolis", "kondapur", "kukatpally", "madhapur", "mecca masjid", "mehdipatnam", "nanakramguda", "orr", "osman sagar", "rgi airport", "salar jung museum", "secunderabad", "shamshabad"]]]]],
      layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']], 'text-font': ['Noto Sans Bold'], 'text-transform': 'uppercase', 'text-letter-spacing': 0.08,
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 16, 12.5], 'text-max-width': 8, 'symbol-sort-key': ['match', ['get', 'class'], 'suburb', 0, 1], 'text-padding': 6 },
      paint: { 'text-color': '#fff6e2', 'text-halo-color': 'rgba(20,14,6,0.85)', 'text-halo-width': 1.6, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 12.8, 0, 13.4, 0.92] } });
    m.addLayer({ id: 'road-label', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 14.6,
      filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'], true, false],
      layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 15, 10.5, 18, 13], 'text-max-angle': 30, 'symbol-spacing': 320 },
      paint: { 'text-color': '#1b1b1b', 'text-halo-color': 'rgba(255,250,240,0.95)', 'text-halo-width': 1.4 } });
    m.addSource('landmarks', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    m.addLayer({ id: 'lm-halo', type: 'circle', source: 'landmarks', filter: ['!=', ['get', 'kind'], 'area'], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 5, 15, 12], 'circle-color': '#6ffff0', 'circle-opacity': 0.18, 'circle-blur': 0.8, 'circle-pitch-alignment': 'map' } });
    m.addLayer({ id: 'lm-dot', type: 'circle', source: 'landmarks', filter: ['!=', ['get', 'kind'], 'area'], paint: { 'circle-radius': 3, 'circle-color': '#e8fff9', 'circle-stroke-color': '#3ff0d8', 'circle-stroke-width': 1.2 } });
    m.addLayer({ id: 'lm-label', type: 'symbol', source: 'landmarks', layout: { 'text-field': ['case', ['==', ['get', 'kind'], 'area'], ['upcase', ['get', 'name']], ['get', 'name']], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 9, ['case', ['==', ['get', 'kind'], 'area'], 9.5, 11], 15, ['case', ['==', ['get', 'kind'], 'area'], 12.5, 15]], 'text-letter-spacing': ['case', ['==', ['get', 'kind'], 'area'], 0.1, 0.02], 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-max-width': 9, 'symbol-sort-key': ['case', ['==', ['get', 'kind'], 'area'], 1, 0], 'text-padding': 4 }, paint: { 'text-color': ['case', ['==', ['get', 'kind'], 'area'], '#fff3d6', '#eafffb'], 'text-halo-color': ['case', ['==', ['get', 'kind'], 'area'], 'rgba(28,18,4,0.9)', '#03161a'], 'text-halo-width': 1.8, 'text-halo-blur': 0.3 } });
  }

  // the OSM Charminar footprint would poke through the hand-built model, so drop it from the extrusion layer
  let charminarHidden = false;
  function pointInRing(pt, ring) { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) inside = !inside; } return inside; }
  function hideOsmCharminar() {
    if (charminarHidden || map.getZoom() < 13) return;
    const fs = map.querySourceFeatures('omt', { sourceLayer: 'building' });
    const ids = new Set();
    fs.forEach((f) => {
      if (f.id == null || !f.geometry) return;
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
      const mLat = 111320, mLon = 111320 * Math.cos(CHARMINAR[1] * Math.PI / 180);
      const near = polys.some((p) => p[0] && (pointInRing(CHARMINAR, p[0]) || p[0].some(([x, y]) => Math.hypot((x - CHARMINAR[0]) * mLon, (y - CHARMINAR[1]) * mLat) < 16)));
      if (near) ids.add(f.id);
    });
    if (!ids.size) return;
    charminarHidden = true;
    map.setFilter('buildings', ['all', ['!=', ['get', 'hide_3d'], true], ['!', ['in', ['id'], ['literal', [...ids]]]]]);
  }

  function beaconsGeojson(list) {
    const f = [];
    list.filter((l) => (l.kind || 'lm') === 'lm').forEach((l) => {
      const mLat = 1 / 111320, mLon = 1 / (111320 * Math.cos(l.lat * Math.PI / 180)), pts = [];
      for (let k = 0; k <= 12; k++) { const t = k / 12 * Math.PI * 2; pts.push([l.lon + Math.cos(t) * 5 * mLon, l.lat + Math.sin(t) * 5 * mLat]); }
      f.push({ type: 'Feature', properties: { name: l.name }, geometry: { type: 'Polygon', coordinates: [pts] } });
    });
    return { type: 'FeatureCollection', features: f };
  }
  // Metro viaduct in 3D: an 8 m deck about 10 m up on pillars every ~40 m, built from the metro line geometry
  function viaductGeojson(fc) {
    const out = [];
    const COL = { red: '#c9787f', green: '#7fb38f', blue: '#7f9fc9' };
    fc.features.filter((f) => f.properties.k === 'metro').forEach((f) => {
      const lines = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
      const color = COL[f.properties.line] || '#b9b4ab';
      lines.forEach((ln) => {
        let acc = 0;
        for (let i = 0; i < ln.length - 1; i++) {
          const [x0, y0] = ln[i], [x1, y1] = ln[i + 1];
          const mLat = 111320, mLon = 111320 * Math.cos(y0 * Math.PI / 180);
          const dx = (x1 - x0) * mLon, dy = (y1 - y0) * mLat, L = Math.hypot(dx, dy); if (L < 0.5) continue;
          const nx = -dy / L * 4, ny = dx / L * 4; // 4 m half-width
          const ex = dx / L * 2, ey = dy / L * 2;  // small overlap at joints
          const P = (x, y, ox, oy) => [x + ox / mLon, y + oy / mLat];
          out.push({ type: 'Feature', properties: { base: 10, height: 11.8, color }, geometry: { type: 'Polygon', coordinates: [[P(x0, y0, nx - ex, ny - ey), P(x1, y1, nx + ex, ny + ey), P(x1, y1, -nx + ex, -ny + ey), P(x0, y0, -nx - ex, -ny - ey), P(x0, y0, nx - ex, ny - ey)]] } });
          // parapet walls
          for (const s of [1, -1]) out.push({ type: 'Feature', properties: { base: 11.8, height: 12.9, color: '#e6e1d6' }, geometry: { type: 'Polygon', coordinates: [[P(x0, y0, s * nx - ex, s * ny - ey), P(x1, y1, s * nx + ex, s * ny + ey), P(x1, y1, s * nx * 0.85 + ex, s * ny * 0.85 + ey), P(x0, y0, s * nx * 0.85 - ex, s * ny * 0.85 - ey), P(x0, y0, s * nx - ex, s * ny - ey)]] } });
          for (let d = (40 - acc % 40) % 40; d < L; d += 40) {
            const cx = x0 + (x1 - x0) * d / L, cy = y0 + (y1 - y0) * d / L, r = 1.1;
            out.push({ type: 'Feature', properties: { base: 0, height: 10, color: '#d8d2c6' }, geometry: { type: 'Polygon', coordinates: [[P(cx, cy, -r, -r), P(cx, cy, r, -r), P(cx, cy, r, r), P(cx, cy, -r, r), P(cx, cy, -r, -r)]] } });
          }
          acc += L;
        }
      });
    });
    return { type: 'FeatureCollection', features: out };
  }

  function landmarksGeojson(list) {
    return { type: 'FeatureCollection', features: list.map((l) => ({ type: 'Feature', properties: { name: l.name, kind: l.kind || 'lm' }, geometry: { type: 'Point', coordinates: [l.lon, l.lat] } })) };
  }

  // ---------- year state ----------
  const GRID_KEYS = [1990, 2000, 2010, 2020, 2025, 2040];
  // bar colour = the decade a cell first became built-up (≥15%, GHSL); pink = new by 2040 in the prediction
  const ERA_COLORS = ['#3fdcff', '#3ff0b0', '#ffd23f', '#ff9a3f', '#ff5fd2', '#ff5a86'];
  function gridExpr(y) {
    let i = 0; while (i < GRID_KEYS.length - 2 && y > GRID_KEYS[i + 1]) i++;
    const A = GRID_KEYS[i], B = GRID_KEYS[i + 1], t = clamp((y - A) / (B - A), 0, 1);
    const frac = ['+', ['*', ['get', 'b' + A], 1 - t], ['*', ['get', 'b' + B], t]];
    const height = ['case', ['<', frac, 8], 0, ['+', 20, ['*', 620, ['^', ['/', frac, 100], 1.3]]]];
    const color = ['match', ['get', 'e'], 0, ERA_COLORS[0], 1, ERA_COLORS[1], 2, ERA_COLORS[2], 3, ERA_COLORS[3], 4, ERA_COLORS[4], 5, ERA_COLORS[5], '#3fdcff'];
    return { height, color, filter: ['>=', frac, 8] };
  }

  function applyYear(y, m = map) {
    if (!m || !m.getLayer('sat-2026')) return;
    const w = photoWeights(y);
    const n = PHOTOS.length;
    const today = y >= 2018 ? clamp((y - 2018) / 2, 0, 1) : 0; // 0 = historic, 1 = today
    PHOTOS.forEach((p, i) => {
      const near = w[i] > 0 || (i > 0 && w[i - 1] > 0) || (i < n - 1 && w[i + 1] > 0);
      if (m.getLayoutProperty(`sat-${p.year}`, 'visibility') !== (near ? 'visible' : 'none')) m.setLayoutProperty(`sat-${p.year}`, 'visibility', near ? 'visible' : 'none');
      // lower layer stays opaque while the newer photo fades in on top, so the blend never shows the base map through
      const base = (w[i] > 0 && i + 1 < n && w[i + 1] > 0) ? 1 : w[i];
      // when looking at today, hand over to detailed Esri imagery once zoomed in (Landsat is 30 m)
      const op = ['interpolate', ['linear'], ['zoom'], 12.2, base, 13.6, lerp(base, 0, today)];
      m.setPaintProperty(`sat-${p.year}`, 'raster-opacity', op);
      if (m.getLayer(`sat-${p.year}-fb`)) m.setPaintProperty(`sat-${p.year}-fb`, 'raster-opacity', op);
    });
    m.setPaintProperty('esri', 'raster-brightness-max', lerp(0.5, 0.85, today) * (m === map ? timeDim : 1));
    const pred = clamp((y - NOW) / (END - NOW), 0, 1);
    m.setPaintProperty('pred', 'raster-opacity', pred > 0 ? 0.25 + 0.75 * pred : 0);
    const corr = pred > 0 ? clamp(pred * 3, 0, 1) : 0;
    ['metro2', 'rrr', 'fc-line'].forEach((id) => m.setPaintProperty(id, 'line-opacity', 0.9 * corr));
    m.setPaintProperty('fc-zone', 'fill-opacity', 0.1 * corr);
    m.setPaintProperty('metro', 'line-opacity', y >= 2017 ? 0.9 : 0); // Metro opened Nov 2017
    if (m.getLayer('viaduct')) m.setPaintProperty('viaduct', 'fill-extrusion-opacity', y >= 2017 ? 0.96 : 0);
    const orr = clamp((y - 2008) / 4, 0, 1); // ORR opened in stages 2008–2012
    m.setPaintProperty('orr', 'line-opacity', 0.75 * orr);
    m.setPaintProperty('orr-glow', 'line-opacity', 0.25 * orr);
    m.setPaintProperty('buildings', 'fill-extrusion-opacity', today * (pred > 0 ? 0.6 : 0.95));
    if (m.getLayer('grid')) { const g = gridExpr(y); m.setPaintProperty('grid', 'fill-extrusion-height', g.height); m.setPaintProperty('grid', 'fill-extrusion-color', g.color); m.setFilter('grid', g.filter); }
  }

  function loadGrid(m) {
    fetch('data/grid.json').then((r) => r.json()).then((g) => {
      const R = 6378137, toLL = (x, yy) => [x / R * 180 / Math.PI, (2 * Math.atan(Math.exp(yy / R)) - Math.PI / 2) * 180 / Math.PI];
      const inset = g.step * 0.2, cols = g.cols, features = [];
      for (const row of g.cells) {
        const props = {}; cols.forEach((c, k) => { if (k > 1) props[c] = row[k]; });
        const x0 = g.x0 + row[0] * g.step + inset, x1 = g.x0 + (row[0] + 1) * g.step - inset;
        const y1 = g.y0 - row[1] * g.step - inset, y0 = g.y0 - (row[1] + 1) * g.step + inset;
        features.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [[toLL(x0, y0), toLL(x1, y0), toLL(x1, y1), toLL(x0, y1), toLL(x0, y0)]] } });
      }
      m.getSource('grid').setData({ type: 'FeatureCollection', features });
      applyYear(year, m);
    }).catch((e) => console.warn('grid', e));
  }

  function setYear(y, fromSlider) {
    year = clamp(Math.round(y), 1990, END);
    if (!fromSlider) slider.value = year;
    yearNumber.textContent = year;
    const isPred = year > NOW;
    badge.hidden = !isPred;
    legend.hidden = !isPred;
    $('eraLegend').classList.toggle('show-pred', isPred);
    const w = photoWeights(year);
    const exact = PHOTOS.find((p) => p.year === year);
    if (isPred) {
      chip.textContent = 'Prediction over the 2026 photo';
      chip.classList.add('is-pred');
      yearKicker.textContent = 'PREDICTION · NOT FACT';
      status.textContent = year === END ? 'New growth by 2040, in pink' : `Growth fading in toward 2040`;
    } else {
      chip.classList.remove('is-pred');
      yearKicker.textContent = 'REAL SATELLITE PHOTO';
      if (year >= 2020 && map && map.getZoom() > 13.2) { chip.textContent = 'Close-up: Esri photo · 3D buildings, real heights'; status.textContent = 'Zoom out for the Landsat photo'; }
      else if (exact) { chip.textContent = exact.label; status.textContent = 'Landsat photo, this exact year'; }
      else {
        const i = w.findIndex((v) => v > 0);
        chip.textContent = `Blending ${PHOTOS[i].year} → ${PHOTOS[i + 1].year} Landsat photos`;
        status.textContent = 'Between photo years: cross-fade';
      }
    }
    const b = builtFor(year);
    areaValue.textContent = b == null ? '—' : (isPred ? '~' : '') + b;
    applyYear(year);
    if (city) city.setYear(Math.min(year, NOW));
    $('rightYearLabel').textContent = `${year} · ${isPred ? 'PREDICTED' : year >= 2025 ? 'NOW' : 'THEN'}`;
  }

  // ---------- compare (before / after swipe) ----------
  function ensureCompareMap() {
    if (compareMap) return compareMap;
    compareMap = new maplibregl.Map({ container: 'compareMap', style: baseStyle(), center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(), interactive: false, attributionControl: false, pixelRatio: Math.min(window.devicePixelRatio || 1, 2), maxPitch: 78 });
    compareMap.on('load', () => {
      PHOTOS.forEach((p) => {
        compareMap.addSource(`sat-${p.year}`, { type: 'raster', tiles: [p.tiles], tileSize: 256, minzoom: 7, maxzoom: 13, bounds: SCENE_BOUNDS });
        compareMap.addLayer({ id: `sat-${p.year}`, type: 'raster', source: `sat-${p.year}`, layout: { visibility: p.year === leftYear ? 'visible' : 'none' }, paint: { 'raster-opacity': 1, 'raster-fade-duration': 0 } });
      });
      compareMap.setPaintProperty('esri', 'raster-brightness-max', 0.5);
      compareMap.addSource('charminar', { type: 'geojson', data: charminarModel() });
      compareMap.addLayer({ id: 'charminar', type: 'fill-extrusion', source: 'charminar', minzoom: 12.5, paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-vertical-gradient': true } });
    });
    return compareMap;
  }
  function syncCompare() { if (!compareMap || !comparing) return; compareMap.jumpTo({ center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() }); }
  function setLeftYear(y) {
    leftYear = y;
    $('leftYearLabel').textContent = `${y} · THEN ⇄`;
    if (compareMap && compareMap.getLayer('sat-1990')) PHOTOS.forEach((p) => compareMap.setLayoutProperty(`sat-${p.year}`, 'visibility', p.year === y ? 'visible' : 'none'));
  }
  function setComparePos(pct) {
    comparePos = clamp(pct, 5, 95);
    $('compareMap').style.clipPath = `inset(0 ${100 - comparePos}% 0 0)`;
    divider.style.left = comparePos + '%';
    divider.setAttribute('aria-valuenow', Math.round(comparePos));
  }
  function toggleCompare(force) {
    comparing = force == null ? !comparing : force;
    world.classList.toggle('is-comparing', comparing);
    $('compareToggle').setAttribute('aria-pressed', String(comparing));
    divider.hidden = !comparing;
    if (comparing) {
      stopTour();
      ensureCompareMap(); compareMap.resize(); syncCompare(); setComparePos(comparePos);
      if (year < 2020) setYear(NOW);
      toast('Drag the handle · tap the left year to change it');
    }
  }
  function initDivider() {
    let dragging = false;
    const move = (clientX) => { const r = world.getBoundingClientRect(); setComparePos(((clientX - r.left) / r.width) * 100); };
    divider.addEventListener('pointerdown', (e) => { dragging = true; divider.setPointerCapture(e.pointerId); e.preventDefault(); });
    divider.addEventListener('pointermove', (e) => { if (dragging) move(e.clientX); });
    ['pointerup', 'pointercancel'].forEach((t) => divider.addEventListener(t, () => { dragging = false; }));
    divider.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') setComparePos(comparePos - 4); if (e.key === 'ArrowRight') setComparePos(comparePos + 4); });
    const cycle = () => { const ys = PHOTOS.map((p) => p.year).filter((y) => y < NOW); setLeftYear(ys[(ys.indexOf(leftYear) + 1) % ys.length]); };
    $('leftYearLabel').addEventListener('click', cycle);
    $('leftYearLabel').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') cycle(); });
  }

  // ---------- tour (Play) ----------
  const STOPS = [
    { name: 'Hyderabad, 1990', center: [78.45, 17.41], zoom: 11.0, pitch: 58, bearing: -10, year: 1990, hold: 1500 },
    { name: 'The west, 2000', center: [78.37, 17.44], zoom: 11.9, pitch: 55, bearing: 15, year: 2000, hold: 1300 },
    { name: 'Gachibowli boom, 2010', center: [78.36, 17.43], zoom: 12.4, pitch: 60, bearing: 40, year: 2010, hold: 1300 },
    { name: 'Charminar · 1591', center: [78.4741, 17.3609], zoom: 16.9, pitch: 68, bearing: 20, year: 2020, hold: 2400 },
    { name: 'Hussain Sagar', center: [78.4735, 17.4170], zoom: 15.6, pitch: 66, bearing: -30, year: 2022, hold: 1800 },
    { name: 'HITEC City', center: [78.3800, 17.4460], zoom: 16.5, pitch: 74, bearing: 35, year: 2024, hold: 3600 },
    { name: 'Cyber Towers', center: [78.3812, 17.4500], zoom: 17.2, pitch: 76, bearing: 110, year: 2025, hold: 2600 },
    { name: 'Financial District', center: [78.3445, 17.4165], zoom: 16.3, pitch: 75, bearing: 70, year: 2026, hold: 3600 },
    { name: 'HITEC City by night', center: [78.3770, 17.4420], zoom: 15.7, pitch: 72, bearing: 200, year: 2026, hold: 4200 },
    { name: 'Airport & Future City', center: [78.47, 17.18], zoom: 10.2, pitch: 50, bearing: 0, year: 2036, hold: 1400 },
    { name: 'Hyderabad, 2040?', center: [78.42, 17.36], zoom: 10.4, pitch: 55, bearing: -15, year: 2040, hold: 2000 }
  ];
  const SUBS = { 'Hyderabad, 1990': 'real Landsat photo', 'The west, 2000': 'HITEC City arrives', 'Gachibowli boom, 2010': 'real Landsat photo', 'Charminar · 1591': '3D model', 'Hussain Sagar': 'Buddha statue', 'HITEC City': 'real building heights', 'Cyber Towers': 'since 1998', 'Financial District': 'the new skyline', 'HITEC City by night': 'lit windows', 'Airport & Future City': 'prediction', 'Hyderabad, 2040?': 'prediction, not fact' };
  const STOP_TIME = { 'HITEC City by night': 'night', 'Airport & Future City': 'day', 'Hyderabad, 1990': 'day' };
  function initTour() {
    if (!window.MirrorTour) return;
    tour = window.MirrorTour.create(map, {
      stops: STOPS,
      onYear: (y) => setYear(y),
      onCaption: (name) => { showCaption(name, SUBS[name]); if (STOP_TIME[name]) setTimeOfDay(STOP_TIME[name]); },
      onEnd: () => { setPlaying(false); legend.classList.remove('is-collapsed'); },
      onStop: () => setPlaying(false)
    });
  }
  function setPlaying(on) { playButton.classList.toggle('is-playing', on); playLabel.textContent = on ? 'Pause' : 'Play fly-through'; playButton.setAttribute('aria-label', on ? 'Pause the fly-through' : 'Play the fly-through'); }
  function stopTour() { if (tour && tour.isPlaying()) tour.stop(); setPlaying(false); }
  function togglePlay() {
    if (!tour) return;
    if (tour.isPlaying()) { stopTour(); return; }
    if (comparing) toggleCompare(false);
    endIntro();
    legend.classList.add('is-collapsed');
    setPlaying(true);
    tour.play();
  }

  // ---------- intro ----------
  function endIntro() { if (!introRunning) return; introRunning = false; world.classList.remove('intro-active'); }
  function runIntro() {
    if (REDUCED) { world.classList.remove('intro-active'); return; }
    introRunning = true;
    map.jumpTo({ center: [78.43, 17.38], zoom: 9.2, pitch: 0, bearing: -60 });
    map.flyTo({ ...START, duration: 5200, curve: 1.1, essential: true });
    map.once('moveend', () => { if (introRunning) { endIntro(); if (IS_PHONE) showHint(); } });
  }
  function showHint() { const h = $('gestureHint'); if (sessionStorage.getItem('mwHint')) return; sessionStorage.setItem('mwHint', '1'); h.hidden = false; setTimeout(() => { h.hidden = true; }, 5200); }

  // ---------- controls ----------
  function initControls() {
    slider.addEventListener('input', () => { stopTour(); endIntro(); setYear(+slider.value, true); });
    playButton.addEventListener('click', togglePlay);
    $('compareToggle').addEventListener('click', () => toggleCompare());
    $('resetView').addEventListener('click', () => { stopTour(); map.flyTo({ ...START, duration: 1800, essential: true }); });
    $('compassButton').addEventListener('click', () => map.easeTo({ bearing: 0, duration: 700 }));
    $('tiltToggle').addEventListener('click', () => { const flat = map.getPitch() > 10; map.easeTo({ pitch: flat ? 0 : 62, duration: 800 }); });
    $('attributionToggle').addEventListener('click', () => { const p = $('attributionPanel'); p.hidden = !p.hidden; $('attributionToggle').setAttribute('aria-expanded', String(!p.hidden)); });
    $('closeAttribution').addEventListener('click', () => { $('attributionPanel').hidden = true; });
    const tl = () => legend.classList.toggle('is-collapsed');
    $('whyToggle').addEventListener('click', tl);
    $('whyToggle').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') tl(); });
    $('shareButton').addEventListener('click', async () => {
      const c = map.getCenter();
      const url = `${location.origin}${location.pathname}#y=${year}&c=${c.lng.toFixed(4)},${c.lat.toFixed(4)},${map.getZoom().toFixed(1)},${map.getPitch().toFixed(0)},${map.getBearing().toFixed(0)}`;
      const text = year > NOW ? `Where Hyderabad might grow by ${year} (prediction)` : `Hyderabad in ${year}, real satellite photo`;
      try { if (navigator.share) { await navigator.share({ title: 'Mirror World: Hyderabad', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
      try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url); }
    });
    const ticks = $('ticks');
    [...PHOTOS.map((p) => p.year), END].forEach((y) => { const i = document.createElement('i'); i.style.left = `calc(${((y - 1990) / (END - 1990)) * 100}% + ${8 - ((y - 1990) / (END - 1990)) * 16}px)`; if (y > NOW) i.className = 'pred'; const s = document.createElement('span'); s.textContent = String(y).slice(2) === '26' ? 'now' : "'" + String(y).slice(2); i.append(s); ticks.append(i); });
    world.addEventListener('pointerdown', (e) => { if (introRunning && !e.target.closest('.time-console')) { map.stop(); endIntro(); } }, true);
  }

  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    const out = {};
    if (h.get('y')) out.year = +h.get('y');
    if (h.get('c')) { const [lng, lat, z, p, b] = h.get('c').split(',').map(Number); if (isFinite(lng) && isFinite(lat)) out.view = { center: [lng, lat], zoom: z || 12, pitch: p || 0, bearing: b || 0 }; }
    return out;
  }

  // ---------- boot ----------
  function init() {
    const fromHash = readHash();
    map = new maplibregl.Map({
      container: 'map', style: baseStyle(), center: START.center, zoom: START.zoom, pitch: START.pitch, bearing: START.bearing,
      maxPitch: 78, maxZoom: 18.5, minZoom: 8, attributionControl: { compact: true },
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2), dragRotate: true, touchPitch: true, touchZoomRotate: true, pitchWithRotate: true,
      renderWorldCopies: false, maxBounds: [[77.0, 16.3], [79.5, 18.5]]
    });
    window.__mw = { get map() { return map; }, get city() { return city; }, setTimeOfDay, setYear, toggleCompare, togglePlay, get year() { return year; }, setComparePos, setLeftYear };
    map.touchZoomRotate.enableRotation();
    map.on('rotate', () => { $('compassIcon').style.transform = `rotate(${-map.getBearing()}deg)`; });
    // 2D (flat) view = pure photo time machine; tilt it to see the 3D growth bars
    let barsShown = null;
    const barsByPitch = () => { const show = map.getPitch() > 22; if (show === barsShown || !map.getLayer('grid')) return; barsShown = show; map.setLayoutProperty('grid', 'visibility', show ? 'visible' : 'none'); $('eraLegend').classList.toggle('is-flat', !show); };
    map.on('pitch', barsByPitch);
    map.on('pitchend', () => $('tiltToggle').classList.toggle('is-on', map.getPitch() > 10));
    map.on('move', syncCompare);
    let wasClose = null;
    map.on('zoom', () => $('eraLegend').classList.toggle('is-hidden', map.getZoom() > 13.4));
    map.on('zoomend', () => { const close = map.getZoom() > 13.2; if (close !== wasClose) { wasClose = close; if (meta || map.getLayer('sat-2026')) setYear(year); } });
    map.on('load', () => {
      addCityLayers(map);
      setupTimeOfDay();
      loadGrid(map);
      barsByPitch();
      fetch('data/landmarks.json').then((r) => r.json()).then((l) => map.getSource('landmarks').setData(landmarksGeojson(l))).catch(() => {});
      fetch('data/meta.json').then((r) => r.json()).then((m) => { meta = m; setYear(year); }).catch(() => {});
      setYear(fromHash.year || NOW);
      initTour();
      if (fromHash.view) { map.jumpTo(fromHash.view); world.classList.remove('intro-active'); }
      else runIntro();
      map.once('idle', () => { window.__mwIdle = true; });
      map.on('idle', hideOsmCharminar);
    });
    map.on('error', (e) => { if (e && e.error) console.warn('map', e.error.message || e.error); });
    initControls();
    initDivider();
    window.addEventListener('resize', () => { if (compareMap) compareMap.resize(); });
  }
  if (!window.maplibregl) { document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;top:40%;width:100%;text-align:center">The 3D map needs a newer browser with WebGL.</p>'); return; }
  init();
})();
