import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import mapboxgl from 'mapbox-gl';

// Precomputed constants
const DEG_TO_RAD = Math.PI / 180;
const PI_OVER_2 = Math.PI / 2;
const PI = Math.PI;
const PITCH_THRESHOLD = 5;
const MODEL_ORIGIN_OFFSET_X = -50; // meters left
const EULER_ORDER = 'ZXY';

const toRadians = (deg) => deg * DEG_TO_RAD;

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

      // Node hierarchy: aircraftRoot -> headingNode -> modelFix -> attitude -> mesh
      this.aircraftRoot = new THREE.Group();
      this.headingNode = new THREE.Group();
      this.modelFix = new THREE.Group();
      this.attitude = new THREE.Group();

      this.headingNode.add(this.modelFix);
      this.modelFix.add(this.attitude);
      this.aircraftRoot.add(this.headingNode);
      this.scene.add(this.aircraftRoot);

      this.aircraftRoot.scale.set(this.scale, -this.scale, this.scale);
      this.modelFix.rotation.set(PI_OVER_2, PI, 0);

      // State cache for absolute angles (degrees)
      this._cachedHeadingDeg = headingDeg;
      this._cachedBankDeg = 0;
      this._cachedPitchDeg = 0;

      const loader = new GLTFLoader();
      loader.load(
        modelPath,
        (gltf) => {
          this.mesh = gltf.scene;

          // Materials/textures hygiene (kept from your version)
          this.mesh.traverse((child) => {
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

          // Offset mesh to align model origin
          this.mesh.position.set(MODEL_ORIGIN_OFFSET_X, 0, 0);

          // Add mesh under attitude node
          this.attitude.add(this.mesh);

          // Initial placement
          this.updatePosition(initialX, initialY, initialZ, headingDeg, 0, 0);
          map.triggerRepaint();
        },
        undefined,
        (err) => {
          console.error('Error loading aircraft model:', err);
        }
      );
    },

    render: function (gl, matrix) {
      if (!this.aircraftRoot) return;

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

      // Position in mercator meters
      const { x: ox, y: oy, z: oz } = this.originMercator;
      this.aircraftRoot.position.set(
        ox + x * this.scale,
        oy + y * this.scale,
        oz + z * this.scale
      );

      // Cache angles
      this._cachedHeadingDeg = headingDeg ?? this._cachedHeadingDeg;
      this._cachedBankDeg = bankAngleDeg ?? this._cachedBankDeg;
      this._cachedPitchDeg = pitchAngleDeg ?? this._cachedPitchDeg;

      // Apply yaw (heading) on headingNode
      this.headingNode.rotation.z = -toRadians(this._cachedHeadingDeg);

      // Apply pitch and roll on attitude (ZXY Euler order)
      this._attEuler.set(
        -toRadians(this._cachedPitchDeg),
        0,
        toRadians(this._cachedBankDeg)
      );
      this.attitude.quaternion.setFromEuler(this._attEuler).normalize();

      this.map.triggerRepaint();
    },

    onRemove: function () {
      // Cleanup if needed
    },
  };

  return layer;
}