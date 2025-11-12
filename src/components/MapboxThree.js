import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import mapboxgl from 'mapbox-gl';

export function createAircraftLayer({
  originMercator,
  scale,
  initialX = 0,
  initialY = 0,
  initialZ = 0,
  headingDeg = 0,
  modelPath = '/Airplane.glb',
}) {
  const DEG_TO_RAD = Math.PI / 180;
  const toRadians = (deg) => deg * DEG_TO_RAD;

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

      // Node hierarchy:
      // aircraftRoot (Mapbox position/scale only)
      //  └─ headingNode (yaw only)
      //      └─ modelFix (one-time static alignment: X=+π/2)
      //          └─ attitude (pitch/roll only)
      //              └─ mesh (GLTF scene)
      this.aircraftRoot = new THREE.Group();
      this.headingNode = new THREE.Group();
      this.modelFix = new THREE.Group();
      this.attitude = new THREE.Group();

      this.headingNode.add(this.modelFix);
      this.modelFix.add(this.attitude);
      this.aircraftRoot.add(this.headingNode);
      this.scene.add(this.aircraftRoot);

      // Map scaling lives on aircraftRoot, consistent with your code
      this.aircraftRoot.scale.set(this.scale, -this.scale, this.scale);

      // One-time model alignment to match your “perfect” baseline:
      // your working case was rotation.set(Math.PI/2, 0, 0)
      this.modelFix.rotation.set(Math.PI / 2, Math.PI, 0);

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

          // If your GLB origin is on the right engine, offset the mesh inside attitude
          const modelOriginOffsetX = -50; // meters left; adjust if needed
          const modelOriginOffsetY = 0;
          const modelOriginOffsetZ = 0;
          this.mesh.position.set(
            modelOriginOffsetX,
            modelOriginOffsetY,
            modelOriginOffsetZ
          );

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
      if (Math.abs(pitchView) < 5) return;

      const canvas = this.map.getCanvas();
      const width = canvas.width;
      const height = canvas.height;
      if (
        this.renderer.domElement.width !== width ||
        this.renderer.domElement.height !== height
      ) {
        this.renderer.setSize(width, height, false);
      }

      if (!this._tempMatrix) this._tempMatrix = new THREE.Matrix4();
      this._tempMatrix.fromArray(matrix);
      this.camera.projectionMatrix = this._tempMatrix;

      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
    },

    // Absolute setter you can call from your sim/inputs
    // headingDeg: yaw (compass), bankAngleDeg: roll (right wing down +),
    // pitchAngleDeg: pitch (nose up +). No yaw applied to attitude.
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
      const mercatorX = this.originMercator.x + x * this.scale;
      const mercatorY = this.originMercator.y + y * this.scale;
      const mercatorZ = this.originMercator.z + z * this.scale;
      this.aircraftRoot.position.set(mercatorX, mercatorY, mercatorZ);

      // Cache angles
      this._cachedHeadingDeg = headingDeg ?? this._cachedHeadingDeg;
      this._cachedBankDeg = bankAngleDeg ?? this._cachedBankDeg;
      this._cachedPitchDeg = pitchAngleDeg ?? this._cachedPitchDeg;

      // Apply yaw (heading) on headingNode ONLY
      // Mapbox east=x, north=y; we keep your previous sign convention if needed.
      const headingRad = toRadians(this._cachedHeadingDeg);
      // If your previous code needed +π or sign flips, tweak here.
      this.headingNode.rotation.set(0, 0, 0);
      // Yaw around local Z of headingNode is not desired here (we want compass heading in XY plane).
      // Use rotation around Z? In this Mercator setup, heading should rotate around +Z (up).
      // So apply on headingNode.rotateZ:
      this.headingNode.rotation.z = -headingRad;

      // Apply pitch and roll on attitude ONLY (no yaw here)
      const bankRad = toRadians(this._cachedBankDeg);
      const pitchRad = toRadians(this._cachedPitchDeg);

      // We want: pitch about local X, roll about local Z
      // Use a fixed Euler order where X = pitch and Z = roll, and Y=0.
      // 'ZXY' works: euler(x=pitch, y=0, z=roll)
      if (!this._attEuler) this._attEuler = new THREE.Euler(0, 0, 0, 'ZXY');
      this._attEuler.set(-pitchRad, 0, bankRad); // right wing down positive => roll negative around Z
      this.attitude.quaternion.setFromEuler(this._attEuler).normalize();

      this.map.triggerRepaint();
    },

    // Convenience method if you just want to set attitude elsewhere (WASD)
    setAttitudeDegrees: function (pitchDeg, bankDeg) {
      this.updatePosition(
        0,
        0,
        0,
        this._cachedHeadingDeg,
        bankDeg,
        pitchDeg
      );
    },

    onRemove: function () {
      // Cleanup if needed
    },
  };

  return layer;
}