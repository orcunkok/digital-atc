import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import mapboxgl from 'mapbox-gl';

// Precomputed constants
const DEG_TO_RAD = Math.PI / 180;
const PI_OVER_2 = Math.PI / 2;
const PI = Math.PI;
const PITCH_THRESHOLD = 5;
const MODEL_ORIGIN_OFFSET_X = -50; /// aircraft X offset - east correction
const HELICOPTER_ORIGIN_OFFSET_X = 930; // helicopter X offset - east correction
const HELICOPTER_ORIGIN_OFFSET_Z = 170; // helicopter Y offset - north correction
const EULER_ORDER = 'ZXY';

const toRadians = (deg) => deg * DEG_TO_RAD;

/**
 * Sets up materials and textures for a Three.js mesh
 * @param {THREE.Object3D} mesh - The mesh to process
 */
function setupMeshMaterials(mesh) {
  mesh.traverse((child) => {
    if (child.isMesh) {
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      materials.forEach((mat) => {
        if (!mat) return;
        mat.needsUpdate = true;
        if (mat.map) {
          mat.map.minFilter = THREE.LinearMipmapLinearFilter;
          mat.map.magFilter = THREE.LinearFilter;
          mat.map.generateMipmaps = true;
          mat.map.encoding = THREE.sRGBEncoding;
          mat.map.needsUpdate = true;
        }
        mat.side = THREE.DoubleSide;
        mat.flatShading = false;
      });
      if (child.geometry) child.geometry.computeVertexNormals();
    }
  });
}

/**
 * Loads and sets up an aircraft model
 * @param {string} modelPath - Path to GLB model
 * @param {string} modelType - 'airplane' or 'helicopter'
 * @param {boolean} clone - Whether to clone the scene (for multiple instances)
 * @param {Function} onLoad - Callback with (mesh, modelType)
 * @param {Function} onError - Error callback
 */
function loadAircraftModel(modelPath, modelType, clone, onLoad, onError) {
  const loader = new GLTFLoader();
  loader.load(
    modelPath,
    (gltf) => {
      const mesh = clone ? gltf.scene.clone() : gltf.scene;
      setupMeshMaterials(mesh);

      // Offset mesh to align model origin (different per model type)
      const offsetX = modelType === 'helicopter' ? HELICOPTER_ORIGIN_OFFSET_X : MODEL_ORIGIN_OFFSET_X;
      const offsetZ = modelType === 'helicopter' ? HELICOPTER_ORIGIN_OFFSET_Z : 0;
      mesh.position.set(offsetX, 0, offsetZ);

      onLoad(mesh, modelType);
    },
    undefined,
    onError || ((err) => console.error('Error loading aircraft model:', err))
  );
}

/**
 * Creates aircraft Three.js node hierarchy
 * @param {number} scale - Scale factor
 * @param {string} modelType - 'airplane' or 'helicopter'
 * @returns {Object} Hierarchy nodes
 */
function createAircraftHierarchy(scale, modelType = 'airplane') {
  const aircraftRoot = new THREE.Group();
  const headingNode = new THREE.Group();
  const modelFix = new THREE.Group();
  const attitude = new THREE.Group();

  headingNode.add(modelFix);
  modelFix.add(attitude);
  aircraftRoot.add(headingNode);

  aircraftRoot.scale.set(scale, -scale, scale);
  
  // Different rotation for helicopter (180 degrees correction)
  if (modelType === 'helicopter') {
    modelFix.rotation.set(PI_OVER_2, 0, 0); // No PI rotation for helicopter
  } else {
    modelFix.rotation.set(PI_OVER_2, PI, 0); // Airplane rotation
  }

  return { aircraftRoot, headingNode, modelFix, attitude };
}

/**
 * Updates aircraft position and rotation
 */
function updateAircraftTransform({
  aircraftRoot,
  headingNode,
  attitude,
  angleCache,
  attEuler,
  originMercator,
  scale,
}, x, y, z, headingDeg, bankAngleDeg, pitchAngleDeg) {
  // Position in mercator meters
  const { x: ox, y: oy, z: oz } = originMercator;
  aircraftRoot.position.set(
    ox + x * scale,
    oy + y * scale,
    oz + z * scale
  );

  // Cache angles
  angleCache.headingDeg = headingDeg ?? angleCache.headingDeg;
  angleCache.bankDeg = bankAngleDeg ?? angleCache.bankDeg;
  angleCache.pitchDeg = pitchAngleDeg ?? angleCache.pitchDeg;

  // Apply yaw (heading) on headingNode
  headingNode.rotation.z = -toRadians(angleCache.headingDeg);

  // Apply pitch and roll on attitude (ZXY Euler order)
  attEuler.set(
    -toRadians(angleCache.pitchDeg),
    0,
    toRadians(angleCache.bankDeg)
  );
  attitude.quaternion.setFromEuler(attEuler).normalize();
}

/**
 * Creates a Three.js custom layer for Mapbox to display aircraft GLB models
 * Supports single aircraft (backward compatible) or multiple aircraft in one layer
 */
export function createAircraftThreeLayer({
  id = 'aircraft-3d-layer',
  originMercator,
  scale,
  initialX = 0,
  initialY = 0,
  initialZ = 0,
  headingDeg = 0,
  modelPath = '/Airplane.glb',
  skipInitialModel = false,
}) {
  const layer = {
    id,
    type: 'custom',
    renderingMode: '3d',

    onAdd: function (map, gl) {
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();

      this.originMercator = originMercator;
      this.scale = scale;
      this.map = map;

      const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
      dirLight.position.set(10000, -6000000, 10000).normalize();
      this.scene.add(dirLight);

      const ambient = new THREE.AmbientLight(0xffffff, 0.5);
      this.scene.add(ambient);

      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: false,
      });
      this.renderer.autoClear = false;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.renderer.shadowMap.enabled = false;

      // Initialize reusable objects to avoid GC pressure
      this._tempMatrix = new THREE.Matrix4();
      this._attEuler = new THREE.Euler(0, 0, 0, EULER_ORDER);

      // Store for multiple aircraft (for traffic layer)
      this.aircraftModels = new Map();

      // Skip initial model loading if requested (for traffic layer)
      if (skipInitialModel) {
        // Don't create single aircraft structure for traffic layer
        // It will only use multi-aircraft methods
        return;
      }

      // Node hierarchy: aircraftRoot -> headingNode -> modelFix -> attitude -> mesh
      const modelType = modelPath.includes('Helicopter') ? 'helicopter' : 'airplane';
      const hierarchy = createAircraftHierarchy(this.scale, modelType);
      this.aircraftRoot = hierarchy.aircraftRoot;
      this.headingNode = hierarchy.headingNode;
      this.modelFix = hierarchy.modelFix;
      this.attitude = hierarchy.attitude;
      this.scene.add(this.aircraftRoot);

      // Add axis helper for debugging (red=X, green=Y, blue=Z)
      const axesHelper = new THREE.AxesHelper(500);
      this.aircraftRoot.add(axesHelper);

      // State cache for absolute angles (degrees) - for single aircraft mode
      this._cachedHeadingDeg = headingDeg;
      this._cachedBankDeg = 0;
      this._cachedPitchDeg = 0;

      loadAircraftModel(
        modelPath,
        modelType,
        false, // Don't clone for single aircraft
        (mesh) => {
          this.mesh = mesh;
          this.attitude.add(this.mesh);
          this.updatePosition(initialX, initialY, initialZ, headingDeg, 0, 0);
          map.triggerRepaint();
        }
      );
    },

    render: function (gl, matrix) {
      // Render if we have single aircraft OR multiple aircraft
      const hasSingleAircraft = this.aircraftRoot;
      const hasMultipleAircraft = this.aircraftModels && this.aircraftModels.size > 0;
      if (!hasSingleAircraft && !hasMultipleAircraft) return;

      const pitchView = this.map.getPitch();
      if (Math.abs(pitchView) < PITCH_THRESHOLD) return;

      const canvas = this.map.getCanvas();
      const { width, height } = canvas;
      const rendererEl = this.renderer.domElement;
      if (rendererEl.width !== width || rendererEl.height !== height) {
        this.renderer.setSize(width, height, false);
      }

      this._tempMatrix.fromArray(matrix);
      this.camera.projectionMatrix = this._tempMatrix;

      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
    },

    updatePosition: function (
      x,
      y,
      z,
      headingDeg,
      bankAngleDeg = 0,
      pitchAngleDeg = 0
    ) {
      if (!this.aircraftRoot) return;

      const angleCache = {
        headingDeg: this._cachedHeadingDeg,
        bankDeg: this._cachedBankDeg,
        pitchDeg: this._cachedPitchDeg,
      };

      updateAircraftTransform(
        {
          aircraftRoot: this.aircraftRoot,
          headingNode: this.headingNode,
          attitude: this.attitude,
          angleCache,
          attEuler: this._attEuler,
          originMercator: this.originMercator,
          scale: this.scale,
        },
        x,
        y,
        z,
        headingDeg,
        bankAngleDeg,
        pitchAngleDeg
      );

      // Update cached angles from the cache object (mutated by updateAircraftTransform)
      this._cachedHeadingDeg = angleCache.headingDeg;
      this._cachedBankDeg = angleCache.bankDeg;
      this._cachedPitchDeg = angleCache.pitchDeg;

      this.map.triggerRepaint();
    },

    onRemove: function () {
      // Cleanup if needed
      this.aircraftModels?.clear();
    },

    // Multi-aircraft support methods
    addAircraftModel: function (aircraftId, config) {
      if (!this.scene || this.aircraftModels.has(aircraftId)) return;

      const {
        initialX = 0,
        initialY = 0,
        initialZ = 0,
        headingDeg = 0,
        modelPath = '/Airplane.glb',
      } = config;

      // Determine model type and create hierarchy
      const modelType = modelPath.includes('Helicopter') ? 'helicopter' : 'airplane';
      const { aircraftRoot, headingNode, modelFix, attitude } = createAircraftHierarchy(this.scale, modelType);
      this.scene.add(aircraftRoot);

      // Add axis helper for debugging (red=X, green=Y, blue=Z)
      const axesHelper = new THREE.AxesHelper(500);
      aircraftRoot.add(axesHelper);

      loadAircraftModel(
        modelPath,
        modelType,
        true, // Clone for traffic aircraft (multiple instances)
        (mesh) => {
          attitude.add(mesh);

          // Store aircraft data
          this.aircraftModels.set(aircraftId, {
            aircraftRoot,
            headingNode,
            modelFix,
            attitude,
            mesh,
            headingDeg,
            bankDeg: 0,
            pitchDeg: 0,
          });

          // Initial placement
          this.updateAircraftPosition(
            aircraftId,
            initialX,
            initialY,
            initialZ,
            headingDeg,
            0,
            0
          );
          this.map?.triggerRepaint();
        },
        (err) => {
          console.error(`Error loading aircraft model for ${aircraftId}:`, err);
        }
      );
    },

    removeAircraftModel: function (aircraftId) {
      const aircraft = this.aircraftModels.get(aircraftId);
      if (!aircraft) return;

      // Remove from scene
      if (aircraft.aircraftRoot && this.scene) {
        this.scene.remove(aircraft.aircraftRoot);
      }

      // Cleanup mesh
      if (aircraft.mesh) {
        aircraft.mesh.traverse((child) => {
          if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            const materials = Array.isArray(child.material)
              ? child.material
              : [child.material];
            materials.forEach((mat) => {
              if (mat) {
                if (mat.map) mat.map.dispose();
                mat.dispose();
              }
            });
          }
        });
      }

      this.aircraftModels.delete(aircraftId);
      this.map?.triggerRepaint();
    },

    updateAircraftPosition: function (
      aircraftId,
      x,
      y,
      z,
      headingDeg,
      bankAngleDeg = 0,
      pitchAngleDeg = 0
    ) {
      const aircraft = this.aircraftModels.get(aircraftId);
      if (!aircraft || !aircraft.aircraftRoot) return;

      updateAircraftTransform(
        {
          aircraftRoot: aircraft.aircraftRoot,
          headingNode: aircraft.headingNode,
          attitude: aircraft.attitude,
          angleCache: aircraft,
          attEuler: this._attEuler,
          originMercator: this.originMercator,
          scale: this.scale,
        },
        x,
        y,
        z,
        headingDeg,
        bankAngleDeg,
        pitchAngleDeg
      );

      this.map?.triggerRepaint();
    },
  };

  return layer;
}

