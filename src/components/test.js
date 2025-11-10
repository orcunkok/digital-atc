import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import mapboxgl from 'mapbox-gl';

/**
 * Simple test layer to display airplane.glb at default location
 * Hardcoded position, minimal lighting, basic rendering
 */
export function createTestAircraftLayer(map) {
  // Hardcoded default location
  const defaultLat = 37.7148;
  const defaultLon = -122.2152;
  const defaultAltitudeFt = 400;
  const FT_TO_M = 0.3048;
  const defaultAltitudeM = defaultAltitudeFt * FT_TO_M;

  // Convert to Mercator coordinates
  const originMercator = mapboxgl.MercatorCoordinate.fromLngLat(
    [defaultLon, defaultLat],
    defaultAltitudeM
  );
  const meterScale = originMercator.meterInMercatorCoordinateUnits();

  const layer = {
    id: 'test-aircraft-layer',
    type: 'custom',
    renderingMode: '3d',
    onAdd: function (map, gl) {
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();

      // Basic ambient light only
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
      this.scene.add(ambientLight);

      this.aircraft = null;
      this.map = map;

      // Basic renderer setup
      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
        alpha: true,
      });

      this.renderer.autoClear = false;
      // Enable rendering of helpers
      this.renderer.sortObjects = false;

      // Load airplane model
      const loader = new GLTFLoader();
      loader.load(
        '/Airplane.glb',
        (gltf) => {
          this.aircraft = gltf.scene;

          // Basic scale - adjust as needed
          this.aircraft.scale.set(meterScale, -meterScale, meterScale);

          // Position at origin (0, 0, 0 in local coordinates = default location)
          const mercatorX = originMercator.x;
          const mercatorY = originMercator.y;
          const mercatorZ = originMercator.z;

          this.aircraft.position.set(mercatorX, mercatorY, mercatorZ);

          // Basic rotation to face north
          this.aircraft.rotation.set(-Math.PI / 2, 0, 0);
          this.aircraft.rotation.set(-Math.PI / 2, Math.PI, 0);

          // Add axes helper to visualize airplane orientation
          // Red = X (east), Green = Y (north), Blue = Z (up)
          // Add as child of aircraft so it rotates with it
          // Size in local space (before aircraft scaling) - use a large value
          // Since aircraft is scaled by meterScale, we need axes to be large enough
          // 1000 units in local space will be 1000 * meterScale in world space
          const axesHelper = new THREE.AxesHelper(1000); // Large size in local space
          this.aircraft.add(axesHelper);
          
          // Store reference for render check
          this.axesHelper = axesHelper;

          // Add scene axes helper to the right of the plane (east/X direction)
          // Position it 500 meters to the right (east) of the aircraft
          const offsetEastMeters = 500; // 500 meters to the right
          const sceneAxesHelper = new THREE.AxesHelper(1000 * meterScale); // Size in world space
          sceneAxesHelper.position.set(
            mercatorX + offsetEastMeters * meterScale, // East (right)
            mercatorY, // North (same as aircraft)
            mercatorZ  // Up (same altitude)
          );
          // No rotation - shows world/scene coordinates
          this.scene.add(sceneAxesHelper);
          
          // Store reference
          this.sceneAxesHelper = sceneAxesHelper;

          this.scene.add(this.aircraft);
          map.triggerRepaint();
        },
        undefined,
        (error) => {
          console.error('Error loading test aircraft model:', error);
        }
      );
    },

    render: function (gl, matrix) {
      if (!this.aircraft) {
        return; // Don't render until model is loaded
      }

      // Update renderer size
      const canvas = this.map.getCanvas();
      const width = canvas.width;
      const height = canvas.height;
      if (this.renderer.domElement.width !== width || this.renderer.domElement.height !== height) {
        this.renderer.setSize(width, height, false);
      }

      // Set camera projection matrix
      if (!this._tempMatrix) {
        this._tempMatrix = new THREE.Matrix4();
      }
      this._tempMatrix.fromArray(matrix);
      this.camera.projectionMatrix = this._tempMatrix;

      // Basic render
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
    },
  };

  return layer;
}

