// Mirror World v3 — building mesh worker (written by Tab).
// Fetches one baked tile (MW3B, gzip), decodes footprints + heights, builds wall/roof/water-tank meshes.
importScripts('earcut.min.js');
const EXT = 4096, Z = 14, N = 1 << Z, C = 40075016.686;
function tileLat(ty) { const n = Math.PI - 2 * Math.PI * ty / N; return Math.atan(Math.sinh(n)) * 180 / Math.PI; }
async function gunzip(buf) {
  const ds = new DecompressionStream('gzip');
  const s = new Blob([buf]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(s).arrayBuffer());
}
function hash(i) { let x = (i * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; }
function decode(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const n = dv.getUint32(4, true), ntall = dv.getUint32(8, true), dlen = dv.getUint32(12, true);
  let o = 16;
  const H = b.subarray(o, o + n); o += n;
  const NV = b.subarray(o, o + n); o += n;
  const FL = b.subarray(o, o + n); o += n;
  const firstOff = o; o += 4 * n;
  const D = b.subarray(o, o + dlen);
  const rings = []; let dp = 0;
  function rv() { let v = 0, s = 0, c; do { c = D[dp++]; v |= (c & 0x7f) << s; s += 7; } while (c & 0x80); return (v >>> 1) ^ -(v & 1); }
  for (let i = 0; i < n; i++) {
    const k = NV[i]; const r = new Float64Array(k * 2);
    let x = dv.getInt16(firstOff + 4 * i, true), y = dv.getInt16(firstOff + 4 * i + 2, true);
    r[0] = x; r[1] = y;
    for (let j = 1; j < k; j++) { x += rv(); y += rv(); r[2 * j] = x; r[2 * j + 1] = y; }
    rings.push(r);
  }
  return { n, ntall, H, FL, rings };
}
function build(d, tx, ty, seedBase) {
  const mPerUnit = C * Math.cos(tileLat(ty + 0.5) * Math.PI / 180) / (N * EXT);
  // count
  let nv = 0, ni = 0;
  for (let i = 0; i < d.n; i++) { const k = d.rings[i].length / 2; nv += 4 * k + k + 20; ni += 6 * k + 3 * (k - 2) + 30; }
  const vb = new ArrayBuffer(nv * 16);
  const I16 = new Int16Array(vb), I8 = new Int8Array(vb), U8 = new Uint8Array(vb);
  const idx = new Uint32Array(ni);
  let v = 0, ii = 0, nIdxTall = 0;
  function vert(x, y, z, u, nx, ny, nz, kind, h, seed, yr, fl) {
    const s = v * 8, b = v * 16;
    I16[s] = x; I16[s + 1] = y; I16[s + 2] = Math.round(z * 4); I16[s + 3] = Math.round(u * 2) % 32000;
    I8[b + 8] = Math.round(nx * 127); I8[b + 9] = Math.round(ny * 127); I8[b + 10] = Math.round(nz * 127); I8[b + 11] = kind;
    U8[b + 12] = h; U8[b + 13] = seed; U8[b + 14] = yr; U8[b + 15] = fl;
    return v++;
  }
  for (let i = 0; i < d.n; i++) {
    const r = d.rings[i], k = r.length / 2;
    const hM = d.H[i], fl = d.FL[i], yr = fl & 127, osm = fl >> 7;
    const seed = Math.floor(hash(seedBase + i) * 256);
    const h = Math.max(3, hM);
    // signed area (y down) -> outward normal direction
    let a = 0; for (let j = 0; j < k; j++) { const j2 = (j + 1) % k; a += r[2 * j] * r[2 * j2 + 1] - r[2 * j2] * r[2 * j + 1]; }
    const sgn = a >= 0 ? 1 : -1;
    let u = 0;
    for (let j = 0; j < k; j++) {
      const j2 = (j + 1) % k;
      const x0 = r[2 * j], y0 = r[2 * j + 1], x1 = r[2 * j2], y1 = r[2 * j2 + 1];
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
      const nx = sgn * dy / L, ny = -sgn * dx / L;
      const lm = L * mPerUnit;
      const a0 = vert(x0, y0, 0, u, nx, ny, 0, 0, hM, seed, yr, osm);
      const a1 = vert(x1, y1, 0, u + lm, nx, ny, 0, 0, hM, seed, yr, osm);
      const a2 = vert(x1, y1, h, u + lm, nx, ny, 0, 0, hM, seed, yr, osm);
      const a3 = vert(x0, y0, h, u, nx, ny, 0, 0, hM, seed, yr, osm);
      idx[ii++] = a0; idx[ii++] = a1; idx[ii++] = a2; idx[ii++] = a0; idx[ii++] = a2; idx[ii++] = a3;
      u += lm;
    }
    // roof
    const tri = earcut(r);
    const base = v;
    for (let j = 0; j < k; j++) vert(r[2 * j], r[2 * j + 1], h, 0, 0, 0, 1, 1, hM, seed, yr, osm);
    for (let t = 0; t < tri.length; t++) idx[ii++] = base + tri[t];
    // rooftop water tank / stair room on many low-rise roofs (very Hyderabad); size in metres
    const areaM = Math.abs(a) / 2 * mPerUnit * mPerUnit;
    if (h < 30 && areaM > 50 && (seed & 3) !== 0) {
      let cx = 0, cy = 0; for (let j = 0; j < k; j++) { cx += r[2 * j]; cy += r[2 * j + 1]; } cx /= k; cy /= k;
      const big = (seed & 3) === 3; // stair/lift room vs. black tank
      const s = (big ? 1.6 : 0.8) / mPerUnit, th = big ? 2.4 : 1.3;
      const kind = big ? 3 : 2;
      const P = [[cx - s, cy - s], [cx + s, cy - s], [cx + s, cy + s], [cx - s, cy + s]];
      const NS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      for (let j = 0; j < 4; j++) {
        const p0 = P[j], p1 = P[(j + 1) % 4], nn = NS[j];
        const b0 = vert(p0[0], p0[1], h, 0, nn[0], nn[1], 0, kind, hM, seed, yr, osm);
        const b1 = vert(p1[0], p1[1], h, 1, nn[0], nn[1], 0, kind, hM, seed, yr, osm);
        const b2 = vert(p1[0], p1[1], h + th, 1, nn[0], nn[1], 0, kind, hM, seed, yr, osm);
        const b3 = vert(p0[0], p0[1], h + th, 0, nn[0], nn[1], 0, kind, hM, seed, yr, osm);
        idx[ii++] = b0; idx[ii++] = b1; idx[ii++] = b2; idx[ii++] = b0; idx[ii++] = b2; idx[ii++] = b3;
      }
      const t0 = v; for (let j = 0; j < 4; j++) vert(P[j][0], P[j][1], h + th, 0, 0, 0, 1, kind, hM, seed, yr, osm);
      idx[ii++] = t0; idx[ii++] = t0 + 1; idx[ii++] = t0 + 2; idx[ii++] = t0; idx[ii++] = t0 + 2; idx[ii++] = t0 + 3;
    }
    if (i === d.ntall - 1) nIdxTall = ii;
  }
  if (d.ntall === 0) nIdxTall = 0;
  if (d.ntall >= d.n) nIdxTall = ii;
  return { vb: vb.slice(0, v * 16), idx: idx.slice(0, ii), nIdx: ii, nIdxTall, nv: v, mPerUnit };
}
self.onmessage = async (e) => {
  const { key, url, tx, ty } = e.data;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    let buf = new Uint8Array(await res.arrayBuffer());
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = await gunzip(buf);
    const d = decode(buf);
    const m = build(d, tx, ty, tx * 73856093 ^ ty * 19349663);
    self.postMessage({ key, ok: true, n: d.n, ntall: d.ntall, ...m }, [m.vb, m.idx.buffer]);
  } catch (err) {
    self.postMessage({ key, ok: false, error: String(err && err.message || err) });
  }
};
