import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import mapboxgl from 'mapbox-gl';

/**
 * Creates a Three.js custom layer for Mapbox to display an aircraft GLB model
 * @param {Object} options - Configuration options
 * @param {number} options.lat - Latitude of aircraft position
 * @param {number} options.lon - Longitude of aircraft position
 * @param {number} options.altitudeMeters - Altitude in meters
 * @param {number} options.headingDeg - Heading in degrees (default: 0)
 * @param {string} options.modelPath - Path to GLB model (default: '/Airplane.glb')
 * @returns {Object} Mapbox custom layer object
 */
export function createAircraftLayer({
  lat,
  lon,
  altitudeMeters,
  headingDeg = 0,
  modelPath = '/Airplane.glb',
}) {
  const layer = {
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
        modelPath,
        (gltf) => {
          this.aircraft = gltf.scene;

          // Convert lat/lon/altitude to Mercator coordinates
          const mercatorCoord = mapboxgl.MercatorCoordinate.fromLngLat(
            [lon, lat],
            altitudeMeters
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
          const initialHeadingRad = (headingDeg * Math.PI) / 180;
          this.aircraft.rotation.set(
            -Math.PI / 2,
            Math.PI - initialHeadingRad,
            0
          );

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

    // Method to update aircraft position and heading
    updatePosition: function (newLat, newLon, newAltitudeMeters, newHeadingDeg) {
      if (!this.aircraft) {
        return; // Aircraft not loaded yet
      }

      // Convert lat/lon/altitude to Mercator coordinates
      const mercatorCoord = mapboxgl.MercatorCoordinate.fromLngLat(
        [newLon, newLat],
        newAltitudeMeters
      );

      // Update position
      this.aircraft.position.set(
        mercatorCoord.x,
        mercatorCoord.y,
        mercatorCoord.z
      );

      // Update heading
      const headingRad = (newHeadingDeg * Math.PI) / 180;
      this.aircraft.rotation.set(-Math.PI / 2, Math.PI - headingRad, 0);

      // Trigger repaint
      this.map.triggerRepaint();
    },
  };

  return layer;
}

