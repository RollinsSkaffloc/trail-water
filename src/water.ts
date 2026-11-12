import { supabase } from './supabase';
import { FRESH_DAYS, STALE_DAYS } from './config';

export type Status = 'flowing' | 'trickling' | 'pooled' | 'dry';
export type Bounds = { west: number; south: number; east: number; north: number };

export interface WaterSource {
  id: string;
  name: string | null;
  kind: 'spring' | 'creek' | 'other';
  lng: number;
  lat: number;
  latest_status: Status | null;
  latest_observed_at: string | null;
  latest_note: string | null;
}

export interface Report {
  id: string;
  status: Status;
  note: string | null;
  observed_at: string;
}

export interface NewReport {
  source_id: string;
  status: Status;
  note: string | null;
  observed_at: string;
}

const STORE_KEY = 'water-sources-v1';
const QUEUE_KEY = 'pending-reports-v1';
const MAX_STORED = 10000;
const PAGE = 1000; // Supabase caps rows per request (default 1000)

// ---- local copy of sources, so the map still shows water offline ----
function readStore(): Record<string, WaterSource> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
  } catch {
    return {};
  }
}
function writeStore(store: Record<string, WaterSource>) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* storage full: skip */
  }
}
const inBounds = (s: WaterSource, b: Bounds) =>
  s.lng >= b.west && s.lng <= b.east && s.lat >= b.south && s.lat <= b.north;

export async function fetchSources(b: Bounds): Promise<WaterSource[]> {
  if (supabase && navigator.onLine) {
    try {
      const rows: WaterSource[] = [];
      for (let page = 0; page < 5; page++) {
        const { data, error } = await supabase
          .from('water_source_status')
          .select('*')
          .gte('lng', b.west).lte('lng', b.east)
          .gte('lat', b.south).lte('lat', b.north)
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error || !data) throw error ?? new Error('no data');
        rows.push(...(data as WaterSource[]));
        if (data.length < PAGE) break;
      }
      const store = readStore();
      for (const r of rows) store[r.id] = r;
      const ids = Object.keys(store);
      for (const id of ids.slice(0, Math.max(0, ids.length - MAX_STORED))) delete store[id];
      writeStore(store);
      return rows;
    } catch {
      /* fall through to the local copy */
    }
  }
  return Object.values(readStore()).filter((s) => inBounds(s, b));
}

export async function fetchReports(sourceId: string): Promise<Report[]> {
  if (!supabase || !navigator.onLine) return [];
  const { data } = await supabase
    .from('water_reports')
    .select('id,status,note,observed_at')
    .eq('source_id', sourceId)
    .order('observed_at', { ascending: false })
    .limit(10);
  return (data as Report[] | null) ?? [];
}

// ---- reporting, with an offline queue ----
function readQueue(): NewReport[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
  } catch {
    return [];
  }
}
const writeQueue = (q: NewReport[]) => localStorage.setItem(QUEUE_KEY, JSON.stringify(q));

export async function submitReport(r: NewReport): Promise<'sent' | 'queued'> {
  if (supabase && navigator.onLine) {
    try {
      const { error } = await supabase.from('water_reports').insert(r);
      if (!error) return 'sent';
      // PostgREST errors carry a code; network failures do not.
      if (error.code && error.code !== '42501') throw new Error(error.message);
    } catch (e) {
      if (e instanceof Error && !/fetch|network/i.test(e.message)) throw e;
    }
  }
  writeQueue([...readQueue(), r]);
  return 'queued';
}

export async function flushQueue(): Promise<number> {
  if (!supabase || !navigator.onLine) return 0;
  const queue = readQueue();
  const keep: NewReport[] = [];
  let sent = 0;
  for (const r of queue) {
    try {
      const { error } = await supabase.from('water_reports').insert(r);
      if (!error) sent++;
      else if (!error.code || error.code === '42501') keep.push(r); // offline or signed out: retry later
      // other errors: drop the bad report
    } catch {
      keep.push(r);
    }
  }
  writeQueue(keep);
  return sent;
}

// ---- freshness ----
export type Age = 'fresh' | 'recent' | 'stale' | 'none';
export function ageClass(iso: string | null): Age {
  if (!iso) return 'none';
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  return days <= FRESH_DAYS ? 'fresh' : days <= STALE_DAYS ? 'recent' : 'stale';
}

export function timeAgo(iso: string): string {
  const mins = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60_000);
  const unit = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'} ago`;
  if (mins < 60) return unit(Math.round(mins), 'minute');
  if (mins < 60 * 48) return unit(Math.round(mins / 60), 'hour');
  if (mins < 60 * 24 * 60) return unit(Math.round(mins / 60 / 24), 'day');
  return unit(Math.round(mins / 60 / 24 / 30), 'month');
}
