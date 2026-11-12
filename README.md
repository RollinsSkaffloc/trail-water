# Trail Water

Offline-capable hiking map with crowdsourced water reports. Phase 1 web MVP (PWA).

Requires Node 20.19+ (or 22.12+).

## Run it

1. Create a free project at supabase.com. In the SQL Editor, run `supabase/schema.sql`.
2. Copy `.env.example` to `.env` and fill in the project URL and anon key.
3. `npm install`
4. Load water sources (springs and named streams from OpenStreetMap). Use the secret key (`sb_secret_...`), never in `.env`:
   `SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npm run import:water`
   Optional bbox args: `south west north east`.
5. `npm run dev`

The service worker is off in dev. To test offline: `npm run build && npm run preview`, open the site,
use **Save offline area**, then turn on airplane mode (GPS still works) and reload.

## How it fits together

- `src/map.ts`: MapLibre map. OSM raster covers the globe, USGS Topo draws over it in the US from zoom 9.
  Water points are colored by latest report and faded by age.
- `src/offline.ts`: downloads a 200 sq mile square of USGS tiles into the `topo-tiles` Cache Storage
  bucket, which the service worker (see `vite.config.ts`) serves cache-first.
- `src/water.ts`: Supabase reads and writes, a local copy of sources, and a queue for reports
  posted without signal (sent when you are back online).
- `supabase/schema.sql`: tables, a `water_source_status` view, and row-level security.

## Known gaps

- Offline topo is US only (USGS). Worldwide offline needs a self-hosted PMTiles basemap (phase 2).
- USGS may return blank tiles just outside the US border; if you see white tiles, tighten `TOPO_COVERAGE`.
- Add 192px and 512px PNG icons to `public/` and the manifest so Android offers install.
- No moderation yet (flagging, rate limits).
- Check the USGS and OSM tile usage policies before launching publicly.
