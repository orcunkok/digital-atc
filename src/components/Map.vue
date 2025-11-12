<template>
  <div ref="mapContainer" class="map-container">
    <button @click="toggleFollow" class="follow-btn" :class="{ active: isFollowing }">
      <SwitchCamera :size="20" />
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { SwitchCamera } from 'lucide-vue-next';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { createAircraftThreeLayer } from '../composables/useAircraftThreeLayer';
import { useAircraftSimulation } from '../composables/useAircraftSimulation';
import { simState } from '../composables/useSimState';
import { defaultStartState } from '../sim/defaultStartState';

const mapContainer = ref(null);
const isFollowing = ref(false);
let map = null;
let aircraftLayer = null;
const sim = ref(null);
let originMercator = null;
let meterScale = null;
let isTopDownView = false;
let cleanupMapEvents = null;
let localToLatLon = null;

// Aircraft origin - will be set from scenario
let originLat = defaultStartState.lat;
let originLon = defaultStartState.lon;
let originAltitudeFt = defaultStartState.altitudeFt;
let initialHeadingDeg = defaultStartState.headingDeg;
let initialSpeedKt = defaultStartState.groundspeedKt;

// Precomputed constants
const DEG_TO_RAD = Math.PI / 180;
const PITCH_THRESHOLD = 5;
const TRIANGLE_LENGTH = 300;
const TRIANGLE_WIDTH = 200;
const TRIANGLE_BACK_RATIO = 0.3;
const TRIANGLE_HALF_WIDTH = TRIANGLE_WIDTH / 2;
const SHADOW_ELEVATION = 0.1;
const MPS_TO_KT = 1.944;
const M_TO_FT = 3.28084;
const MPS_TO_FPM = 196.85;
const FT_TO_M = 0.3048;
const TRAIL_UPDATE_INTERVAL = 100;
const SHADOW_UPDATE_INTERVAL = 100;
const PITCH_UPDATE_THROTTLE = 50;

const toRadians = (deg) => deg * DEG_TO_RAD;

function computeShadowVertices(x, y, headingRad) {
  const sinH = Math.sin(headingRad);
  const cosH = Math.cos(headingRad);
  const forwardEast = sinH;
  const forwardNorth = -cosH;
  const leftEast = cosH;
  const leftNorth = sinH;
  
  const forwardDist = TRIANGLE_LENGTH;
  const tailDist = TRIANGLE_LENGTH * TRIANGLE_BACK_RATIO;
  
  const noseX = x + forwardEast * forwardDist;
  const noseY = y + forwardNorth * forwardDist;
  const tailX = x - forwardEast * tailDist;
  const tailY = y - forwardNorth * tailDist;

  return {
    nose: [noseX, noseY],
    left: [tailX + leftEast * TRIANGLE_HALF_WIDTH, tailY + leftNorth * TRIANGLE_HALF_WIDTH],
    right: [tailX - leftEast * TRIANGLE_HALF_WIDTH, tailY - leftNorth * TRIANGLE_HALF_WIDTH],
  };
}

let pendingStartState = { ...defaultStartState };
let currentOriginAltitudeMeters = 0;

function applyStartStateConfig(startState = {}) {
  const config = { ...defaultStartState, ...startState };
  originLat = config.lat;
  originLon = config.lon;
  originAltitudeFt = config.altitudeFt;
  initialHeadingDeg = config.headingDeg;
  initialSpeedKt = config.groundspeedKt;
}

function refreshOriginAndConverters() {
  if (!map) return null;
  const originAltitudeMetersAbsolute = originAltitudeFt * FT_TO_M;
  originMercator = mapboxgl.MercatorCoordinate.fromLngLat(
    [originLon, originLat],
    originAltitudeMetersAbsolute
  );
  meterScale = originMercator.meterInMercatorCoordinateUnits();
  localToLatLon = (localX, localY, localZ) => {
    const mercatorX = originMercator.x + localX * meterScale;
    const mercatorY = originMercator.y + localY * meterScale;
    const mercatorZ = originMercator.z + localZ * meterScale;
    const mercatorCoord = new mapboxgl.MercatorCoordinate(mercatorX, mercatorY, mercatorZ);
    const lngLat = mercatorCoord.toLngLat();
    return [lngLat.lng, lngLat.lat];
  };
  if (aircraftLayer) {
    aircraftLayer.originMercator = originMercator;
    aircraftLayer.scale = meterScale;
  }
  currentOriginAltitudeMeters = originAltitudeMetersAbsolute;
  return originAltitudeMetersAbsolute;
}

function resetSimulationFromConfig() {
  const originAltitudeMetersAbsolute = refreshOriginAndConverters();
  if (!sim.value || !map || originAltitudeMetersAbsolute === null) {
    return false;
  }
  if (sim.value.updateOriginAltitude) {
    sim.value.updateOriginAltitude(originAltitudeMetersAbsolute);
  }
  sim.value.reset();
  sim.value.setSpeed(initialSpeedKt);
  sim.value.setHeading(initialHeadingDeg);
  map.setCenter([originLon, originLat]);
  aircraftLayer?.updatePosition?.(0, 0, 0, initialHeadingDeg, 0, 0);
  return true;
}

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
    if (pendingStartState) {
      applyStartStateConfig(pendingStartState);
    }

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

    const originAltitudeMetersAbsolute = refreshOriginAndConverters();

    // Create Three.js layer with local coordinates
    aircraftLayer = createAircraftThreeLayer({
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
        'line-color': '#FF7F0E',
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

    // Cache sources to avoid repeated lookups
    const trailSource = map.getSource('aircraft-trail');
    const shadowSource = map.getSource('aircraft-shadow');
    
    // Performance optimization: throttle updates for expensive operations
    let lastTrailUpdate = 0;
    let lastShadowUpdate = 0;

    // Start at origin altitude (z=0 relative to origin)
    const initialAltitudeMetersRelative = 0;
    
    // Create sim that works in local coordinates
    sim.value = useAircraftSimulation({
      initialHeadingDeg,
      initialAltitudeMeters: initialAltitudeMetersRelative, // Relative to origin (0 = at origin altitude)
      originAltitudeMeters: currentOriginAltitudeMeters, // Pass origin altitude for absolute target conversion
      initialSpeedKt,
      onUpdate: (localState) => {
        const now = performance.now();

        // Update shared sim state

        // Calculate vertical speed from pitch
        const pitchRad = toRadians(localState.pitchAngleDeg || 0);
        const verticalSpeedMps = localState.speedMps * Math.sin(pitchRad);
        const verticalSpeedFpm = verticalSpeedMps * MPS_TO_FPM;

        const [currentLng, currentLat] = localToLatLon
          ? localToLatLon(localState.x, localState.y, localState.z)
          : [originLon, originLat];

        simState.value = {
          ...simState.value,
          altitudeFt: Math.round((currentOriginAltitudeMeters + localState.z) * M_TO_FT),
          headingDeg: localState.headingDeg,
          speedKt: Math.round(localState.speedMps * MPS_TO_KT),
          vsFpm: Math.round(verticalSpeedFpm),
          lat: currentLat,
          lon: currentLng,
        };

        // Update targets from sim
        const targets = sim.value.getTargets();
        simState.value.targetHeadingDeg = targets.headingDeg;
        simState.value.targetAltitudeFt = targets.altitudeFt;
        simState.value.targetSpeedKt = targets.speedKt;
        simState.value.verticalSpeedLimitFpm = targets.verticalSpeedLimitFpm;

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
          map.setCenter([currentLng, currentLat]);
        }

        // Throttle trail updates
        if (now - lastTrailUpdate >= TRAIL_UPDATE_INTERVAL && localState.positionHistory?.length > 1) {
          lastTrailUpdate = now;
          
          const coordinates = [];
          const elevations = [];
          const zOffset = isTopDownView ? 0 : currentOriginAltitudeMeters;
          for (const point of localState.positionHistory) {
            coordinates.push(localToLatLon(point.x, point.y, point.z));
            elevations.push(zOffset + point.z);
          }

          trailSource.setData({
            type: 'Feature',
            properties: { elevation: elevations },
            geometry: { type: 'LineString', coordinates },
          });
        }

        // Throttle shadow updates
        if (now - lastShadowUpdate >= SHADOW_UPDATE_INTERVAL) {
          lastShadowUpdate = now;

          const headingRad = toRadians(localState.headingDeg);
          const { nose, left, right } = computeShadowVertices(localState.x, localState.y, headingRad);

          const noseCoord = localToLatLon(nose[0], nose[1], SHADOW_ELEVATION);
          const leftCoord = localToLatLon(left[0], left[1], SHADOW_ELEVATION);
          const rightCoord = localToLatLon(right[0], right[1], SHADOW_ELEVATION);

          shadowSource.setData({
            type: 'Feature',
            properties: {
              heading: Math.round((localState.headingDeg + 360) % 360),
              elevation: currentOriginAltitudeMeters + SHADOW_ELEVATION,
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[noseCoord, leftCoord, rightCoord, noseCoord]],
            },
          });
        }
      },
    });

    const hadPendingState = Boolean(pendingStartState);
    if (resetSimulationFromConfig() && hadPendingState) {
      pendingStartState = null;
    }

    // Don't start simulation by default (paused for testing)
    // sim.value.start();
    // Navigation controls removed - using custom controls in App.vue

    // Track camera pitch to detect top-down view
    const updateTopDownState = () => {
      isTopDownView = Math.abs(map.getPitch()) < PITCH_THRESHOLD;
    };

    // Throttle pitch updates
    let pitchUpdateTimeout = null;
    const throttledUpdateTopDown = () => {
      if (pitchUpdateTimeout) return;
      pitchUpdateTimeout = setTimeout(() => {
        updateTopDownState();
        pitchUpdateTimeout = null;
      }, PITCH_UPDATE_THROTTLE);
    };

    map.on('pitch', throttledUpdateTopDown);
    map.on('move', throttledUpdateTopDown);
    
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
    
    updateTopDownState();

    // Keyboard controls for aircraft
    const pressedKeys = new Set();

    const CONTROL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'a', 'A', 'd', 'D', 'w', 'W', 's', 'S']);
    const isControlKey = (key) => CONTROL_KEYS.has(key);
    const shouldIgnore = (event) =>
      event.ctrlKey || event.altKey || event.metaKey ||
      event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA';

    function handleKeyDown(event) {
      if (shouldIgnore(event)) return;
      
      if (isControlKey(event.key)) {
        event.preventDefault();
        event.stopPropagation();
      }
      pressedKeys.add(event.key);
      updateControls();
    }

    function handleKeyUp(event) {
      if (shouldIgnore(event)) return;
      
      if (isControlKey(event.key)) {
        event.preventDefault();
        event.stopPropagation();
      }
      pressedKeys.delete(event.key);
      updateControls();
    }

    // Cache last control values to avoid unnecessary updates
    let lastSpeedInput = 0;
    let lastTurnInput = 0;
    let lastPitchInput = 0;

    const hasKey = (key) => pressedKeys.has(key) || pressedKeys.has(key.toUpperCase());

    function updateControls() {
      if (!sim.value) return;

      const speedInput = Number(hasKey('ArrowUp')) - Number(hasKey('ArrowDown'));
      const turnInput = Number(hasKey('d')) - Number(hasKey('a'));
      const pitchInput = Number(hasKey('s')) - Number(hasKey('w'));

      if (speedInput !== lastSpeedInput || turnInput !== lastTurnInput || pitchInput !== lastPitchInput) {
        sim.value.setControls({ speed: speedInput, turn: turnInput, pitch: pitchInput });
        lastSpeedInput = speedInput;
        lastTurnInput = turnInput;
        lastPitchInput = pitchInput;
      }
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

// Expose map and sim for external control
defineExpose({
  map,
  get sim() {
    return sim.value;
  },
  get isFollowing() {
    return isFollowing.value;
  },
  get isRunning() {
    return sim.value ? sim.value.isRunning : false;
  },
  start() {
    if (sim.value) sim.value.start();
  },
  pause() {
    if (sim.value) sim.value.stop();
  },
  togglePause() {
    if (!sim.value) return;
    if (sim.value.isRunning) {
      sim.value.stop();
    } else {
      sim.value.start();
    }
  },
  toggleFollow() {
    isFollowing.value = !isFollowing.value;
  },
  centerOnAircraft() {
    if (sim.value && map) {
      const state = sim.value.getState();
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
  initializeFromScenario(startState) {
    if (!startState) return;

    applyStartStateConfig(startState);
    pendingStartState = { ...defaultStartState, ...startState };

    if (!map || !sim.value) return;

    const wasRunning = sim.value.isRunning;
    if (resetSimulationFromConfig()) {
      pendingStartState = null;
      if (wasRunning) {
        sim.value.start();
      } else {
        sim.value.stop();
      }
    }
  },
  reset() {
    if (!sim.value || !map) return;
    
    // Reset simulation to current config
    const wasRunning = sim.value.isRunning;
    resetSimulationFromConfig();
    if (wasRunning) {
      sim.value.start();
    }

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
      const headingRad = toRadians(initialHeadingDeg);
      const { nose, left, right } = computeShadowVertices(0, 0, headingRad);

      const noseCoord = localToLatLon(nose[0], nose[1], SHADOW_ELEVATION);
      const leftCoord = localToLatLon(left[0], left[1], SHADOW_ELEVATION);
      const rightCoord = localToLatLon(right[0], right[1], SHADOW_ELEVATION);
      
      shadowSrc.setData({
        type: 'Feature',
        properties: {
          heading: ((initialHeadingDeg % 360) + 360) % 360,
          elevation: originAltitudeFt * FT_TO_M + SHADOW_ELEVATION,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[noseCoord, leftCoord, rightCoord, noseCoord]],
        },
      });
    }
    
    // Reset aircraft position in Three.js
    aircraftLayer?.updatePosition?.(0, 0, 0, initialHeadingDeg, 0, 0);
    
    // Reset map camera to initial position
    map.setCenter([originLon, originLat]);
    
    // Restart simulation
    sim.value.start();
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

  if (sim.value) {
    sim.value.stop();
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

/* Hide Mapbox logo and attribution */
:deep(.mapboxgl-ctrl-logo) {
  display: none !important;
}

:deep(.mapboxgl-ctrl-attrib) {
  display: none !important;
}
</style>