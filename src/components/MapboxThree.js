import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import mapboxgl from 'mapbox-gl';

/**
 * Creates a Three.js custom layer for Mapbox to display an aircraft GLB model
 * All position updates use local coordinates (meters relative to origin)
 * @param {Object} options - Configuration options
 * @param {mapboxgl.MercatorCoordinate} options.originMercator - Origin point in Mercator coordinates
 * @param {number} options.scale - Scale factor from origin (meterInMercatorCoordinateUnits)
 * @param {number} options.initialX - Initial x position in meters (east, default: 0)
 * @param {number} options.initialY - Initial y position in meters (north, default: 0)
 * @param {number} options.initialZ - Initial z position in meters (altitude, default: 0)
 * @param {number} options.headingDeg - Initial heading in degrees (default: 0)
 * @param {string} options.modelPath - Path to GLB model (default: '/Airplane.glb')
 * @returns {Object} Mapbox custom layer object
 */
export function createAircraftLayer({
  originMercator,
  scale,
  initialX = 0,
  initialY = 0,
  initialZ = 0,
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

      // Store origin and scale for coordinate conversion
      this.originMercator = originMercator;
      this.scale = scale;

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

          // Model origin is at right engine, offset to center the model
          // Create parent group to hold offset (in model-local space, rotates with aircraft)
          // x = right (east), y = forward (north), z = up
          // Right engine is to the right of center, so offset left (negative x)
          const modelOriginOffsetX = -50; // Offset left to center (meters, adjust as needed)
          const modelOriginOffsetY = 0; // No fore/aft offset if model is centered
          const modelOriginOffsetZ = 0; // No vertical offset
          
          // Create parent group for offset
          this.aircraftGroup = new THREE.Group();
          this.aircraftGroup.add(this.aircraft);
          
          // Apply offset in model-local space (will rotate with aircraft heading)
          this.aircraft.position.set(
            modelOriginOffsetX * this.scale,
            modelOriginOffsetY * this.scale,
            modelOriginOffsetZ * this.scale
          );

          // Get scale factor for proper sizing
          this.aircraft.scale.set(this.scale, -this.scale, this.scale);

          // Add group to scene (position and rotate the group, not the aircraft)
          this.scene.add(this.aircraftGroup);

          // Set initial position using local coordinates
          this.updatePosition(initialX, initialY, initialZ, headingDeg);
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
      if (!this.aircraftGroup) {
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

    /**
     * Update aircraft position using local coordinates (meters)
     * @param {number} x - East position in meters (relative to origin)
     * @param {number} y - North position in meters (relative to origin)
     * @param {number} z - Altitude in meters
     * @param {number} headingDeg - Heading in degrees
     */
    updatePosition: function (x, y, z, headingDeg) {
      if (!this.aircraftGroup) {
        return; // Aircraft not loaded yet
      }

      // Convert local coordinates (meters) to Mercator coordinates
      // x = east (meters), y = north (meters), z = altitude (meters)
      const mercatorX = this.originMercator.x + x * this.scale;
      const mercatorY = this.originMercator.y + y * this.scale;
      const mercatorZ = this.originMercator.z + z * this.scale;

      // Update position in Mercator space (position the group, not the aircraft)
      this.aircraftGroup.position.set(mercatorX, mercatorY, mercatorZ);

      // Update heading (rotate the group, not the aircraft)
      const headingRad = (headingDeg * Math.PI) / 180;
      this.aircraftGroup.rotation.set(-Math.PI / 2, headingRad, 0);

      // Trigger repaint
      this.map.triggerRepaint();
    },
  };

  return layer;
}

