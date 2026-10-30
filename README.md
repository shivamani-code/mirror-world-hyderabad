# Mirror World: Hyderabad

Fly through a 3D Hyderabad and watch the city grow: real Landsat satellite photos from 1990 to 2026, about 934k 3D buildings that appear on a time slider, a day/night mode, and a 2040 growth prediction.

Live: https://mirror-hyderabad.sites.tab.bot/

## What's inside
- `site/`: the web app (MapLibre GL map, custom 3D city layer, guided tour, 1990 → 2040 slider)
  - `city3d.js`, `cityworker.js`: building tiles decoded in a Web Worker and extruded in 3D (earcut for polygons)
  - `data/`: city tile index, growth grid, corridors, landmarks, 2040 prediction map
- `tile-hosts/b1` … `b8`: the baked building tiles (`raw/*.bin`) with the tiny edge worker that serves them with CORS. The live app loads them from those hosts (URLs in `site/data/cityindex.json`).
- `tools/bake7.py`: bakes building footprints + heights into the binary tiles (DuckDB, Shapely)
- `tools/shot.py`, `tools/capture.py`: headless screenshots and fly-through capture (Playwright)
- `test/site.test.js`: basic checks (`node --test test/`)

## Run locally
```bash
cd site && python3 -m http.server 8080
# open http://localhost:8080
```
The Landsat photos and the building tiles stream from the live hosts, so you need internet.

## Tech
MapLibre GL JS, WebGL, Web Workers, vanilla JS. Data pipeline in Python (DuckDB, Shapely, NumPy).

## Data credits
Landsat 5/7/8/9 (USGS/NASA) via Microsoft Planetary Computer · GlobalBuildingAtlas (TU Munich) · Google Open Buildings 2.5D Temporal · OpenStreetMap contributors · OpenFreeMap / OpenMapTiles · Esri World Imagery · GHSL © European Union. The full credits panel is in the app. The baked building tiles are derived from these datasets and keep their original licences.
