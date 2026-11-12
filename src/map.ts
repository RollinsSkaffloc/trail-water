import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection } from 'geojson';
import { GLOBAL_TILE_URL, START_VIEW, TOPO_COVERAGE, TOPO_TILE_URL } from './config';
import { ageClass, type Bounds, type WaterSource } from './water';

// Global OSM base for the whole world, with USGS Topo drawn on top where it exists (zoom 9+).
const style: StyleSpecification = {
  version: 8,
  sources: {
    global: {
      type: 'raster',
      tiles: [GLOBAL_TILE_URL],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
    topo: {
      type: 'raster',
      tiles: [TOPO_TILE_URL],
      tileSize: 256,
      maxzoom: 16,
      bounds: TOPO_COVERAGE,
      attribution: 'USGS The National Map',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#dde4da' } },
    { id: 'global', type: 'raster', source: 'global' },
    { id: 'topo', type: 'raster', source: 'topo', minzoom: 9 },
  ],
};

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

export function createMap(container: string): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style,
    center: START_VIEW.center,
    zoom: START_VIEW.zoom,
    minZoom: 1,
    maxZoom: 19,
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'bottom-right');
  map.addControl(
    new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showAccuracyCircle: true,
    }),
    'bottom-right',
  );
  map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left');

  map.on('load', () => {
    map.addSource('water', { type: 'geojson', data: EMPTY });
    map.addLayer({
      id: 'water-points',
      type: 'circle',
      source: 'water',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 5, 14, 10],
        'circle-color': [
          'match', ['get', 'display'],
          'flowing', '#1d6fd1',
          'trickling', '#12a08f',
          'pooled', '#d99a00',
          'dry', '#c0392b',
          '#7d8a80',
        ],
        'circle-opacity': ['match', ['get', 'age'], 'fresh', 1, 'recent', 0.8, 0.55],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    });
    map.addSource('offline-area', { type: 'geojson', data: EMPTY });
    map.addLayer({
      id: 'offline-area',
      type: 'line',
      source: 'offline-area',
      paint: { 'line-color': '#17211b', 'line-width': 2.5, 'line-dasharray': [2, 1.5] },
    });
  });
  return map;
}

export function setWaterData(map: maplibregl.Map, sources: WaterSource[]) {
  const src = map.getSource('water') as GeoJSONSource | undefined;
  src?.setData({
    type: 'FeatureCollection',
    features: sources.map((s) => {
      const age = ageClass(s.latest_observed_at);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
        // Old reports are shown as "unknown": stale water info is worse than none.
        properties: {
          id: s.id,
          age,
          display: age === 'fresh' || age === 'recent' ? s.latest_status : 'unknown',
        },
      };
    }),
  });
}

export function showArea(map: maplibregl.Map, b: Bounds) {
  const ring = [[b.west, b.south], [b.east, b.south], [b.east, b.north], [b.west, b.north], [b.west, b.south]];
  (map.getSource('offline-area') as GeoJSONSource | undefined)?.setData({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ring } }],
  });
}

export function clearArea(map: maplibregl.Map) {
  (map.getSource('offline-area') as GeoJSONSource | undefined)?.setData(EMPTY);
}
