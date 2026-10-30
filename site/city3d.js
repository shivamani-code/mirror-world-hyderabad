// Mirror World v3 — detailed 3D city layer (written by Tab).
// A MapLibre custom WebGL layer that draws ~930k real building footprints with per-building heights
// (GlobalBuildingAtlas LoD1 + OpenStreetMap height tags), procedural windows/floors, rooftop tanks,
// sun shadows, distance fog and lit windows at dusk/night. Tiles are baked binary files on helper sites.
(function () {
  'use strict';
  const EXT = 4096, Z = 14, N = 1 << Z, C = 40075016.686;
  const VS = `
    attribute vec4 a_pos; attribute vec4 a_nrm; attribute vec4 a_meta;
    uniform mat4 u_matrix; uniform float u_mPerUnit; uniform float u_year; uniform float u_rise;
    uniform float u_camDist; uniform float u_mppScale; uniform vec2 u_shadow; uniform float u_shadowPass;
    varying vec3 v_n; varying vec4 v_m; varying vec3 v_w; varying float v_dist; varying float v_mpp;
    void main() {
      float yr = 1975.0 + a_meta.z;
      float grow = clamp((u_year - yr) / 1.5 + 0.0001, 0.0, 1.0) * u_rise;
      if (grow <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
      float zm = a_pos.z * 0.25 * grow;
      vec2 xy = a_pos.xy;
      float z = zm;
      if (u_shadowPass > 0.5) { xy += u_shadow * zm / u_mPerUnit; z = 0.0; }
      gl_Position = u_matrix * vec4(xy, z * 4.0, 1.0);
      v_n = a_nrm.xyz / 127.0;
      v_m = vec4(a_nrm.w, a_meta.x, a_meta.y, a_meta.w); // kind, height(m), seed, osm
      v_w = vec3(a_pos.w * 0.5, zm, a_meta.x * grow);
      v_dist = gl_Position.w / u_camDist;
      v_mpp = gl_Position.w * u_mppScale;
    }`;
  const FS = `
    precision highp float;
    varying vec3 v_n; varying vec4 v_m; varying vec3 v_w; varying float v_dist; varying float v_mpp;
    uniform vec3 u_sun; uniform vec3 u_sunColor; uniform vec3 u_ambient; uniform vec3 u_fog; uniform vec2 u_fogRange;
    uniform float u_night; uniform vec3 u_pal[8]; uniform vec3 u_glass[4]; uniform vec3 u_roof[4]; uniform vec3 u_winDay; uniform vec3 u_winLit;
    uniform float u_shadowPass; uniform float u_shadowAlpha; uniform float u_oldCity;
    float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    vec3 pick8(float i) { vec3 c = u_pal[0];
      if (i > 0.5) c = u_pal[1]; if (i > 1.5) c = u_pal[2]; if (i > 2.5) c = u_pal[3]; if (i > 3.5) c = u_pal[4];
      if (i > 4.5) c = u_pal[5]; if (i > 5.5) c = u_pal[6]; if (i > 6.5) c = u_pal[7]; return c; }
    vec3 pick4(vec3 a0, vec3 a1, vec3 a2, vec3 a3, float i) { return i < 0.5 ? a0 : i < 1.5 ? a1 : i < 2.5 ? a2 : a3; }
    void main() {
      if (u_shadowPass > 0.5) {
        float fa = 1.0 - smoothstep(u_fogRange.x, u_fogRange.y, v_dist);
        gl_FragColor = vec4(0.0, 0.02, 0.06, u_shadowAlpha * fa); return;
      }
      float kind = v_m.x, H = v_m.y, seed = v_m.z;
      vec3 n = normalize(v_n);
      float tower = step(27.0, H) * (1.0 - u_oldCity);
      float mid = step(13.0, H) * (1.0 - tower);
      float s1 = fract(seed * 0.618034), s2 = fract(seed * 0.3819 + 0.17);
      vec3 base = pick8(floor(s1 * 8.0));
      vec3 glass = pick4(u_glass[0], u_glass[1], u_glass[2], u_glass[3], floor(s2 * 4.0));
      vec3 col; float emissive = 0.0; vec3 emitCol = u_winLit;
      if (kind > 1.5) {            // rooftop tank (2) or stair room (3)
        col = kind < 2.5 ? vec3(0.09, 0.10, 0.12) : base * 0.92;
      } else if (kind > 0.5) {     // roof
        col = pick4(u_roof[0], u_roof[1], u_roof[2], u_roof[3], floor(s2 * 4.0));
        col = mix(col, glass * 0.7, tower * 0.55);
      } else {                     // walls: floors, bays, windows
        float floorH = mix(3.1, 3.7, tower);
        float bay = mix(mix(3.2, 2.6, mid), 1.8, tower);
        float fz = v_w.y / floorH, fi = floor(fz), fy = fract(fz);
        float bu = v_w.x / bay, bi = floor(bu), bx = fract(bu);
        float detail = 1.0 - smoothstep(0.2, 0.5, v_mpp / floorH);   // fade pattern when floors are < ~2 px
        float top = step(v_w.z - 0.7, v_w.y);                          // parapet band
        float ground = step(fi, 0.0);
        float win;
        if (tower > 0.5) {
          // curtain wall: glass panes between mullions + a spandrel band per floor, sky reflected toward the top
          win = step(0.06, bx) * step(0.16, fy);
          float refl = smoothstep(0.0, 1.0, v_w.y / max(v_w.z, 1.0));
          vec3 g = mix(glass * 0.78, mix(glass, vec3(0.80, 0.88, 0.94), 0.42), refl);
          g *= mix(0.9, 1.08, h21(vec2(fi, bi * 0.37) + seed));             // pane-to-pane variation
          vec3 frame = mix(base, vec3(0.86, 0.88, 0.9), 0.5) * 0.8;
          col = mix(mix(g, frame, 0.55), mix(frame, g, win), detail);
          if (v_w.y < floorH * 1.3) col = mix(col, glass * 0.45, 0.6 * detail);    // dark lobby glass
        } else {
          win = step(0.2, bx) * step(bx, 0.8) * step(0.32, fy) * step(fy, 0.84);
          float balcony = step(0.86, fy) * step(0.5, s2) * (1.0 - ground);
          col = base;
          col = mix(col, col * 0.78, balcony * detail);
          col = mix(col, u_winDay * mix(0.8, 1.15, h21(vec2(fi, bi) + seed)), win * detail * (1.0 - ground * 0.3));
          col = mix(col, col * 0.62, ground * 0.6 * detail);
        }
        col = mix(col, col * 1.12 + 0.03, top);
        // ambient occlusion near the street
        col *= mix(0.62, 1.0, smoothstep(0.0, 7.0, v_w.y));
        // lit windows at dusk/night
        float r = h21(vec2(fi * 1.7 + seed, bi * 0.9 + seed * 0.37));
        float lit = step(mix(0.985, mix(0.66, 0.42, tower), u_night), r) * win * (1.0 - top);
        float warm = step(0.35, fract(r * 7.3));
        emitCol = mix(vec3(0.75, 0.88, 1.0), u_winLit, warm);
        emissive = lit * min(1.0, u_night * 1.6) * mix(0.55, 1.0, detail) + win * u_night * u_night * 0.05;
        if (ground > 0.5) { emissive = max(emissive, u_night * 0.55 * step(0.4, s1) * step(0.15, fy) * step(fy, 0.8)); emitCol = mix(emitCol, vec3(1.0, 0.7, 0.4), 0.5); }
      }
      // light
      float diff = max(dot(n, u_sun), 0.0);
      float sky = mix(0.62, 1.0, n.z * 0.5 + 0.5);
      vec3 light = u_ambient * sky + u_sunColor * diff;
      // glass glint
      float glint = tower * (1.0 - kind) * pow(max(dot(reflect(-u_sun, n), vec3(0.0, 0.0, 1.0)) * 0.5 + 0.5, 0.0), 6.0) * 0.25 * (1.0 - u_night);
      vec3 c = col * light + glint + emitCol * emissive;
      float f = smoothstep(u_fogRange.x, u_fogRange.y, v_dist);
      c = mix(c, u_fog, f * 0.92);
      gl_FragColor = vec4(c, 1.0);
    }`;

  function hexToRgb(h) { const v = parseInt(h.replace('#', ''), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; }
  const DEFAULT_STYLE = {
    facades: ['#efe6d8', '#f4efe7', '#e8d9c0', '#f2d6c9', '#dfe8dd', '#f1e3b5', '#d8dfe8', '#e9cfa8'],
    glass: ['#5d7f95', '#6f8f9e', '#4f6f86', '#7c9aa6'],
    roofs: ['#b9b4ab', '#a7a39c', '#c8c2b6', '#9b968e'],
    windowDay: '#40505e', windowLit: '#ffc36b'
  };
  const DEFAULT_TIME = {
    day:   { sun: [-0.55, 0.42, 0.72], sunColor: '#ffe7c4', sunI: 0.62, ambient: '#b9c6d6', ambI: 0.62, fog: '#9fb3c4', night: 0, shadow: 0.30 },
    dusk:  { sun: [-0.8, 0.25, 0.38], sunColor: '#ffb070', sunI: 0.55, ambient: '#6f7fa6', ambI: 0.5, fog: '#5f5a78', night: 0.55, shadow: 0.34 },
    night: { sun: [-0.3, 0.5, 0.8], sunColor: '#5a6fa0', sunI: 0.12, ambient: '#2a3550', ambI: 0.4, fog: '#0d1626', night: 1, shadow: 0.0 }
  };
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mul(a, b) { // column-major 4x4, float64
    const o = new Float64Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; }
    return o;
  }

  function create(opts) {
    const o = Object.assign({ base: '', index: null, maxFull: 160000, maxConcurrent: 4 }, opts);
    let map, gl, prog, attr = {}, uni = {}, worker;
    const tiles = new Map();   // key -> {tx,ty,state,vbo,ibo,nIdx,nIdxTall,mPerUnit,t0,n}
    let inflight = 0; const queue = [];
    let year = 2026, timeName = 'day', timeMix = null, style = DEFAULT_STYLE, times = DEFAULT_TIME;
    let cur = null; // current blended time params
    let enabled = true, shadows = true, stats = { drawn: 0, buildings: 0, tiles: 0 };
    function setStyle(s) { style = Object.assign({}, DEFAULT_STYLE, s || {}); upStyle = true; map && map.triggerRepaint(); }
    function setTimes(t) { times = Object.assign({}, DEFAULT_TIME, t || {}); cur = null; }
    let upStyle = true;
    function timeParams() {
      const t = times[timeName] || times.day;
      if (!cur) cur = JSON.parse(JSON.stringify(t));
      // ease toward target
      let moving = false;
      const k = 0.08;
      for (const key of ['sunI', 'ambI', 'night', 'shadow']) { const d = t[key] - cur[key]; if (Math.abs(d) > 1e-3) { cur[key] += d * k; moving = true; } else cur[key] = t[key]; }
      for (let i = 0; i < 3; i++) { const d = t.sun[i] - cur.sun[i]; if (Math.abs(d) > 1e-3) { cur.sun[i] += d * k; moving = true; } }
      for (const key of ['sunColor', 'ambient', 'fog']) {
        const a = Array.isArray(cur[key]) ? cur[key] : hexToRgb(cur[key]); const b = hexToRgb(t[key]);
        cur[key] = a.map((v, i) => { const d = b[i] - v; if (Math.abs(d) > 1e-3) moving = true; return v + d * k; });
      }
      if (moving && map) map.triggerRepaint();
      return cur;
    }
    function compile(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    function onAdd(m, g) {
      try { setup(m, g); } catch (err) { console.warn('city3d disabled:', err); enabled = false; failed = String(err); }
    }
    let failed = null;
    function setup(m, g) {
      map = m; gl = g;
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      for (const a of ['a_pos', 'a_nrm', 'a_meta']) attr[a] = gl.getAttribLocation(prog, a);
      for (const u of ['u_matrix', 'u_mPerUnit', 'u_year', 'u_rise', 'u_camDist', 'u_mppScale', 'u_shadow', 'u_shadowPass', 'u_sun', 'u_sunColor', 'u_ambient', 'u_fog', 'u_fogRange', 'u_night', 'u_pal', 'u_glass', 'u_roof', 'u_winDay', 'u_winLit', 'u_shadowAlpha', 'u_oldCity']) uni[u] = gl.getUniformLocation(prog, u);
      if (!(typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext)) gl.getExtension('OES_element_index_uint');
      worker = new Worker(o.base + 'cityworker.js');
      worker.onmessage = (e) => {
        const d = e.data; inflight--; const t = tiles.get(d.key);
        if (t && d.ok) {
          t.vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, t.vbo); gl.bufferData(gl.ARRAY_BUFFER, d.vb, gl.STATIC_DRAW);
          t.ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, t.ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, d.idx, gl.STATIC_DRAW);
          t.nIdx = d.nIdx; t.nIdxTall = d.nIdxTall; t.mPerUnit = d.mPerUnit; t.n = d.n; t.ntall = d.ntall; t.state = 'ready'; t.t0 = performance.now();
        } else if (t) { t.state = 'error'; t.err = d.error; }
        pump(); map.triggerRepaint();
      };
    }
    function pump() {
      while (inflight < o.maxConcurrent && queue.length) {
        const t = queue.shift(); if (t.state !== 'queued') continue;
        t.state = 'loading'; inflight++;
        worker.postMessage({ key: t.key, url: t.url, tx: t.tx, ty: t.ty });
      }
    }
    function want(key, pri) {
      let t = tiles.get(key);
      if (!t) {
        const meta = o.index.tiles[key]; const [tx, ty] = key.split('-').map(Number);
        t = { key, tx, ty, state: 'queued', url: o.index.sites[meta[3]] + key + '.bin', pri };
        tiles.set(key, t); queue.push(t);
      }
      t.pri = pri; t.lastWanted = performance.now();
      return t;
    }
    function render(g, args) {
      if (!enabled || !o.index) return;
      const M = args && args.defaultProjectionData ? args.defaultProjectionData.mainMatrix : (args && args.modelViewProjectionMatrix ? args.modelViewProjectionMatrix : args);
      const zoom = map.getZoom();
      if (zoom < 11.6) return;
      const c = map.getCenter();
      const cx = (c.lng + 180) / 360 * N;
      const sl = Math.sin(c.lat * Math.PI / 180);
      const cy = (0.5 - Math.log((1 + sl) / (1 - sl)) / (4 * Math.PI)) * N;
      const rise = Math.min(1, Math.max(0, (zoom - 11.6) / 1.0));
      // which tiles: tall (≥12 m) buildings over a wide radius, every building close in
      const scale = Math.pow(2, 14 - zoom);
      const rTall = Math.min(7, Math.max(2.2, 2.4 * scale));
      const rFull = zoom < 12.8 ? 0 : Math.min(2.6, Math.max(1.2, 1.5 * scale));
      const cand = [];
      const tr = map.transform;
      const pitch = map.getPitch() * Math.PI / 180, bearing = map.getBearing() * Math.PI / 180;
      // shift the "interest" centre forward along the view direction when pitched
      const fwd = Math.min(1.6, Math.tan(Math.min(pitch, 1.35)) * 0.45) * Math.min(1.5, scale);
      const fx = cx + Math.sin(bearing) * fwd, fy = cy - Math.cos(bearing) * fwd;
      for (const key in o.index.tiles) {
        const [tx, ty] = key.split('-').map(Number);
        const d = Math.hypot(tx + 0.5 - fx, ty + 0.5 - fy);
        if (d > rTall + 0.8) continue;
        // behind-camera cull
        if (!tileVisible(M, tx, ty)) continue;
        cand.push({ key, tx, ty, d });
      }
      cand.sort((a, b) => a.d - b.d);
      for (const k of cand) want(k.key, k.d);
      queue.sort((a, b) => a.pri - b.pri); pump();
      evict(cand);
      const tp = timeParams();
      gl.useProgram(prog);
      if (upStyle) {
        gl.uniform3fv(uni.u_pal, new Float32Array(style.facades.slice(0, 8).flatMap(hexToRgb)));
        gl.uniform3fv(uni.u_glass, new Float32Array(style.glass.slice(0, 4).flatMap(hexToRgb)));
        gl.uniform3fv(uni.u_roof, new Float32Array(style.roofs.slice(0, 4).flatMap(hexToRgb)));
        gl.uniform3fv(uni.u_winDay, hexToRgb(style.windowDay)); gl.uniform3fv(uni.u_winLit, hexToRgb(style.windowLit));
        upStyle = false;
      }
      const sun = tp.sun, sl2 = Math.hypot(sun[0], sun[1], sun[2]);
      const sn = [sun[0] / sl2, sun[1] / sl2, sun[2] / sl2];
      gl.uniform3fv(uni.u_sun, sn);
      gl.uniform3fv(uni.u_sunColor, tp.sunColor.map((v) => v * tp.sunI));
      gl.uniform3fv(uni.u_ambient, tp.ambient.map((v) => v * tp.ambI));
      gl.uniform3fv(uni.u_fog, tp.fog);
      gl.uniform1f(uni.u_night, tp.night);
      gl.uniform1f(uni.u_year, year);
      const camDist = tr.cameraToCenterDistance || (0.5 / Math.tan(0.6435 / 2) * map.getCanvas().clientHeight);
      const mpp = C * Math.cos(c.lat * Math.PI / 180) / (512 * Math.pow(2, zoom));
      gl.uniform1f(uni.u_camDist, camDist);
      gl.uniform1f(uni.u_mppScale, mpp / camDist / (window.devicePixelRatio > 1.5 ? 1.0 : 1.0));
      const fogStart = 1.3 + 2.2 * Math.max(0, 1 - pitch / 1.2), fogEnd = fogStart + 3.2;
      gl.uniform2f(uni.u_fogRange, fogStart, fogEnd);
      // shadow direction (east, south) per metre of height
      const sdx = -sn[0] / Math.max(0.25, sn[2]), sdy = -sn[1] / Math.max(0.25, sn[2]);
      gl.uniform2f(uni.u_shadow, sdx, sdy);
      gl.uniform1f(uni.u_shadowAlpha, tp.shadow);
      const stride = 16;
      gl.enableVertexAttribArray(attr.a_pos); gl.enableVertexAttribArray(attr.a_nrm); gl.enableVertexAttribArray(attr.a_meta);
      const now = performance.now();
      const draws = [];
      let budget = o.maxFull; let drawnB = 0;
      for (const k of cand) {
        const t = tiles.get(k.key); if (!t || t.state !== 'ready') continue;
        let count = t.nIdxTall, nb = t.ntall;
        if (k.d <= rFull && budget > 0) { count = t.nIdx; nb = t.n; budget -= t.n; }
        if (!count) continue;
        const merc = 1 / (C * Math.cos(tileLatC(t.ty) * Math.PI / 180));
        const T = new Float64Array([1 / (N * EXT), 0, 0, 0, 0, 1 / (N * EXT), 0, 0, 0, 0, merc / 4, 0, t.tx / N, t.ty / N, 0, 1]);
        const mat = new Float32Array(mul(M, T));
        const appear = Math.min(1, (now - t.t0) / 900); if (appear < 1) map.triggerRepaint();
        draws.push({ t, count, mat, rise: rise * (1 - Math.pow(1 - appear, 3)) });
        drawnB += nb;
      }
      stats = { drawn: draws.length, buildings: drawnB, tiles: tiles.size, zoom };
      function bind(t) {
        gl.bindBuffer(gl.ARRAY_BUFFER, t.vbo); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, t.ibo);
        gl.vertexAttribPointer(attr.a_pos, 4, gl.SHORT, false, stride, 0);
        gl.vertexAttribPointer(attr.a_nrm, 4, gl.BYTE, false, stride, 8);
        gl.vertexAttribPointer(attr.a_meta, 4, gl.UNSIGNED_BYTE, false, stride, 12);
      }
      // 1) shadows on the ground, each pixel darkened once (stencil)
      if (shadows && tp.shadow > 0.01 && zoom > 13) {
        gl.enable(gl.STENCIL_TEST); gl.clearStencil(0); gl.stencilMask(0xff); gl.clear(gl.STENCIL_BUFFER_BIT);
        gl.stencilFunc(gl.EQUAL, 0, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false); gl.disable(gl.CULL_FACE); gl.disable(gl.DEPTH_TEST); // ground shadows: drawn first, buildings cover them
        gl.uniform1f(uni.u_shadowPass, 1);
        for (const d of draws) { bind(d.t); gl.uniformMatrix4fv(uni.u_matrix, false, d.mat); gl.uniform1f(uni.u_mPerUnit, d.t.mPerUnit); gl.uniform1f(uni.u_rise, d.rise); gl.drawElements(gl.TRIANGLES, d.count, gl.UNSIGNED_INT, 0); }
        gl.clear(gl.STENCIL_BUFFER_BIT); gl.disable(gl.STENCIL_TEST);
        if (map.painter) { map.painter.currentStencilSource = undefined; map.painter._tileClippingMaskIDs = {}; }
      }
      // 2) buildings
      gl.disable(gl.BLEND); gl.depthMask(true); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.uniform1f(uni.u_shadowPass, 0);
      for (const d of draws) { bind(d.t); gl.uniformMatrix4fv(uni.u_matrix, false, d.mat); gl.uniform1f(uni.u_mPerUnit, d.t.mPerUnit); gl.uniform1f(uni.u_rise, d.rise); gl.uniform1f(uni.u_oldCity, tileLatC(d.t.ty) < 17.377 ? 1 : 0); gl.drawElements(gl.TRIANGLES, d.count, gl.UNSIGNED_INT, 0); }
      gl.disableVertexAttribArray(attr.a_pos); gl.disableVertexAttribArray(attr.a_nrm); gl.disableVertexAttribArray(attr.a_meta);
    }
    function tileLatC(ty) { const n = Math.PI - 2 * Math.PI * (ty + 0.5) / N; return Math.atan(Math.sinh(n)) * 180 / Math.PI; }
    function tileVisible(M, tx, ty) {
      // keep a tile unless all four ground corners (and the same corners raised 120 m) are off one side of the screen
      let allL = true, allR = true, allB = true, allBehind = true;
      for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const p = clip(M, (tx + cx) / N, (ty + cy) / N);
        if (p[3] <= 0) continue;
        allBehind = false;
        const sx = p[0] / p[3], sy = p[1] / p[3];
        if (sx > -1.15) allL = false; if (sx < 1.15) allR = false; if (sy > -1.15) allB = false;
      }
      if (allBehind) return false;
      return !(allL || allR || allB);
    }
    function clip(M, x, y) { return [M[0] * x + M[4] * y + M[12], M[1] * x + M[5] * y + M[13], M[2] * x + M[6] * y + M[14], M[3] * x + M[7] * y + M[15]]; }
    function evict(cand) {
      const keep = new Set(cand.map((c) => c.key));
      if (tiles.size < 70) return;
      const old = [...tiles.values()].filter((t) => !keep.has(t.key) && t.state !== 'loading').sort((a, b) => a.lastWanted - b.lastWanted);
      while (tiles.size > 60 && old.length) { const t = old.shift(); if (t.vbo) gl.deleteBuffer(t.vbo); if (t.ibo) gl.deleteBuffer(t.ibo); tiles.delete(t.key); }
    }
    const layer = {
      id: o.id || 'city3d', type: 'custom', renderingMode: '3d', onAdd, render,
      onRemove() { worker && worker.terminate(); for (const t of tiles.values()) { if (t.vbo) gl.deleteBuffer(t.vbo); if (t.ibo) gl.deleteBuffer(t.ibo); } tiles.clear(); }
    };
    return {
      layer,
      setIndex(ix) { o.index = ix; map && map.triggerRepaint(); },
      setYear(y) { year = y; map && map.triggerRepaint(); },
      setTime(name) { if (times[name]) { timeName = name; map && map.triggerRepaint(); } },
      getTime() { return timeName; },
      setStyle, setTimes,
      setEnabled(v) { enabled = v; map && map.triggerRepaint(); },
      setShadows(v) { shadows = v; map && map.triggerRepaint(); },
      setMaxFull(n) { o.maxFull = n; },
      stats() { return Object.assign({}, stats, { failed, loading: inflight, queued: queue.length, errors: [...tiles.values()].filter((t) => t.state === 'error').map((t) => t.key + ':' + t.err).slice(0, 5) }); },
      ready() { return [...tiles.values()].filter((t) => t.state === 'ready').length; }
    };
  }
  window.MirrorCity3D = { create, DEFAULT_STYLE, DEFAULT_TIME };
})();
