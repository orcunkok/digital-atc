<template>
  <div ref="mapContainer" class="map-container">
    <button @click="toggleFollow" class="follow-btn" :class="{ active: isFollowing }">
      <SwitchCamera :size="20" />
    </button>
    <div class="automation-controls">
      <div class="control-group">
        <label for="heading-input">Heading</label>
        <input
          id="heading-input"
          v-model.number="headingInput"
          type="number"
          min="0"
          max="360"
          placeholder="000"
          @keyup.enter="setAll"
          class="control-input"
        />
      </div>
      <div class="control-group">
        <label for="altitude-input">Altitude</label>
        <input
          id="altitude-input"
          v-model.number="altitudeInput"
          type="number"
          min="-1000"
          max="60000"
          placeholder="10000"
          @keyup.enter="setAll"
          class="control-input"
        />
      </div>
      <div class="control-group">
        <label for="speed-input">Speed</label>
        <input
          id="speed-input"
          v-model.number="speedInputValue"
          type="number"
          min="40"
          max="400"
          placeholder="120"
          @keyup.enter="setAll"
          class="control-input"
        />
      </div>
      <button @click="setAll" class="set-all-btn">Set</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { SwitchCamera } from 'lucide-vue-next';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { createAircraftLayer } from './MapboxThree';
import { createSim } from './sim';
import { simState } from '../composables/useSimState';

const mapContainer = ref(null);
const isFollowing = ref(true);
const headingInput = ref(null);
const altitudeInput = ref(null);
const speedInputValue = ref(null);
let map = null;
let aircraftLayer = null;
let sim = null;
let originMercator = null;
let meterScale = null;
let isTopDownView = false;
let cleanupMapEvents = null;
let localToLatLon = null;

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
        'line-color': '#F4D6CC',
        'line-opacity': 0.7,
      },
    });

    // Create GeoJSON source for aircraft shadow triangle
    map.addSource('aircraft-shadow', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {
          heading: 0,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[]],
        },
      },
    });

    // Add fill-extrusion layer for aircraft shadow (after trail so it renders on top)
    // Using fill-extrusion with minimal height ensures it renders above the trail
    map.addLayer({
      id: 'aircraft-shadow-layer',
      type: 'fill-extrusion',
      source: 'aircraft-shadow',
      paint: {
        'fill-extrusion-color': '#C83E4D',
        'fill-extrusion-opacity': 1,
        'fill-extrusion-height': 0.1, // Very small height to ensure it's above trail
        'fill-extrusion-base': 0,
      },
    });

    // Helper function to convert local coordinates to lat/lon
    localToLatLon = (localX, localY, localZ) => {
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
    };

    // Helper function for degree-to-radian conversion
    const DEG_TO_RAD = Math.PI / 180;
    const toRadians = (deg) => deg * DEG_TO_RAD;

    // Performance optimization: throttle updates for expensive operations
    let lastTrailUpdate = 0;
    let lastShadowUpdate = 0;
    const TRAIL_UPDATE_INTERVAL = 100; // Update trail every 100ms
    const SHADOW_UPDATE_INTERVAL = 100; // Update shadow every 100ms

    // Cache sources to avoid repeated lookups
    let trailSource = null;
    let shadowSource = null;

    // Constants for shadow calculations
    const TRIANGLE_LENGTH = 300;
    const TRIANGLE_WIDTH = 200;
    const TRIANGLE_BACK_RATIO = 0.3;
    const SHADOW_ELEVATION = 0.1;
    const MPS_TO_KT = 1.944;
    const M_TO_FT = 3.28084;
    const MPS_TO_FPM = 196.85; // meters per second to feet per minute

    // Create sim that works in local coordinates
    sim = createSim({
      initialHeadingDeg,
      initialAltitudeMeters: 0, // Relative to origin
      originAltitudeMeters, // Pass origin altitude for absolute target conversion
      onUpdate: (localState) => {
        const now = performance.now();

        // Update shared sim state

        // Calculate vertical speed from pitch
        const pitchRad = (localState.pitchAngleDeg || 0) * (Math.PI / 180);
        const verticalSpeedMps = localState.speedMps * Math.sin(pitchRad);
        const verticalSpeedFpm = verticalSpeedMps * MPS_TO_FPM;

        simState.value = {
          ...simState.value,
          altitudeFt: Math.round((originAltitudeMeters + localState.z) * M_TO_FT),
          headingDeg: localState.headingDeg,
          speedKt: Math.round(localState.speedMps * MPS_TO_KT),
          vsFpm: Math.round(verticalSpeedFpm),
        };

        // Update targets from sim
        const targets = sim.getTargets();
        simState.value.targetHeadingDeg = targets.headingDeg;
        simState.value.targetAltitudeFt = targets.altitudeFt;
        simState.value.targetSpeedKt = targets.speedKt;

        // Always update Three.js aircraft position (critical for smooth rendering)
        aircraftLayer?.updatePosition?.(
          localState.x,
          localState.y,
          localState.z,
          localState.headingDeg,
          localState.bankAngleDeg || 0,
          localState.pitchAngleDeg || 0
        );

        // Update camera to follow aircraft if follow mode is enabled
        if (isFollowing.value) {
          const [lng, lat] = localToLatLon(localState.x, localState.y, localState.z);
          map.setCenter([lng, lat]);
        }

        // Throttle trail updates
        if (now - lastTrailUpdate >= TRAIL_UPDATE_INTERVAL && localState.positionHistory?.length > 1) {
          lastTrailUpdate = now;
          if (!trailSource) trailSource = map.getSource('aircraft-trail');
          
          const coordinates = [];
          const elevations = [];
          for (const point of localState.positionHistory) {
            const [lng, lat] = localToLatLon(point.x, point.y, point.z);
            coordinates.push([lng, lat]);
            elevations.push(isTopDownView ? 0 : originAltitudeMeters + point.z);
          }

          trailSource?.setData({
            type: 'Feature',
            properties: { elevation: elevations },
            geometry: { type: 'LineString', coordinates },
          });
        }

        // Throttle shadow updates
        if (now - lastShadowUpdate >= SHADOW_UPDATE_INTERVAL) {
          lastShadowUpdate = now;
          if (!shadowSource) shadowSource = map.getSource('aircraft-shadow');

          const headingRad = toRadians(localState.headingDeg);
          const sinH = Math.sin(headingRad);
          const cosH = Math.cos(headingRad);
          const backLength = TRIANGLE_LENGTH * TRIANGLE_BACK_RATIO;
          const halfWidth = TRIANGLE_WIDTH / 2;

          const noseX = localState.x + sinH * TRIANGLE_LENGTH;
          const noseY = localState.y + cosH * TRIANGLE_LENGTH;
          const leftX = localState.x - sinH * backLength - cosH * halfWidth;
          const leftY = localState.y - cosH * backLength + sinH * halfWidth;
          const rightX = localState.x - sinH * backLength + cosH * halfWidth;
          const rightY = localState.y - cosH * backLength - sinH * halfWidth;

          const [noseLng, noseLat] = localToLatLon(noseX, noseY, SHADOW_ELEVATION);
          const [leftLng, leftLat] = localToLatLon(leftX, leftY, SHADOW_ELEVATION);
          const [rightLng, rightLat] = localToLatLon(rightX, rightY, SHADOW_ELEVATION);

          shadowSource?.setData({
            type: 'Feature',
            properties: { heading: Math.round(localState.headingDeg), elevation: originAltitudeMeters + SHADOW_ELEVATION },
            geometry: {
              type: 'Polygon',
              coordinates: [[[noseLng, noseLat], [leftLng, leftLat], [rightLng, rightLat], [noseLng, noseLat]]],
            },
          });
        }
      },
    });

    // Start simulation
    sim.start();

    // Navigation controls removed - using custom controls in App.vue

    // Track camera pitch to detect top-down view
    function updateTopDownState() {
      const pitch = map.getPitch();
      isTopDownView = Math.abs(pitch) < 5;
    }

    // Listen for pitch changes (throttled to reduce overhead)
    let pitchUpdateTimeout = null;
    const throttledUpdateTopDown = () => {
      if (pitchUpdateTimeout) return;
      pitchUpdateTimeout = setTimeout(() => {
        updateTopDownState();
        pitchUpdateTimeout = null;
      }, 50);
    };

    map.on('pitch', throttledUpdateTopDown);
    map.on('move', throttledUpdateTopDown);
    
    // Store cleanup function for map events
    cleanupMapEvents = () => {
      if (map) {
        map.off('pitch', throttledUpdateTopDown);
        map.off('move', throttledUpdateTopDown);
      }
      if (pitchUpdateTimeout) {
        clearTimeout(pitchUpdateTimeout);
        pitchUpdateTimeout = null;
      }
    };
    
    // Initialize state
    updateTopDownState();

    // Keyboard controls for aircraft
    const pressedKeys = new Set();

    function handleKeyDown(event) {
      // Prevent default behavior and stop propagation for arrow keys, A/D, and W/S
      if (['ArrowUp', 'ArrowDown', 'a', 'A', 'd', 'D', 'w', 'W', 's', 'S'].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
      }
      pressedKeys.add(event.key);
      updateControls();
    }

    function handleKeyUp(event) {
      // Stop propagation for arrow keys, A/D, and W/S
      if (['ArrowUp', 'ArrowDown', 'a', 'A', 'd', 'D', 'w', 'W', 's', 'S'].includes(event.key)) {
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

      // Turn control: A = turn left, D = turn right
      let turnInput = 0;
      if (pressedKeys.has('a') || pressedKeys.has('A')) turnInput = 1;
      if (pressedKeys.has('d') || pressedKeys.has('D')) turnInput = -1;

      // Pitch control: W = pitch down (descend), S = pitch up (climb)
      let pitchInput = 0;
      if (pressedKeys.has('w') || pressedKeys.has('W')) pitchInput = -1;
      if (pressedKeys.has('s') || pressedKeys.has('S')) pitchInput = 1;

      sim.setControls({ speed: speedInput, turn: turnInput, pitch: pitchInput });
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

function setHeading() {
  if (sim && headingInput.value !== null && headingInput.value !== '') {
    sim.setHeading(headingInput.value);
  }
}

function setAltitude() {
  if (sim && altitudeInput.value !== null && altitudeInput.value !== '') {
    sim.setAltitude(altitudeInput.value);
  }
}

function setSpeed() {
  if (sim && speedInputValue.value !== null && speedInputValue.value !== '') {
    sim.setSpeed(speedInputValue.value);
  }
}

function setAll() {
  if (sim) {
    if (headingInput.value !== null && headingInput.value !== '') {
      sim.setHeading(headingInput.value);
    }
    if (altitudeInput.value !== null && altitudeInput.value !== '') {
      sim.setAltitude(altitudeInput.value);
    }
    if (speedInputValue.value !== null && speedInputValue.value !== '') {
      sim.setSpeed(speedInputValue.value);
    }
  }
}

// Expose map and sim for external control
defineExpose({
  map,
  sim,
  get isFollowing() {
    return isFollowing.value;
  },
  get isRunning() {
    return sim ? sim.isRunning : false;
  },
  start() {
    if (sim) sim.start();
  },
  pause() {
    if (sim) sim.stop();
  },
  togglePause() {
    if (!sim) return;
    if (sim.isRunning) {
      sim.stop();
    } else {
      sim.start();
    }
  },
  toggleFollow() {
    isFollowing.value = !isFollowing.value;
  },
  centerOnAircraft() {
    if (sim && map) {
      const state = sim.getState();
      const [lng, lat] = localToLatLon(state.x, state.y, state.z);
      map.setCenter([lng, lat]);
      isFollowing.value = false;
    }
  },
  setPitch(pitch) {
    if (map) {
      map.easeTo({ pitch });
    }
  },
  getPitch() {
    return map ? map.getPitch() : 0;
  },
  reset() {
    if (!sim || !map) return;
    
    // Reset simulation
    sim.reset();
    
    // Clear trail
    const trailSrc = map.getSource('aircraft-trail');
    if (trailSrc) {
      trailSrc.setData({
        type: 'Feature',
        properties: { elevation: [] },
        geometry: {
          type: 'LineString',
          coordinates: [],
        },
      });
    }
    
    // Reset shadow to initial position
    const shadowSrc = map.getSource('aircraft-shadow');
    if (shadowSrc && localToLatLon) {
      const headingRad = (initialHeadingDeg * Math.PI) / 180;
      const TRIANGLE_LENGTH = 300;
      const TRIANGLE_WIDTH = 200;
      const TRIANGLE_BACK_RATIO = 0.3;
      const SHADOW_ELEVATION = 0.1;
      const sinH = Math.sin(headingRad);
      const cosH = Math.cos(headingRad);
      const backLength = TRIANGLE_LENGTH * TRIANGLE_BACK_RATIO;
      const halfWidth = TRIANGLE_WIDTH / 2;
      
      const noseX = sinH * TRIANGLE_LENGTH;
      const noseY = cosH * TRIANGLE_LENGTH;
      const leftX = -sinH * backLength - cosH * halfWidth;
      const leftY = -cosH * backLength + sinH * halfWidth;
      const rightX = -sinH * backLength + cosH * halfWidth;
      const rightY = -cosH * backLength - sinH * halfWidth;
      
      const [noseLng, noseLat] = localToLatLon(noseX, noseY, SHADOW_ELEVATION);
      const [leftLng, leftLat] = localToLatLon(leftX, leftY, SHADOW_ELEVATION);
      const [rightLng, rightLat] = localToLatLon(rightX, rightY, SHADOW_ELEVATION);
      
      shadowSrc.setData({
        type: 'Feature',
        properties: { heading: initialHeadingDeg, elevation: originAltitudeMeters + SHADOW_ELEVATION },
        geometry: {
          type: 'Polygon',
          coordinates: [[[noseLng, noseLat], [leftLng, leftLat], [rightLng, rightLat], [noseLng, noseLat]]],
        },
      });
    }
    
    // Reset aircraft position in Three.js
    aircraftLayer?.updatePosition?.(0, 0, 0, initialHeadingDeg, 0, 0);
    
    // Reset map camera to initial position
    map.setCenter([originLon, originLat]);
    
    // Restart simulation
    sim.start();
  },
});

onUnmounted(() => {
  // Clean up keyboard controls
  if (window._cleanupKeyboardControls) {
    window._cleanupKeyboardControls();
    delete window._cleanupKeyboardControls;
  }

  // Clean up map event listeners
  if (map && cleanupMapEvents) {
    cleanupMapEvents();
  }

  if (sim) {
    sim.stop();
  }
  if (map) {
    map.remove();
  }
  
  // Clear cached sources
  trailSource = null;
  shadowSource = null;
});
</script>

<style scoped>
.map-container {
  width: 100%;
  height: 100vh;
  position: relative;
}

.follow-btn {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: #9e9e9e;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  z-index: 1000;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.follow-btn:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.follow-btn.active {
  background: #4caf50;
}

.follow-btn svg {
  color: #000;
}

.automation-controls {
  position: absolute;
  bottom: 20px;
  left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 1000;
  background: rgba(255, 255, 255, 0.95);
  padding: 12px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  min-width: 180px;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-group label {
  font-size: 12px;
  font-weight: 600;
  color: #333;
  min-width: 60px;
  text-align: right;
}

.control-input {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 13px;
  width: 70px;
  appearance: textfield;
  -moz-appearance: textfield;
}

.control-input:focus {
  outline: none;
  border-color: #4caf50;
}

/* Hide spinner buttons in number inputs */
.control-input::-webkit-inner-spin-button,
.control-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.control-btn {
  padding: 6px 12px;
  background: #4caf50;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.control-btn:hover {
  background: #45a049;
}

.control-btn:active {
  background: #3d8b40;
}

.set-all-btn {
  margin-top: 8px;
  padding: 8px 16px;
  background: #4caf50;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  width: 100%;
}

.set-all-btn:hover {
  background: #45a049;
}

.set-all-btn:active {
  background: #3d8b40;
}

/* Hide Mapbox logo and attribution */
:deep(.mapboxgl-ctrl-logo) {
  display: none !important;
}

:deep(.mapboxgl-ctrl-attrib) {
  display: none !important;
}
</style>