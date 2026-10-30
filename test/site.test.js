const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const SITE = path.join(__dirname, '..', 'site');
const read = (f) => fs.readFileSync(path.join(SITE, f), 'utf8');
test('index has title, viewport and v3 scripts in order', () => {
  const h = read('index.html');
  assert.match(h, /<title>[^<]*Mirror World[^<]*<\/title>/);
  assert.match(h, /name="viewport"/);
  const order = ['citystyle.js', 'city3d.js', 'tour.js', 'app.js'].map((f) => h.indexOf(f));
  order.forEach((i) => assert.ok(i > 0));
  assert.deepStrictEqual([...order].sort((a, b) => a - b), order);
  for (const m of h.matchAll(/(?:src|href)="([^"?#:]+)(?:\?[^"]*)?"/g)) { if (!m[1].startsWith('http')) assert.ok(fs.existsSync(path.join(SITE, m[1])), 'missing ' + m[1]); }
});
test('city index points every tile at a helper site', () => {
  const ix = JSON.parse(read('data/cityindex.json'));
  const keys = Object.keys(ix.tiles);
  assert.ok(keys.length > 100);
  for (const k of keys) { const v = ix.tiles[k]; assert.ok(v[3] >= 0 && v[3] < ix.sites.length); }
  for (const s of ix.sites) assert.match(s, /^https:\/\/mirror-hyderabad-b\d\.sites\.tab\.bot\/c\/$/);
});
test('worker, style and landmarks are present', () => {
  assert.match(read('cityworker.js'), /importScripts\('earcut\.min\.js'\)/);
  assert.match(read('citystyle.js'), /window\.MirrorStyle/);
  const lm = JSON.parse(read('data/landmarks.json'));
  for (const n of ['Charminar', 'HITEC City', 'Hussain Sagar', 'Cyber Towers', 'Financial District', 'RGI Airport']) assert.ok(lm.some((l) => l.name === n), n);
  assert.doesNotMatch(read('index.html'), /TODO|lorem/i);
});
