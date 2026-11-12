// Imports springs and named streams from OpenStreetMap into Supabase.
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/import-osm-water.mjs [south west north east]
// Default area: Superstition Wilderness region.
const [south, west, north, east] = process.argv.slice(2).length === 4
  ? process.argv.slice(2).map(Number)
  : [33.3, -111.6, 33.62, -111.05];

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY (your secret key, sb_secret_..., or the legacy service_role key; keep it off the client).');
  process.exit(1);
}

const query = `[out:json][timeout:90];
(
  node["natural"="spring"](${south},${west},${north},${east});
  way["waterway"~"^(stream|river)$"]["name"](${south},${west},${north},${east});
);
out center tags;`;

const res = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  body: new URLSearchParams({ data: query }),
});
if (!res.ok) throw new Error(`Overpass error ${res.status}`);
const { elements } = await res.json();

const rows = elements
  .map((el) => {
    const isNode = el.type === 'node';
    const lat = isNode ? el.lat : el.center?.lat;
    const lng = isNode ? el.lon : el.center?.lon;
    if (lat == null || lng == null) return null;
    return {
      osm_ref: `${isNode ? 'n' : 'w'}${el.id}`,
      name: el.tags?.name ?? null,
      kind: isNode ? 'spring' : 'creek',
      lng,
      lat,
    };
  })
  .filter(Boolean);

console.log(`Found ${rows.length} features. Uploading...`);
for (let i = 0; i < rows.length; i += 500) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/water_sources?on_conflict=osm_ref`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      // Legacy service_role keys are JWTs and go in Authorization too.
      // New sb_secret_ keys are not JWTs: send them in apikey only.
      ...(SUPABASE_SERVICE_KEY.startsWith('eyJ') && { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` }),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows.slice(i, i + 500)),
  });
  if (!r.ok) throw new Error(`Supabase error ${r.status}: ${await r.text()}`);
}
console.log('Done.');
