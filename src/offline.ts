import { OFFLINE_AREA_SQ_MI, OFFLINE_MAX_ZOOM, OFFLINE_MIN_ZOOM, TOPO_TILE_URL } from './config';
import { fetchSources, type Bounds } from './water';

// Must match the cacheName in vite.config.ts so the service worker serves these tiles offline.
const CACHE_NAME = 'topo-tiles';
const SQ_MI_TO_KM2 = 2.589988;
export const AVG_TILE_KB = 30;

/** Square of `sqMi` square miles centered on a point. */
export function areaAround(lng: number, lat: number, sqMi = OFFLINE_AREA_SQ_MI): Bounds {
  const sideKm = Math.sqrt(sqMi * SQ_MI_TO_KM2);
  const dLat = sideKm / 2 / 110.574;
  const dLng = sideKm / 2 / (111.32 * Math.cos((lat * Math.PI) / 180));
  return { west: lng - dLng, east: lng + dLng, south: lat - dLat, north: lat + dLat };
}

const tileX = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
const tileY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

export function listTiles(b: Bounds): string[] {
  const urls: string[] = [];
  for (let z = OFFLINE_MIN_ZOOM; z <= OFFLINE_MAX_ZOOM; z++) {
    const x0 = tileX(b.west, z), x1 = tileX(b.east, z);
    const y0 = tileY(b.north, z), y1 = tileY(b.south, z);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        urls.push(TOPO_TILE_URL.replace('{z}', `${z}`).replace('{y}', `${y}`).replace('{x}', `${x}`));
  }
  return urls;
}

export async function downloadArea(
  b: Bounds,
  onProgress: (done: number, total: number) => void,
): Promise<{ total: number; failed: number }> {
  const urls = listTiles(b);
  const cache = await caches.open(CACHE_NAME);
  let next = 0, done = 0, failed = 0;

  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++];
      try {
        if (!(await cache.match(url))) {
          const res = await fetch(url, { mode: 'cors' });
          if (res.ok) await cache.put(url, res);
          else failed++;
        }
      } catch {
        failed++;
      }
      onProgress(++done, urls.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));

  await fetchSources(b); // also stores the area's water sources for offline use
  await navigator.storage?.persist?.(); // ask the browser not to evict the cache
  return { total: urls.length, failed };
}
