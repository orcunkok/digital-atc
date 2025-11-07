<template>
  <div ref="mapContainer" class="map-container"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { createAircraftLayer } from './MapboxThree';
import { createSim } from './sim';

const mapContainer = ref(null);
let map = null;
let aircraftLayer = null;
let sim = null;
let originMercator = null;
let meterScale = null;

// Aircraft origin from KOAK_IFR_vectors_goaround scenario (lat/lon)
const originLat = 37.70;
const originLon = -122.35;
const originAltitudeMeters = 1000;
const initialHeadingDeg = 20; // Initial heading from scenario

onMounted(() => {
  // Replace with your Mapbox access token
  mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

  map = new mapboxgl.Map({
    container: mapContainer.value,
    style: 'mapbox://styles/mapbox/outdoors-v12',
    center: [originLon, originLat], // Oakland scenario coordinates
    zoom: 13,
    pitch: 70,
    bearing: 0,
    antialias: true,
    keyboard: false, // Disable Mapbox keyboard controls
  });

  map.on('load', () => {
    // Add terrain source
    map.addSource('mapbox-dem', {
      type: 'raster-dem',
      url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
      tileSize: 512,
      maxzoom: 14,
    });

    // Add terrain layer
    map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });

    // Add sky layer for better visualization
    map.addLayer({
      id: 'sky',
      type: 'sky',
      paint: {
        'sky-type': 'atmosphere',
        'sky-atmosphere-sun': [0.0, 90.0],
        'sky-atmosphere-sun-intensity': 15,
      },
    });

    // Convert origin lat/lon to Mercator using Mapbox API
    originMercator = mapboxgl.MercatorCoordinate.fromLngLat(
      [originLon, originLat],
      originAltitudeMeters
    );
    meterScale = originMercator.meterInMercatorCoordinateUnits();

    // Create Three.js layer with local coordinates
    aircraftLayer = createAircraftLayer({
      originMercator,
      scale: meterScale,
      initialX: 0, // Start at origin (0 meters east)
      initialY: 0, // Start at origin (0 meters north)
      initialZ: 0, // Start at origin altitude (0 meters relative)
      headingDeg: initialHeadingDeg,
    });
    map.addLayer(aircraftLayer);

    // Create GeoJSON source for breadcrumb trail
    map.addSource('aircraft-trail', {
      type: 'geojson',
      lineMetrics: true,
      data: {
        type: 'Feature',
        properties: {
          elevation: [],
        },
        geometry: {
          type: 'LineString',
          coordinates: [],
        },
      },
    });

    // Add elevated line layer for breadcrumb trail
    map.addLayer({
      id: 'aircraft-trail-line',
      type: 'line',
      source: 'aircraft-trail',
      layout: {
        'line-z-offset': [
          'at-interpolated',
          [
            '*',
            ['line-progress'],
            ['-', ['length', ['get', 'elevation']], 1],
          ],
          ['get', 'elevation'],
        ],
        'line-elevation-reference': 'sea',
      },
      paint: {
        'line-emissive-strength': 1.0,
        'line-width': 6,
        'line-color': '#40e0d0', // Turquoise
      },
    });

    // Helper function to convert local coordinates to lat/lon
    function localToLatLon(localX, localY, localZ) {
      const mercatorX = originMercator.x + localX * meterScale;
      const mercatorY = originMercator.y + localY * meterScale;
      const mercatorZ = originMercator.z + localZ * meterScale;
      const mercatorCoord = new mapboxgl.MercatorCoordinate(
        mercatorX,
        mercatorY,
        mercatorZ
      );
      const lngLat = mercatorCoord.toLngLat();
      return [lngLat.lng, lngLat.lat];
    }

    // Create sim that works in local coordinates
    sim = createSim({
      initialHeadingDeg,
      initialAltitudeMeters: 0, // Relative to origin
      onUpdate: (localState) => {
        // Update Three.js with local coordinates
        if (aircraftLayer && aircraftLayer.updatePosition) {
          aircraftLayer.updatePosition(
            localState.x,
            localState.y,
            localState.z,
            localState.headingDeg,
            localState.bankAngleDeg || 0
          );
        }

        // Update breadcrumb trail if we have position history
        if (localState.positionHistory && localState.positionHistory.length > 1) {
          const coordinates = [];
          const elevations = [];

          // Convert each point in history from local to lat/lon
          // Trail uses same coordinates as aircraft (aircraft offset handled in Three.js)
          for (const point of localState.positionHistory) {
            const [lng, lat] = localToLatLon(point.x, point.y, point.z);
            coordinates.push([lng, lat]);
            // Elevation in meters (absolute altitude)
            elevations.push(originAltitudeMeters + point.z);
          }

          // Update GeoJSON source
          const source = map.getSource('aircraft-trail');
          if (source) {
            source.setData({
              type: 'Feature',
              properties: {
                elevation: elevations,
              },
              geometry: {
                type: 'LineString',
                coordinates: coordinates,
              },
            });
          }
        }
      },
    });

    // Start simulation
    sim.start();

    // Add navigation controls (visualizePitch enables 2D/3D toggle)
    map.addControl(
      new mapboxgl.NavigationControl({
        visualizePitch: true,
        showCompass: true,
        showZoom: true,
      })
    );

    // Keyboard controls for aircraft
    const pressedKeys = new Set();

    function handleKeyDown(event) {
      // Prevent default behavior and stop propagation for arrow keys
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
      }
      pressedKeys.add(event.key);
      updateControls();
    }

    function handleKeyUp(event) {
      // Stop propagation for arrow keys
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
      }
      pressedKeys.delete(event.key);
      updateControls();
    }

    function updateControls() {
      if (!sim) return;

      // Speed control: ArrowUp = speed up, ArrowDown = slow down
      let speedInput = 0;
      if (pressedKeys.has('ArrowUp')) speedInput = 1;
      if (pressedKeys.has('ArrowDown')) speedInput = -1;

      // Turn control: ArrowLeft = turn left, ArrowRight = turn right
      let turnInput = 0;
      if (pressedKeys.has('ArrowLeft')) turnInput = 1;
      if (pressedKeys.has('ArrowRight')) turnInput = -1;

      sim.setControls({ speed: speedInput, turn: turnInput });
    }

    // Add keyboard event listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Store cleanup function
    window._cleanupKeyboardControls = () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  });
});

onUnmounted(() => {
  // Clean up keyboard controls
  if (window._cleanupKeyboardControls) {
    window._cleanupKeyboardControls();
    delete window._cleanupKeyboardControls;
  }

  if (sim) {
    sim.stop();
  }
  if (map) {
    map.remove();
  }
});
</script>

<style scoped>
.map-container {
  width: 100%;
  height: 100vh;
}
</style>