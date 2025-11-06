<template>
  <div ref="mapContainer" class="map-container"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const mapContainer = ref(null);
let map = null;

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
    const customLayer = {
      id: 'aircraft-3d-layer',
      type: 'custom',
      renderingMode: '3d',
      onAdd: function (map, gl) {
        this.camera = new THREE.Camera();
        this.scene = new THREE.Scene();

        // Add directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(0, 70, 100).normalize();
        this.scene.add(directionalLight);

        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        this.aircraft = null;
        this.map = map;

        // Use the Mapbox GL JS map canvas for three.js
        this.renderer = new THREE.WebGLRenderer({
          canvas: map.getCanvas(),
          context: gl,
          antialias: true,
        });

        this.renderer.autoClear = false;

        // Load GLB model
        const loader = new GLTFLoader();
        loader.load(
          '/Airplane.glb',
          (gltf) => {
            this.aircraft = gltf.scene;

            // Convert lat/lon/altitude to Mercator coordinates
            const mercatorCoord = mapboxgl.MercatorCoordinate.fromLngLat(
              [aircraftLon, aircraftLat],
              aircraftAltitudeMeters
            );

            // Set position directly
            this.aircraft.position.set(
              mercatorCoord.x,
              mercatorCoord.y,
              mercatorCoord.z
            );

            // Get scale factor for proper sizing
            const scale = mercatorCoord.meterInMercatorCoordinateUnits();
            this.aircraft.scale.set(scale, -scale, scale);

            // Rotate to fly horizontally (not pointing up like a rocket)
            // Rotate -90 degrees around X axis to lay flat, then apply heading
            const initalHeadingRad = (aircraftHeadingDeg * Math.PI) / 180;
            this.aircraft.rotation.set(-Math.PI / 2, Math.PI-initalHeadingRad, 0);

            this.scene.add(this.aircraft);
            map.triggerRepaint();
          },
          (progress) => {
            // Loading progress (optional)
            console.log('Loading aircraft model:', progress);
          },
          (error) => {
            console.error('Error loading aircraft model:', error);
          }
        );
      },

      render: function (gl, matrix) {
        if (!this.aircraft) {
          return; // Don't render until model is loaded
        }

        // Update camera projection matrix from Mapbox
        this.camera.projectionMatrix = new THREE.Matrix4()
          .fromArray(matrix)
          .multiply(new THREE.Matrix4().makeTranslation(0, 0, 0));

        this.renderer.resetState();
        this.renderer.render(this.scene, this.camera);
        this.map.triggerRepaint();
      },
    };

    map.addLayer(customLayer);

    // Add navigation controls
    map.addControl(new mapboxgl.NavigationControl());
  });
});

onUnmounted(() => {
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