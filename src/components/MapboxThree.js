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
  // Helper function for degree-to-radian conversion
  const DEG_TO_RAD = Math.PI / 180;
  const toRadians = (deg) => deg * DEG_TO_RAD;

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

      // Add directional light (from above - positive Z is up in this coordinate system)
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
      directionalLight.position.set(10000, -6000000, 10000).normalize();
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
        alpha: true,
        preserveDrawingBuffer: false,
      });

      this.renderer.autoClear = false;
      // Use device pixel ratio but cap at 2 for performance
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.renderer.toneMapping = THREE.NoToneMapping;
      // Disable shadow maps for better performance
      this.renderer.shadowMap.enabled = false;

      // Load GLB model
      const loader = new GLTFLoader();
      loader.load(
        modelPath,
        (gltf) => {
          this.aircraft = gltf.scene;

          // Configure textures and materials for better rendering
          gltf.scene.traverse((child) => {
            if (child.isMesh) {
              // Configure materials
              if (child.material) {
                // Handle both single material and material arrays
                const materials = Array.isArray(child.material) 
                  ? child.material 
                  : [child.material];

                materials.forEach((material) => {
                  // Enable proper rendering
                  material.needsUpdate = true;
                  
                  // Configure texture filtering if textures exist
                  if (material.map) {
                    material.map.minFilter = THREE.LinearMipmapLinearFilter;
                    material.map.magFilter = THREE.LinearFilter;
                    material.map.generateMipmaps = true;
                    material.map.needsUpdate = true;
                  }
                  
                  // Set material properties for better rendering
                  material.side = THREE.DoubleSide;
                  material.flatShading = false;
                  
                  // Ensure proper encoding
                  if (material.map) {
                    material.map.encoding = THREE.sRGBEncoding;
                  }
                });
              }

              // Ensure geometry is properly configured
              if (child.geometry) {
                child.geometry.computeVertexNormals();
              }
            }
          });

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

      // Skip rendering when camera is in top-down view (pitch close to 0)
      const pitch = this.map.getPitch();
      if (Math.abs(pitch) < 5) {
        return; // Don't render aircraft in top-down view
      }

      // Update renderer size to match canvas (only when changed)
      const canvas = this.map.getCanvas();
      const width = canvas.width;
      const height = canvas.height;
      if (this.renderer.domElement.width !== width || this.renderer.domElement.height !== height) {
        this.renderer.setSize(width, height, false);
      }

      // Reuse matrix object if possible to reduce allocations
      if (!this._tempMatrix) {
        this._tempMatrix = new THREE.Matrix4();
      }
      this._tempMatrix.fromArray(matrix);
      this.camera.projectionMatrix = this._tempMatrix;

      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      // Only trigger repaint if needed (Mapbox will handle most cases)
    },

    /**
     * Update aircraft position using local coordinates (meters)
     * @param {number} x - East position in meters (relative to origin)
     * @param {number} y - North position in meters (relative to origin)
     * @param {number} z - Altitude in meters
     * @param {number} headingDeg - Heading in degrees
     * @param {number} bankAngleDeg - Bank angle in degrees (positive = right wing down)
     * @param {number} pitchAngleDeg - Pitch angle in degrees (positive = nose up)
     */
    updatePosition: function (x, y, z, headingDeg, bankAngleDeg = 0, pitchAngleDeg = 0) {
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

      // Update heading, pitch, and bank angle
      // Rotation order: pitch (X), yaw (Y), roll (Z)
      // Pitch: -90° to make aircraft horizontal, plus pitch angle (positive = nose up)
      // Yaw: heading rotation
      // Roll: bank angle (positive = right wing down)
      const headingRad = toRadians(headingDeg);
      const bankAngleRad = toRadians(bankAngleDeg);
      const pitchAngleRad = toRadians(pitchAngleDeg);
      this.aircraftGroup.rotation.set(-Math.PI / 2 + pitchAngleRad, headingRad, bankAngleRad);

      // Trigger repaint
      this.map.triggerRepaint();
    },
  };

  return layer;
}

