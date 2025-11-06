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

// Aircraft position from KOAK_IFR_vectors_goaround scenario
const aircraftLat = 37.70;
const aircraftLon = -122.35;
const aircraftAltitudeMeters = 1000;
const aircraftHeadingDeg = 20; // Initial heading from scenario

onMounted(() => {
  // Replace with your Mapbox access token
  mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

  map = new mapboxgl.Map({
    container: mapContainer.value,
    style: 'mapbox://styles/mapbox/outdoors-v12',
    center: [aircraftLon, aircraftLat], // Oakland scenario coordinates
    zoom: 13,
    pitch: 70,
    bearing: 0,
    antialias: true,
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

    // Add Three.js custom layer with aircraft GLB model
    aircraftLayer = createAircraftLayer({
      lat: aircraftLat,
      lon: aircraftLon,
      altitudeMeters: aircraftAltitudeMeters,
      headingDeg: aircraftHeadingDeg,
    });
    map.addLayer(aircraftLayer);

    // Create and start simulation
    sim = createSim({
      initialLat: aircraftLat,
      initialLon: aircraftLon,
      altitudeMeters: aircraftAltitudeMeters,
      onUpdate: (state) => {
        // Update aircraft position when sim state changes
        if (aircraftLayer && aircraftLayer.updatePosition) {
          aircraftLayer.updatePosition(
            state.lat,
            state.lon,
            state.altitudeMeters,
            state.headingDeg
          );
        }
      },
    });

    // Start the simulation
    sim.start();

    // Add navigation controls
    map.addControl(new mapboxgl.NavigationControl());
  });
});

onUnmounted(() => {
  // Stop simulation
  if (sim) {
    sim.stop();
  }

  // Remove map
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