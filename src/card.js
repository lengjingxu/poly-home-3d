import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ICONS } from "./icons.js";
import CSS from "./styles.css";

const DEFAULTS = {
  title: "上海家庭",
  subtitle: "",
  model: "",
  view_height: 0.35,
  ambient_entity: "sun.sun",
  accent: "#ffb066",
  background: "#0a0b0e",
  rooms: [],
  markers: [],
  scenes: [],
  light_intensity: 2.8,
  light_distance: 6.0,
  pool_scale: 1.0,
  camera: null,
  shadows: true,
  bloom: 0.62,
  exposure: 1.02,
  show_rail: true,
};

const DAY_BG = new THREE.Color("#121722");
const NIGHT_BG = new THREE.Color("#06070a");
const VIEW_DIR = new THREE.Vector3(0.55, 0.72, 0.82).normalize();

function iconMarkup(name, size) {
  const key = String(name || "").replace(/^mdi:/, "");
  const path = ICONS[key];
  const px = size || 16;
  if (!path) return '<ha-icon icon="mdi:' + key + '"></ha-icon>';
  return '<svg viewBox="0 0 24 24" width="' + px + '" height="' + px + '" aria-hidden="true">'
    + '<path fill="currentColor" d="' + path + '"/></svg>';
}

function glowTexture(size, power) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (let i = 0; i <= 16; i += 1) {
    const t = i / 16;
    const a = Math.pow(1 - t, power);
    g.addColorStop(t, "rgba(255,255,255," + a.toFixed(4) + ")");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

class PolyHome3D extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = { ...DEFAULTS };
    this._markerEls = new Map();
    this._roomEls = new Map();
    this._roomMeshes = new Map();
    this._fixtures = new Map();
    this._lights = new Map();
    this._railEls = new Map();
    this._tmp = new THREE.Vector3();
    this._hass = null;
    this._rendering = false;
    this._focus = "全屋";
    this._layout = { mode: "card", offsetX: 0, offsetY: 0 };
  }

  static getStubConfig() {
    return { type: "custom:poly-home-3d", config_url: "/local/community/poly-home-3d/floorplan.json" };
  }

  getCardSize() {
    return 14;
  }

  setConfig(config) {
    this._hass = null;
    this._focus = "全屋";
    if (config.config_url) {
      fetch(config.config_url, { cache: "no-store" })
        .then((res) => {
          if (!res.ok) throw new Error(res.status + " " + res.statusText);
          return res.json();
        })
        .then((file) => this._applyConfig(file, config))
        .catch((err) => this._fail("配置加载失败：" + err.message));
      return;
    }
    this._applyConfig({}, config);
  }

  _applyConfig(file, config) {
    this._config = { ...DEFAULTS, ...file, ...config };
    if (config.config_url) {
      this._config.model = new URL(this._config.model, new URL(config.config_url, location.href)).href;
    }
    this._build();
  }

  _fail(message) {
    this.shadowRoot.innerHTML = "<style>" + CSS + "</style>"
      + '<ha-card><div class="wrap"><div class="loading">' + message + "</div></div></ha-card>";
  }

  set hass(hass) {
    this._hass = hass;
    this._applyStates();
  }

  disconnectedCallback() {
    this._rendering = false;
    if (this._ro) this._ro.disconnect();
    if (this._onWindowResize) window.removeEventListener("resize", this._onWindowResize);
    if (this._onViewportResize && window.visualViewport) {
      window.visualViewport.removeEventListener("resize", this._onViewportResize);
    }
  }

  // ---------- DOM ----------

  _build() {
    const cfg = this._config;
    this.shadowRoot.innerHTML = "<style>" + CSS + "</style>"
      + '<ha-card><div class="wrap" style="--poly-bg:' + cfg.background + ";--poly-accent:" + cfg.accent + '">'
      + '<div class="viewport"></div><div class="vignette"></div><div class="grain"></div>'
      + '<div class="markers"></div>'
      + '<div class="hud">'
      + '<div class="top"><div class="brand"><h1></h1><div class="sub"></div></div>'
      + '<div class="chips"></div></div>'
      + '<div class="rail"></div><div class="scenes"></div>'
      + '<div class="hint">拖动旋转 · 滚轮缩放 · 点房间开灯 · 长按查看详情</div>'
      + "</div>"
      + '<div class="loading">正在加载 3D 模型…</div></div></ha-card>';

    this.shadowRoot.querySelector(".brand h1").textContent = cfg.title;
    const sub = this.shadowRoot.querySelector(".brand .sub");
    sub.textContent = cfg.subtitle || "";
    this._buildRail();
    this._buildScenes();
    this._buildMarkers();
    this._setupThree();
    this._loadModel();
  }

  _buildRail() {
    const box = this.shadowRoot.querySelector(".rail");
    box.innerHTML = "";
    this._railEls.clear();
    if (!this._config.show_rail) {
      box.style.display = "none";
      return;
    }
    const rows = [{ name: "全屋", rect: null, lights: [] }].concat(this._config.rooms || []);
    for (const room of rows) {
      const el = document.createElement("div");
      el.className = "rrow";
      el.innerHTML = '<span class="bulb"></span><span class="nm"></span>'
        + '<span class="pwr">' + iconMarkup("mdi:power", 13) + "</span>";
      el.querySelector(".nm").textContent = room.name;
      el.addEventListener("click", () => this._focusRoom(room.name));
      const pwr = el.querySelector(".pwr");
      if (room.lights && room.lights.length) {
        pwr.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this._toggleRoom(room);
        });
      } else {
        el.classList.add("empty");
      }
      box.appendChild(el);
      this._railEls.set(room.name, el);
    }
    this._paintRail();
  }

  _paintRail() {
    for (const [name, el] of this._railEls) {
      el.classList.toggle("active", name === this._focus);
    }
    if (!this._hass) return;
    for (const room of this._config.rooms || []) {
      const el = this._railEls.get(room.name);
      if (!el) continue;
      const lights = room.lights || [];
      const lit = lights.filter((id) => (this._hass.states[id] || {}).state === "on").length;
      el.classList.toggle("lit", lit > 0);
      el.classList.toggle("empty", lights.length === 0);
    }
  }

  _buildScenes() {
    const box = this.shadowRoot.querySelector(".scenes");
    box.innerHTML = "";
    for (const scene of this._config.scenes || []) {
      const el = document.createElement("div");
      el.className = "scene";
      el.innerHTML = iconMarkup(scene.icon || "mdi:palette", 15) + "<span></span>";
      el.querySelector("span").textContent = scene.name;
      el.addEventListener("click", () => this._runScene(scene));
      box.appendChild(el);
    }
  }

  _buildMarkers() {
    const box = this.shadowRoot.querySelector(".markers");
    box.innerHTML = "";
    this._markerEls.clear();
    for (const marker of this._config.markers || []) {
      const el = document.createElement("div");
      el.className = "marker";
      el.innerHTML = '<div class="dot">' + iconMarkup(marker.icon || "mdi:lightbulb", 14) + "</div>"
        + '<div class="tag"></div>';
      el.querySelector(".tag").textContent = marker.name || marker.entity;
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this._activate(marker);
      });
      el.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        this._moreInfo(marker.entity);
      });
      box.appendChild(el);
      this._markerEls.set(marker.entity, el);
    }
  }

  // ---------- three.js ----------

  _setupThree() {
    const cfg = this._config;
    const host = this.shadowRoot.querySelector(".viewport");
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.shadowMap.enabled = !!cfg.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = cfg.exposure;
    host.appendChild(renderer.domElement);
    this._renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(cfg.background);
    scene.fog = new THREE.Fog(cfg.background, 30, 70);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(90, 24, 16),
      new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    scene.add(sky);
    this._sky = sky;
    this._setSky(true);
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.3;
    this._scene = scene;

    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 220);
    this._camera = camera;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minPolarAngle = Math.PI * 0.08;
    controls.minDistance = 2.2;
    controls.maxDistance = 46;
    controls.enablePan = false;
    this._controls = controls;

    this._hemi = new THREE.HemisphereLight(0x93a7c9, 0x241d18, 0.42);
    scene.add(this._hemi);
    const sun = new THREE.DirectionalLight(0xffe6c8, 0.8);
    sun.position.set(9, 16, 12);
    sun.castShadow = !!cfg.shadows;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -9;
    sun.shadow.camera.right = 9;
    sun.shadow.camera.top = 9;
    sun.shadow.camera.bottom = -9;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 46;
    sun.shadow.bias = -0.0009;
    sun.shadow.normalBias = 0.022;
    scene.add(sun, sun.target);
    this._sun = sun;

    const beam = document.createElement("canvas");
    beam.width = 4;
    beam.height = 128;
    const bctx = beam.getContext("2d");
    const bg = bctx.createLinearGradient(0, 0, 0, 128);
    bg.addColorStop(0, "rgba(255,255,255,0.95)");
    bg.addColorStop(0.35, "rgba(255,255,255,0.34)");
    bg.addColorStop(1, "rgba(255,255,255,0)");
    bctx.fillStyle = bg;
    bctx.fillRect(0, 0, 4, 128);
    this._beamTex = new THREE.CanvasTexture(beam);
    this._beamTex.colorSpace = THREE.SRGBColorSpace;
    this._glowTex = glowTexture(128, 2.4);
    this._poolTex = glowTexture(256, 2.0);
    this._raycaster = new THREE.Raycaster();

    renderer.domElement.addEventListener("pointerdown", (e) => this._onDown(e));
    renderer.domElement.addEventListener("pointerup", (e) => this._onUp(e));
    renderer.domElement.addEventListener("pointermove", (e) => this._onMove(e));
    renderer.domElement.addEventListener("dblclick", () => this._focusRoom("全屋"));

    this._composer = new EffectComposer(renderer);
    this._composer.addPass(new RenderPass(scene, camera));
    this._bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), cfg.bloom, 0.62, 0.82);
    this._composer.addPass(this._bloom);
    this._composer.addPass(new OutputPass());

    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(host);
    this._onWindowResize = () => this._resize();
    this._onViewportResize = () => this._resize();
    window.addEventListener("resize", this._onWindowResize);
    window.visualViewport?.addEventListener("resize", this._onViewportResize);
    this._resize();

    this._rendering = true;
    const loop = () => {
      if (!this._rendering) return;
      this._tickCamera();
      this._controls.update();
      this._syncOverlays();
      this._composer.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  _setSky(day) {
    if (this._skyDay === day) return;
    this._skyDay = day;
    const cv = document.createElement("canvas");
    cv.width = 4;
    cv.height = 256;
    const ctx = cv.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    if (day) {
      g.addColorStop(0, "#232f47");
      g.addColorStop(0.55, "#151b29");
      g.addColorStop(1, "#0c0f16");
    } else {
      g.addColorStop(0, "#1b2338");
      g.addColorStop(0.55, "#0e121c");
      g.addColorStop(1, "#080a10");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (this._sky.material.map) this._sky.material.map.dispose();
    this._sky.material.map = tex;
    this._sky.material.needsUpdate = true;
  }

  _resize() {
    const host = this.shadowRoot.querySelector(".viewport");
    const w = host.clientWidth || 640;
    const h = host.clientHeight || 420;
    this._renderer.setSize(w, h, false);
    this._composer.setSize(w, h);
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    if (this._bounds) {
      const room = (this._config.rooms || []).find((item) => item.name === this._focus);
      this._frameCamera(room ? room.rect : null, true);
    }
  }

  _loadModel() {
    const loader = new GLTFLoader();
    loader.load(this._config.model, (gltf) => {
      const root = gltf.scene;
      root.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = !!this._config.shadows;
        child.receiveShadow = !!this._config.shadows;
        const mat = child.material;
        if (mat) {
          mat.side = THREE.FrontSide;
          mat.envMapIntensity = 0.55;
          if (mat.name === "glass") {
            mat.roughness = 0.06;
            mat.metalness = 0.24;
            mat.envMapIntensity = 1.5;
            this._glass = mat;
          }
          if (mat.name === "plinth") mat.envMapIntensity = 0.9;
        }
      });
      this._model = root;
      this._scene.add(root);

      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      this._bounds = { box, size, center };
      this._sun.position.set(center.x + 8, 15, center.z + 11);
      this._sun.target.position.set(center.x, 0, center.z);
      this._sun.target.updateMatrixWorld();

      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(90, 90),
        new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 1, metalness: 0 }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(center.x, box.min.y - 0.002, center.z);
      ground.receiveShadow = true;
      this._scene.add(ground);

      const stage = new THREE.Mesh(
        new THREE.PlaneGeometry(52, 52),
        new THREE.MeshBasicMaterial({
          map: this._poolTex, color: 0x2a3140, transparent: true, opacity: 0.5,
          blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        }),
      );
      stage.rotation.x = -Math.PI / 2;
      stage.position.set(center.x, box.min.y, center.z);
      stage.scale.setScalar(1.5);
      this._scene.add(stage);
      this._stage = stage;

      this._frameCamera(null, true);
      this._buildRoomFloor();
      this._buildFixtures();
      this._buildRoomLabels();
      const loading = this.shadowRoot.querySelector(".loading");
      if (loading) loading.remove();
      this._applyStates();
    }, undefined, (err) => {
      const el = this.shadowRoot.querySelector(".loading");
      if (el) el.textContent = "模型加载失败：" + ((err && err.message) || err);
    });
  }

  _fitDistance(target, corners) {
    const cam = this._camera;
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const tanH = tanV * cam.aspect;
    const forward = VIEW_DIR.clone().negate();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    let d = 0;
    for (const c of corners) {
      const v = c.clone().sub(target);
      const px = Math.abs(v.dot(right));
      const py = Math.abs(v.dot(up));
      const dz = v.dot(VIEW_DIR);
      d = Math.max(d, px / tanH + dz, py / tanV + dz);
    }
    return d * 1.06;
  }

  _readLayout() {
    const rect = this.shadowRoot.querySelector(".viewport").getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportWidth = viewport?.width || window.innerWidth;
    const viewportHeight = viewport?.height || window.innerHeight;
    const panel = rect.width >= viewportWidth * 0.7 && rect.height >= viewportHeight * 0.65;
    if (!panel) return { mode: "card", width: rect.width, height: rect.height, offsetX: 0, offsetY: 0 };

    const offsetX = rect.left + rect.width / 2 - viewportWidth / 2;
    const offsetY = rect.top + rect.height / 2 - viewportHeight / 2;
    if (Math.abs(offsetX) < 1 && Math.abs(offsetY) < 1) {
      return { mode: "card", width: rect.width, height: rect.height, offsetX: 0, offsetY: 0 };
    }
    return {
      mode: offsetX > 1 ? "shell-right" : offsetX < -1 ? "shell-left" : "shell",
      width: rect.width,
      height: rect.height,
      offsetX,
      offsetY,
    };
  }

  _applyLayout(layout) {
    this._layout = layout;
    const wrap = this.shadowRoot.querySelector(".wrap");
    if (wrap) {
      wrap.dataset.layout = layout.mode;
      wrap.style.setProperty("--poly-layout-offset-x", layout.offsetX.toFixed(2) + "px");
    }
    if (layout.offsetX || layout.offsetY) {
      this._camera.setViewOffset(
        layout.width, layout.height, layout.offsetX, layout.offsetY, layout.width, layout.height,
      );
    } else {
      this._camera.clearViewOffset();
    }
  }

  _fitLayoutDistance(target, corners, distance, layout) {
    this._applyLayout(layout);
    if (!layout.offsetX && !layout.offsetY) return distance;

    const camera = this._camera;
    const savedPosition = camera.position.clone();
    const savedQuaternion = camera.quaternion.clone();
    const fits = (candidate) => {
      camera.position.copy(target).add(VIEW_DIR.clone().multiplyScalar(candidate));
      camera.lookAt(target);
      camera.updateMatrixWorld(true);
      for (const corner of corners) {
        this._tmp.copy(corner).project(camera);
        if (this._tmp.x < -0.995 || this._tmp.x > 0.995 || this._tmp.y < -0.995 || this._tmp.y > 0.995) {
          return false;
        }
      }
      return true;
    };

    let low = distance;
    let high = distance;
    while (!fits(high) && high < 180) high *= 1.15;
    if (fits(high)) {
      for (let i = 0; i < 12; i += 1) {
        const middle = (low + high) / 2;
        if (fits(middle)) high = middle;
        else low = middle;
      }
    }
    camera.position.copy(savedPosition);
    camera.quaternion.copy(savedQuaternion);
    camera.updateMatrixWorld(true);
    return high;
  }

  _frameCamera(rect, instant) {
    const { center } = this._bounds;
    const bb = this._bounds.box;
    let target = new THREE.Vector3(center.x, this._config.view_height, center.z);
    let corners = [];
    for (const x of [bb.min.x, bb.max.x]) {
      for (const y of [bb.min.y, bb.max.y]) {
        for (const z of [bb.min.z, bb.max.z]) corners.push(new THREE.Vector3(x, y, z));
      }
    }
    if (rect) {
      const [x0, z0, x1, z1] = rect;
      target = new THREE.Vector3((x0 + x1) / 2, this._config.view_height + 0.15, (z0 + z1) / 2);
      corners = [];
      for (const x of [x0, x1]) {
        for (const y of [0, 1.35]) {
          for (const z of [z0, z1]) corners.push(new THREE.Vector3(x, y, z));
        }
      }
    }
    const layout = this._readLayout();
    const distance = this._fitLayoutDistance(target, corners, this._fitDistance(target, corners), layout);
    const cam = this._config.camera;
    const to = target.clone().add(VIEW_DIR.clone().multiplyScalar(distance));
    if (cam && cam.position && !rect) to.fromArray(cam.position);
    this._controls.maxDistance = Math.max(46, distance * 1.2);
    this._controls.minDistance = Math.min(this._controls.minDistance, distance * 0.5);
    if (instant) {
      this._camera.position.copy(to);
      this._controls.target.copy(target);
      this._controls.update();
      return;
    }
    this._anim = {
      t: 0,
      fromPos: this._camera.position.clone(),
      toPos: to,
      fromTgt: this._controls.target.clone(),
      toTgt: target,
    };
  }

  _tickCamera() {
    const a = this._anim;
    if (!a) return;
    a.t = Math.min(1, a.t + 0.035);
    const e = a.t < 0.5 ? 4 * a.t * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 3) / 2;
    this._camera.position.lerpVectors(a.fromPos, a.toPos, e);
    this._controls.target.lerpVectors(a.fromTgt, a.toTgt, e);
    if (a.t >= 1) this._anim = null;
  }

  _focusRoom(name) {
    if (!this._bounds) return;
    this._focus = name;
    const room = (this._config.rooms || []).find((r) => r.name === name);
    this._frameCamera(room ? room.rect : null, false);
    this._paintRail();
  }

  _buildRoomFloor() {
    for (const room of this._config.rooms || []) {
      const [x0, z0, x1, z1] = room.rect;
      const shape = new THREE.Shape([
        new THREE.Vector2(x0, -z0), new THREE.Vector2(x1, -z0),
        new THREE.Vector2(x1, -z1), new THREE.Vector2(x0, -z1),
      ]);
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(this._config.accent), transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 0.014;
      mesh.userData.room = room;
      this._scene.add(mesh);

      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: new THREE.Color(this._config.accent), transparent: true, opacity: 0 }),
      );
      edge.position.y = 0.02;
      this._scene.add(edge);

      this._roomMeshes.set(room.name, { glow: mesh, edge: edge, room: room });
    }
  }

  _buildRoomLabels() {
    const box = this.shadowRoot.querySelector(".markers");
    for (const room of this._config.rooms || []) {
      const el = document.createElement("div");
      el.className = "roomlbl";
      el.textContent = room.name;
      box.appendChild(el);
      this._roomEls.set(room.name, el);
    }
  }

  _buildFixtures() {
    const cfg = this._config;
    const discGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.03, 20);
    for (const marker of cfg.markers || []) {
      const color = new THREE.Color(cfg.accent);
      const disc = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({
        color: 0x2b2f36, emissive: color, emissiveIntensity: 0, roughness: 0.32, metalness: 0.1,
      }));
      disc.position.set(marker.x, marker.y, marker.z);
      this._scene.add(disc);

      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._glowTex, color: color, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      halo.position.set(marker.x, marker.y - 0.01, marker.z);
      halo.scale.setScalar(1.35);
      this._scene.add(halo);

      let cone = null;
      if (marker.cone) {
        cone = new THREE.Mesh(
          new THREE.ConeGeometry(0.85, marker.y, 22, 1, true),
          new THREE.MeshBasicMaterial({
            map: this._beamTex, color: color, transparent: true, opacity: 0,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
          }),
        );
        cone.position.set(marker.x, marker.y / 2, marker.z);
        this._scene.add(cone);
      }

      const pool = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: this._poolTex, color: color, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(marker.x, 0.02, marker.z);
      const span = (marker.pool || cfg.light_distance * 0.86) * cfg.pool_scale;
      pool.scale.set(span, span, 1);
      this._scene.add(pool);

      this._fixtures.set(marker.entity, { disc: disc, halo: halo, pool: pool, cone: cone, light: null, marker: marker });
    }
  }

  _applyStates() {
    if (!this._hass || !this._model) return;
    const cfg = this._config;
    const st = (id) => (this._hass.states[id] || {}).state;
    const sunUp = st(cfg.ambient_entity) !== "below_horizon";

    this._hemi.intensity = sunUp ? 0.36 : 0.16;
    this._hemi.color.set(sunUp ? 0x9fb3d6 : 0x2f3d5e);
    this._sun.intensity = sunUp ? 0.8 : 0.7;
    this._sun.color.set(sunUp ? 0xffe6c8 : 0x8ea6d8);
    this._scene.background.copy(sunUp ? DAY_BG : NIGHT_BG);
    this._scene.fog.color.copy(this._scene.background);
    this._setSky(sunUp);
    this._bloom.strength = sunUp ? cfg.bloom * 0.75 : cfg.bloom;
    const lightIds = (this._config.markers || [])
      .map((m) => m.entity)
      .filter((id) => /^(light|switch)\./.test(id));
    let litCount = 0;
    for (const id of lightIds) if (st(id) === "on") litCount += 1;
    const litRatio = lightIds.length ? litCount / lightIds.length : 0;
    if (this._glass) {
      this._glass.color.set(sunUp ? 0x4a5c70 : 0x1c2230);
      this._glass.emissive.set(sunUp ? 0x000000 : 0xffc08a);
      this._glass.emissiveIntensity = sunUp ? 0 : 0.03 + litRatio * 0.2;
    }

    for (const [entityId, fx] of this._fixtures) {
      const on = st(entityId) === "on";
      fx.disc.material.emissiveIntensity = on ? 3.2 : 0;
      fx.disc.material.color.set(on ? 0xfff3e2 : 0x2b2f36);
      fx.halo.material.opacity = on ? 0.6 : 0;
      fx.pool.material.opacity = on ? 0.34 : 0;
      if (fx.cone) fx.cone.material.opacity = on ? 0.3 : 0;
      if (on && !fx.light) {
        const light = new THREE.PointLight(new THREE.Color(cfg.accent), cfg.light_intensity, cfg.light_distance, 2);
        light.position.set(fx.marker.x, Math.max(fx.marker.y, 0.55), fx.marker.z);
        this._scene.add(light);
        fx.light = light;
      } else if (!on && fx.light) {
        this._scene.remove(fx.light);
        fx.light.dispose();
        fx.light = null;
      }
      const el = this._markerEls.get(entityId);
      if (el) {
        const state = this._hass.states[entityId];
        el.classList.toggle("on", on);
        el.classList.toggle("off2", !state || state.state === "unavailable");
      }
    }

    for (const [name, item] of this._roomMeshes) {
      const lights = item.room.lights || [];
      const lit = lights.filter((id) => st(id) === "on").length;
      const ratio = lights.length ? lit / lights.length : 0;
      item.glow.material.opacity = 0.012 + ratio * 0.05;
      const label = this._roomEls.get(name);
      if (label) label.classList.toggle("lit", lit > 0);
    }

    this._paintRail();
    this._paintChips(sunUp, litCount);
    this._paintClock();
  }

  _paintClock() {
    const d = new Date();
    const text = this._config.subtitle ? this._config.subtitle + "  ·  " : "";
    const clock = text
      + String(d.getHours()).padStart(2, "0") + ":"
      + String(d.getMinutes()).padStart(2, "0");
    const el = this.shadowRoot.querySelector(".brand .sub");
    if (el && el.textContent !== clock) el.textContent = clock;
  }

  _paintChips(sunUp, litCount) {
    const box = this.shadowRoot.querySelector(".chips");
    const total = (this._config.markers || []).filter((m) => /^(light|switch)\./.test(m.entity)).length;
    const temps = [];
    for (const marker of this._config.markers || []) {
      const state = this._hass.states[marker.entity];
      if (!state || !marker.entity.startsWith("climate.")) continue;
      const t = state.attributes.current_temperature;
      if (typeof t === "number") temps.push(t);
    }
    let html = '<div class="chip">' + iconMarkup("mdi:lightbulb-group", 14)
      + "<span><b>" + litCount + "</b> / " + total + " 亮</span></div>";
    if (temps.length) {
      const avg = temps.reduce((a, b) => a + b, 0) / temps.length;
      html += '<div class="chip">' + iconMarkup("mdi:thermometer", 14)
        + "<span><b>" + avg.toFixed(1) + "</b> °C</span></div>";
    }
    html += '<div class="chip">' + iconMarkup(sunUp ? "mdi:weather-sunny" : "mdi:weather-night", 14)
      + "<span>" + (sunUp ? "白天" : "夜间") + "</span></div>";
    box.innerHTML = html;
  }

  // ---------- 交互 ----------

  _project(x, y, z, rect) {
    this._tmp.set(x, y, z).project(this._camera);
    return {
      x: (this._tmp.x * 0.5 + 0.5) * rect.width,
      y: (-this._tmp.y * 0.5 + 0.5) * rect.height,
      visible: this._tmp.z < 1,
    };
  }

  _syncOverlays() {
    if (!this._model) return;
    const rect = this._renderer.domElement.getBoundingClientRect();
    for (const marker of this._config.markers || []) {
      const el = this._markerEls.get(marker.entity);
      if (!el) continue;
      const p = this._project(marker.x, marker.y + 0.22, marker.z, rect);
      el.style.transform = "translate(-50%,-50%) translate(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px)";
      el.style.opacity = p.visible ? "1" : "0";
    }
    for (const room of this._config.rooms || []) {
      const el = this._roomEls.get(room.name);
      if (!el) continue;
      const [x0, z0, x1, z1] = room.rect;
      const p = this._project((x0 + x1) / 2, 0.03, (z0 + z1) / 2, rect);
      el.style.transform = "translate(-50%,-50%) translate(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px)";
      el.style.opacity = p.visible ? "1" : "0";
    }
  }

  _pick(event) {
    const rect = this._renderer.domElement.getBoundingClientRect();
    const point = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this._raycaster.setFromCamera(point, this._camera);
    return this._raycaster.intersectObjects([...this._roomMeshes.values()].map((m) => m.glow), false)[0];
  }

  _onDown(e) {
    this._down = { x: e.clientX, y: e.clientY, t: performance.now() };
  }

  _onMove(e) {
    if (!this._roomMeshes.size) return;
    const hit = this._pick(e);
    const name = hit ? hit.object.userData.room.name : null;
    if (name !== this._hover) {
      this._hover = name;
      for (const [key, item] of this._roomMeshes) {
        item.edge.material.opacity = key === name ? 0.42 : 0;
      }
      this._renderer.domElement.style.cursor = name ? "pointer" : "";
    }
  }

  _onUp(e) {
    if (!this._down) return;
    const moved = Math.hypot(e.clientX - this._down.x, e.clientY - this._down.y);
    const held = performance.now() - this._down.t;
    this._down = null;
    if (moved > 7) return;
    if (held > 480) return;
    const hit = this._pick(e);
    if (hit) this._toggleRoom(hit.object.userData.room);
  }

  _toggleRoom(room) {
    if (!this._hass || !(room.lights || []).length) return;
    const allOff = room.lights.every((id) => (this._hass.states[id] || {}).state !== "on");
    this._hass.callService("light", allOff ? "turn_on" : "turn_off", { entity_id: room.lights });
  }

  _activate(marker) {
    if (!this._hass) return;
    const domain = marker.entity.split(".")[0];
    if (domain === "light" || domain === "switch" || domain === "fan" || domain === "input_boolean") {
      this._hass.callService(domain, "toggle", { entity_id: marker.entity });
    } else {
      this._moreInfo(marker.entity);
    }
  }

  _moreInfo(entityId) {
    this.dispatchEvent(new CustomEvent("hass-more-info", {
      detail: { entityId: entityId }, bubbles: true, composed: true,
    }));
  }

  _runScene(scene) {
    if (!this._hass) return;
    const targets = scene.targets || [];
    const data = targets.length ? { entity_id: targets } : {};
    const parts = String(scene.service || "light.toggle").split(".");
    this._hass.callService(parts[0], parts[1], data);
  }
}

customElements.define("poly-home-3d", PolyHome3D);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "poly-home-3d",
  name: "Poly Home 3D",
  description: "保利智家 3D 中控：真三维户型、暖光联动、点击控制。",
});
