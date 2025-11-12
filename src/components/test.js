import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import mapboxgl from 'mapbox-gl';

/**
 * Simple test layer to display airplane.glb at default location
 * Adds pitch/roll-only test controls (W/S = pitch, A/D = roll)
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

      // Ambient light
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
      this.scene.add(ambientLight);

      this.aircraft = null;
      this.map = map;

      // Renderer
      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
        alpha: true,
      });
      this.renderer.autoClear = false;
      this.renderer.sortObjects = false;

      // INPUT STATE: pitch/roll rates (rad/s)
      this.pitchRate = 0;
      this.rollRate = 0;

      // Base and boosted rates
      this.baseRate = 0.8; // rad/s
      this.boostRate = 1.6; // rad/s when Shift held
      this.shiftHeld = false;

      // Time accumulator
      this._lastT = 0;

      // Temporary objects (avoid GC)
      this._tmpQuat = new THREE.Quaternion();

      // Key handlers
      this._onKeyDown = (e) => {
        const rate = this.shiftHeld ? this.boostRate : this.baseRate;
        switch (e.code) {
          case 'KeyW': // pitch up (nose up) about local X
            this.pitchRate = +rate;
            break;
          case 'KeyS': // pitch down (nose down)
            this.pitchRate = -rate;
            break;
          case 'KeyA': // roll left about local Z (left wing down = negative roll)
            this.rollRate = -rate;
            break;
          case 'KeyD': // roll right
            this.rollRate = +rate;
            break;
          case 'ShiftLeft':
          case 'ShiftRight':
            if (!this.shiftHeld) {
              this.shiftHeld = true;
              // update active signs with new magnitude
              if (this.pitchRate !== 0) {
                this.pitchRate = Math.sign(this.pitchRate) * this.boostRate;
              }
              if (this.rollRate !== 0) {
                this.rollRate = Math.sign(this.rollRate) * this.boostRate;
              }
            }
            break;
        }
      };

      this._onKeyUp = (e) => {
        switch (e.code) {
          case 'KeyW':
          case 'KeyS':
            this.pitchRate = 0;
            break;
          case 'KeyA':
          case 'KeyD':
            this.rollRate = 0;
            break;
          case 'ShiftLeft':
          case 'ShiftRight':
            this.shiftHeld = false;
            // downgrade active signs to base
            if (this.pitchRate !== 0) {
              this.pitchRate = Math.sign(this.pitchRate) * this.baseRate;
            }
            if (this.rollRate !== 0) {
              this.rollRate = Math.sign(this.rollRate) * this.baseRate;
            }
            break;
        }
      };

      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);

      // Load airplane model
      const loader = new GLTFLoader();
      loader.load(
        '/Airplane.glb',
        (gltf) => {
          this.aircraft = gltf.scene;

          // NOTE: Negative Y scale mirrors the model; keep if needed for Mapbox coord alignment
          this.aircraft.scale.set(meterScale, meterScale, meterScale);

          // Position at origin (local (0,0,0) == default location)
          const mercatorX = originMercator.x;
          const mercatorY = originMercator.y;
          const mercatorZ = originMercator.z;
          this.aircraft.position.set(mercatorX, mercatorY, mercatorZ);

          // One-time initial attitude. Prefer quaternion setup.
          // Adjust this to match your model so that:
          // -X or +X is not assumed forward; glTF typically uses -Z as forward.
          // Here we mimic your old Euler: (-90° around X, 180° around Y)
          this.aircraft.quaternion
            .setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0, 'ZXY'))
            .normalize();

          // Axes helpers
          const axesHelper = new THREE.AxesHelper(1000);
          this.aircraft.add(axesHelper);
          this.axesHelper = axesHelper;

          const sceneAxesHelper = new THREE.AxesHelper(1000 * meterScale);
          sceneAxesHelper.position.set(
            mercatorX + 500 * meterScale,
            mercatorY,
            mercatorZ
          );
          this.scene.add(sceneAxesHelper);
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
      if (!this.aircraft) return;

      // Resize renderer to canvas
      const canvas = this.map.getCanvas();
      const width = canvas.width;
      const height = canvas.height;
      if (
        this.renderer.domElement.width !== width ||
        this.renderer.domElement.height !== height
      ) {
        this.renderer.setSize(width, height, false);
      }

      // Set camera projection from Mapbox
      if (!this._tempMatrix) this._tempMatrix = new THREE.Matrix4();
      this._tempMatrix.fromArray(matrix);
      this.camera.projectionMatrix = this._tempMatrix;

      // dt
      const now = performance.now();
      if (this._lastT === 0) this._lastT = now;
      const dt = Math.min((now - this._lastT) / 1000, 0.05);
      this._lastT = now;

      // Apply pitch and roll only (LOCAL axes).
      // No yaw is applied anywhere in this loop.
      if (this.pitchRate !== 0) {
        // Local X axis rotation (pitch)
        this.aircraft.rotateX(this.pitchRate * dt);
      }
      if (this.rollRate !== 0) {
        // Local Z axis rotation (roll)
        this.aircraft.rotateZ(this.rollRate * dt);
      }

      // Keep quaternion well-conditioned in case of long runs
      this.aircraft.quaternion.normalize();

      // Render
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
    },

    onRemove: function () {
      // Clean up listeners
      window.removeEventListener('keydown', this._onKeyDown);
      window.removeEventListener('keyup', this._onKeyUp);
    },
  };

  return layer;
}