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
let isTopDownView = false;

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

    // Create GeoJSON source for aircraft label
    map.addSource('aircraft-label', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {
          heading: 0,
          speed: 0,
          altitude: 0,
          elevation: originAltitudeMeters,
        },
        geometry: {
          type: 'Point',
          coordinates: [originLon, originLat],
        },
      },
    });

    // Add symbol layer for aircraft label with formatted text
    map.addLayer({
      id: 'aircraft-label-layer',
      type: 'symbol',
      source: 'aircraft-label',
      layout: {
        'text-field': [
          'format',
          ['get', 'heading'],
          { 'font-scale': 1.0 },
          '°|',
          {},
          ['get', 'speed'],
          { 'font-scale': 1.0 },
          'kt|',
          {},
          ['get', 'altitude'],
          { 'font-scale': 1.0 },
          'ft',
        ],
        'text-size': 14,
        'text-anchor': 'center',
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': '#000000'
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
            // Elevation: use ground level (0) when in top-down view, otherwise use actual altitude
            const elevation = isTopDownView ? 0 : originAltitudeMeters + point.z;
            elevations.push(elevation);
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

        // Update aircraft label with heading, speed, and altitude
        // Convert speed from m/s to knots (1 m/s ≈ 1.944 knots)
        // Convert altitude from meters to feet (1 m = 3.28084 ft)
        const speedKt = Math.round(localState.speedMps * 1.944);
        const altitudeFt = Math.round((originAltitudeMeters + localState.z) * 3.28084);
        const headingDeg = Math.round(localState.headingDeg);

        // Position label above aircraft (offset upward by ~50 meters)
        // Offset to northeast by 100 meters in each direction
        const labelAltitude = localState.z + 50;
        const absoluteLabelAltitude = originAltitudeMeters + labelAltitude;
        const labelX = localState.x + 400; // 100 meters east
        const labelY = localState.y - 200; // 100 meters north
        const [labelLng, labelLat] = localToLatLon(
          labelX,
          labelY,
          labelAltitude
        );

        const labelSource = map.getSource('aircraft-label');
        if (labelSource) {
          labelSource.setData({
            type: 'Feature',
            properties: {
              heading: headingDeg,
              speed: speedKt,
              altitude: altitudeFt,
              elevation: absoluteLabelAltitude,
            },
            geometry: {
              type: 'Point',
              coordinates: [labelLng, labelLat],
            },
          });
        }

        // Update aircraft shadow triangle
        // Triangle points forward (in heading direction) with shape like aircraft silhouette
        // Triangle dimensions: ~30m long, ~20m wide at base
        const triangleLength = 300; // meters (forward direction)
        const triangleWidth = 200; // meters (perpendicular to heading)
        const headingRad = (localState.headingDeg * Math.PI) / 180;

        // Calculate triangle vertices in local coordinates
        // Center point (aircraft position projected to ground)
        const centerX = localState.x;
        const centerY = localState.y;

        // Forward point (nose of triangle)
        const noseX = centerX + Math.sin(headingRad) * triangleLength;
        const noseY = centerY + Math.cos(headingRad) * triangleLength;

        // Left wing point (perpendicular to heading, left side)
        const leftX = centerX - Math.sin(headingRad) * (triangleLength * 0.3) - Math.cos(headingRad) * (triangleWidth / 2);
        const leftY = centerY - Math.cos(headingRad) * (triangleLength * 0.3) + Math.sin(headingRad) * (triangleWidth / 2);

        // Right wing point (perpendicular to heading, right side)
        const rightX = centerX - Math.sin(headingRad) * (triangleLength * 0.3) + Math.cos(headingRad) * (triangleWidth / 2);
        const rightY = centerY - Math.cos(headingRad) * (triangleLength * 0.3) - Math.sin(headingRad) * (triangleWidth / 2);

        // Convert triangle vertices to lat/lon (slightly above ground level, z = 0.1m to render above trail)
        const shadowElevation = 0.1; // Small offset to ensure shadow renders above trail
        const [noseLng, noseLat] = localToLatLon(noseX, noseY, shadowElevation);
        const [leftLng, leftLat] = localToLatLon(leftX, leftY, shadowElevation);
        const [rightLng, rightLat] = localToLatLon(rightX, rightY, shadowElevation);

        const shadowSource = map.getSource('aircraft-shadow');
        if (shadowSource) {
          shadowSource.setData({
            type: 'Feature',
            properties: {
              heading: headingDeg,
              elevation: originAltitudeMeters + shadowElevation,
            },
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

    // Add navigation controls (visualizePitch enables 2D/3D toggle)
    map.addControl(
      new mapboxgl.NavigationControl({
        visualizePitch: true,
        showCompass: true,
        showZoom: true,
      })
    );

    // Track camera pitch to detect top-down view
    function updateTopDownState() {
      const pitch = map.getPitch();
      // Consider top-down when pitch is very close to 0 (within 5 degrees)
      isTopDownView = Math.abs(pitch) < 5;
      // Trail will update on next frame automatically with new elevation
    }

    // Listen for pitch changes (when user clicks north-south button or drags)
    map.on('pitch', updateTopDownState);
    map.on('move', updateTopDownState);
    
    // Initialize state
    updateTopDownState();

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