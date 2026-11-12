import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { AVG_TILE_KB, areaAround, downloadArea, listTiles } from './offline';
import { MIN_SOURCE_ZOOM, OFFLINE_AREA_SQ_MI, TOPO_COVERAGE } from './config';
import { clearArea, createMap, setWaterData, showArea } from './map';
import { supabase } from './supabase';
import { closeSheet, openSheet, toast } from './ui';
import { fetchSources, flushQueue, type WaterSource } from './water';

registerSW({ immediate: true });

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const map = createMap('map');
let sources = new Map<string, WaterSource>();
let signedIn = false;

// ---- water sources in view ----
let refreshTimer: number | undefined;
async function refresh() {
  if (map.getZoom() < MIN_SOURCE_ZOOM) {
    sources = new Map();
    setWaterData(map, []);
    return;
  }
  const b = map.getBounds();
  const list = await fetchSources({
    west: Math.max(-180, b.getWest()),
    east: Math.min(180, b.getEast()),
    south: Math.max(-85, b.getSouth()),
    north: Math.min(85, b.getNorth()),
  });
  sources = new Map(list.map((s) => [s.id, s]));
  setWaterData(map, list);
}
map.on('load', refresh);
map.on('moveend', () => {
  clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(refresh, 300);
});

// ---- selecting a source ----
const sheetContext = {
  get signedIn() { return signedIn; },
  onSignIn: () => $<HTMLDialogElement>('auth-dialog').showModal(),
  onPosted: async (id: string) => {
    await refresh();
    const s = sources.get(id);
    if (s) openSheet(s, sheetContext);
  },
};
map.on('click', (e) => {
  const pad = 12; // generous tap target for fingers
  const hit = map.queryRenderedFeatures(
    [[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]],
    { layers: ['water-points'] },
  )[0];
  const src = hit && sources.get(String(hit.properties?.id));
  if (src) openSheet(src, sheetContext);
  else closeSheet();
});
map.on('mouseenter', 'water-points', () => (map.getCanvas().style.cursor = 'pointer'));
map.on('mouseleave', 'water-points', () => (map.getCanvas().style.cursor = ''));

// ---- reports saved while offline ----
async function postSavedReports() {
  const n = await flushQueue();
  if (n) {
    toast(`Posted ${n} saved report${n === 1 ? '' : 's'}.`);
    refresh();
  }
}

// ---- auth ----
const authBtn = $('auth-btn');
if (!supabase) {
  authBtn.hidden = true;
} else {
  supabase.auth.onAuthStateChange((_event, session) => {
    signedIn = !!session;
    authBtn.textContent = signedIn ? 'Sign out' : 'Sign in';
    if (signedIn) postSavedReports();
  });
  authBtn.addEventListener('click', () =>
    signedIn ? supabase!.auth.signOut() : $<HTMLDialogElement>('auth-dialog').showModal(),
  );
  $('auth-cancel').addEventListener('click', () => $<HTMLDialogElement>('auth-dialog').close());
  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $<HTMLInputElement>('auth-email').value;
    const { error } = await supabase!.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    $<HTMLDialogElement>('auth-dialog').close();
    toast(error ? `Could not send link: ${error.message}` : 'Check your email for the sign-in link.');
  });
}

// ---- offline area ----
const offlineDialog = $<HTMLDialogElement>('offline-dialog');
const goBtn = $<HTMLButtonElement>('offline-go');
const progress = $<HTMLProgressElement>('offline-progress');

$('offline-btn').addEventListener('click', () => {
  const c = map.getCenter();
  const b = areaAround(c.lng, c.lat);
  const tiles = listTiles(b).length;
  const [w, s, e, n] = TOPO_COVERAGE;
  const inUS = c.lng >= w && c.lng <= e && c.lat >= s && c.lat <= n;
  showArea(map, b);
  $('offline-text').textContent =
    `Saves the dashed ${OFFLINE_AREA_SQ_MI} square mile area centered on the map: about ${tiles.toLocaleString()} topo tiles, ` +
    `roughly ${Math.round((tiles * AVG_TILE_KB) / 1024)} MB, plus its water sources. ` +
    (inUS ? 'GPS works without signal once this finishes.' : 'USGS topo covers the US only. Move the map over the US to save topo tiles.');
  goBtn.disabled = !inUS || !navigator.onLine;
  progress.hidden = true;
  offlineDialog.showModal();
});
offlineDialog.addEventListener('close', () => clearArea(map));
$('offline-cancel').addEventListener('click', () => offlineDialog.close());
goBtn.addEventListener('click', async () => {
  const c = map.getCenter();
  goBtn.disabled = true;
  progress.hidden = false;
  const { total, failed } = await downloadArea(areaAround(c.lng, c.lat), (done, all) => {
    progress.max = all;
    progress.value = done;
  });
  offlineDialog.close();
  toast(failed ? `Saved ${total - failed} of ${total} tiles. Try again on a better connection.` : 'Offline area saved.');
});

// ---- connectivity ----
const net = $('net');
const syncNet = () => (net.hidden = navigator.onLine);
window.addEventListener('online', () => {
  syncNet();
  postSavedReports();
});
window.addEventListener('offline', syncNet);
syncNet();
