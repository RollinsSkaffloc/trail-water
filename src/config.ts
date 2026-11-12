// Offline download: a square of this area, centered on the map, is cached.
export const OFFLINE_AREA_SQ_MI = 200;
export const OFFLINE_MIN_ZOOM = 8;
export const OFFLINE_MAX_ZOOM = 16; // USGS Topo's cached tiles stop here; the map overzooms past it.

// Water sources are only queried at or above this zoom (keeps world-scale views light).
export const MIN_SOURCE_ZOOM = 9;

// Reports older than STALE_DAYS are drawn as "unknown" on the map.
export const FRESH_DAYS = 7;
export const STALE_DAYS = 30;

export const GLOBAL_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TOPO_TILE_URL =
  'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}';

// West, south, east, north. Rough US extent (incl. Alaska, Hawaii, territories).
export const TOPO_COVERAGE: [number, number, number, number] = [-179.5, 17.5, -64.5, 71.5];

export const START_VIEW = { center: [-111.3, 33.45] as [number, number], zoom: 10 };
