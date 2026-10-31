import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { Globe, type ScanSpec } from "./Globe";
import { Satellite } from "./Satellite";
import { Ground, M_PER_UNIT, toGeo } from "./Ground";
import { NOISE } from "./glsl";
import { R, KM_PER_UNIT, dir, tangents, latLonOf, HOME, VENUES, nearHome, wrapLon, isLand, sunDirection } from "./geo";
import { ROUTE_AT, SPAN, SWITCH_AT, type SectionId } from "./route";

export type Telemetry = { altKm: number; lat: number; lon: number };

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* ---------------- camera keyframes ---------------- */
type OrbitKey = { p: number; lat: number; lon: number; dist: number; tilt: number; yaw: number; roll: number; shift: number; sat: [number, number, number]; research?: number };
type GroundKey = { p: number; pos: [number, number, number]; look: [number, number, number]; shift: number };

const A = ROUTE_AT;
/* Every orbit keyframe is an offset (dLat, dLon) from the home city in
 * content.ts, so the same flight lands anywhere on Earth. */
type Rel = Omit<OrbitKey, "lat" | "lon"> & { dLat: number; dLon: number; tag?: SectionId };
const ORBIT_REL: Rel[] = [
  { p: 0, dLat: -24.5, dLon: -3.9, dist: 178, tilt: 31, yaw: -8, roll: -18, shift: 0.16, sat: [3.4, 2.9, -14] },
  { p: A.about, dLat: -12.5, dLon: 0.1, dist: 165, tilt: 20, yaw: 0, roll: -8, shift: 0.3, sat: [0.6, 3.0, -14] },
  { p: A.experience, dLat: -8.5, dLon: 0.6, dist: 150, tilt: 20, yaw: 0, roll: 6, shift: -0.37, sat: [0.6, 3.0, -14] },
  { p: A.flagship, dLat: -5, dLon: 1.3, dist: 126, tilt: 20, yaw: -8, roll: 0, shift: 0.31, sat: [0.2, 1.9, -10.5] },
  { p: 0.555, dLat: -1.9, dLon: 0, dist: 104, tilt: 50, yaw: 0, roll: 0, shift: 0, sat: [-1, 4, -10] },
  { p: SWITCH_AT, dLat: -0.32, dLon: 0, dist: 100.5, tilt: 62, yaw: 0, roll: 0, shift: 0, sat: [0, 9, -9] },
];

/* ---------------- the research view ----------------
 * The camera pulls back until home and the venue pins fit in frame. When the
 * venues are spread too widely for one view (a home in Honolulu and venues in
 * Europe and Asia, say), the view follows the arcs instead: it frames home and
 * the venues reached so far, or, when even those do not fit, the newest arc. */
const D = THREE.MathUtils.radToDeg;
const FIT = 52; // degrees from the view centre that still sit comfortably in frame (see NUDGE)
/** on wide screens the research panel covers the right of the globe, so the view looks a little east of the focus */
const NUDGE = 12;

/** axis that turns home toward a venue along the arc drawn on the globe (see Globe.buildArcs) */
export function arcAxis(a: THREE.Vector3, b: THREE.Vector3) {
  const axis = new THREE.Vector3().crossVectors(a, b);
  if (axis.lengthSq() < 1e-6) axis.crossVectors(a, tangents(HOME.lat, HOME.lon).north.multiplyScalar(HOME.lat >= 0 ? 1 : -1));
  return axis.normalize();
}
/** smallest cap holding every point (approximate): its centre and angular radius in degrees */
function capOf(pts: THREE.Vector3[]) {
  const c = new THREE.Vector3();
  pts.forEach((p) => c.add(p));
  if (c.lengthSq() < 1e-6) c.copy(pts[0]); else c.normalize();
  for (let i = 0; i < 80; i++) {
    let far = pts[0], fa = -1;
    for (const p of pts) { const ang = c.angleTo(p); if (ang > fa) { fa = ang; far = p; } }
    c.lerp(far, 1 / (i + 2)).normalize();
  }
  let spread = 0;
  pts.forEach((p) => (spread = Math.max(spread, c.angleTo(p))));
  return { c, spread: D(spread) };
}
const HOME_V = dir(HOME.lat, HOME.lon);
const VENUE_V = VENUES.map((v) => dir(v.lat, v.lon));
/** where the research view looks while paper `paper` (index in content.publications) is in focus */
export function researchFocus(paper: number) {
  if (!VENUES.length) return { c: dir(HOME.lat + 2.5, HOME.lon - 1.9), spread: 30 };
  const all = capOf([HOME_V, ...VENUE_V]);
  if (all.spread <= FIT) return all;
  const reached = VENUES.map((v, i) => (v.pub <= paper ? i : -1)).filter((i) => i >= 0);
  const some = capOf([HOME_V, ...(reached.length ? reached : [0]).map((i) => VENUE_V[i])]);
  if (some.spread <= FIT) return some;
  // only the newest arc: slide the view along it, so its venue stays in frame
  const b = VENUE_V[reached.length ? reached[reached.length - 1] : 0];
  const ang = HOME_V.angleTo(b);
  const f = Math.max(0.5, (ang - THREE.MathUtils.degToRad(FIT - 4)) / ang);
  const c = HOME_V.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(arcAxis(HOME_V, b), ang * f));
  return { c, spread: Math.min(90, D(ang) * Math.max(f, 1 - f)) };
}
/** a focus as a camera target: frame a little south of the centre (the camera tilt and the bottom HUD otherwise crop southern pins) */
function focusView(f: { c: THREE.Vector3; spread: number }) {
  const ll = latLonOf(f.c);
  const dist = Math.min(470, Math.max(350, 370 + (f.spread - 50) * 3));
  return { lat: Math.max(-80, Math.min(80, ll.lat - 5)), lon: HOME.lon + wrapLon(ll.lon - HOME.lon), dist };
}

function buildOrbit(withResearch: boolean): OrbitKey[] {
  const rel = ORBIT_REL.slice();
  if (withResearch) {
    const s = SPAN.research!;
    // lat, lon and dist of these two keys are filled in live from researchFocus()
    rel.splice(3, 0,
      { p: A.research - s, dLat: 0, dLon: 0, dist: -4, tilt: 4, yaw: 0, roll: 2, shift: -0.27, sat: [0.7, 3.6, -15], research: -0.5 },
      { p: A.research + s, dLat: 0, dLon: 0, dist: 3, tilt: 4, yaw: 0, roll: 0, shift: -0.27, sat: [0.9, 3.6, -15], research: 0.5 },
    );
  }
  // longitudes stay unwrapped (home.lon + offset) so interpolation never jumps the date line
  return rel.map(({ dLat, dLon, ...k }) => ({ ...k, lat: Math.max(-85, Math.min(85, HOME.lat + dLat)), lon: HOME.lon + dLon }));
}

const GROUND: GroundKey[] = [
  { p: SWITCH_AT, pos: [0, 640, 1250], look: [0, 330, 520], shift: 0 },
  { p: A.projects - SPAN.projects!, pos: [40, 390, 1000], look: [0, 0, 380], shift: 0 },
  { p: A.projects + SPAN.projects!, pos: [-30, 250, 780], look: [0, 0, 180], shift: 0 },
  { p: A.toolkit, pos: [110, 150, 470], look: [0, 30, 60], shift: 0.2 },
  { p: A.contact, pos: [60, 62, 210], look: [0, 55, 0], shift: 0.2 },
  { p: 1, pos: [50, 55, 175], look: [0, 60, 0], shift: 0.2 },
];

/* scans: each section is a satellite pass that paints a segmentation mask */
type Pass =
  | { kind: "orbit"; spec: ScanSpec; dur: number }
  | { kind: "ground"; x: number; w: number; z0: number; z1: number; dur: number };
/** a scan near home; for a coastal home it is mirrored, if need be, so it is not all sea */
const scanNear = (dLat: number, dLon: number, w: number, l: number): ScanSpec => {
  const tries = [[dLat, dLon], [dLat, -dLon], [-dLat, dLon], [-dLat, -dLon]];
  const landy = ([a, b]: number[]) => {
    const c = nearHome(a, b);
    let n = 0;
    for (const [u, v] of [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) if (isLand(c.lat + u * l, c.lon + v * w)) n++;
    return n;
  };
  const best = tries.reduce((m, t) => (landy(t) > landy(m) ? t : m), tries[0]);
  return { ...nearHome(best[0], best[1]), w, l };
};
export const PASSES: Partial<Record<SectionId, Pass>> = {
  about: { kind: "orbit", spec: scanNear(1.28, 2.34, 3.6, 5.2), dur: 2.8 },
  experience: { kind: "orbit", spec: scanNear(0.28, 0.74, 2.4, 3.4), dur: 2.6 },
  flagship: { kind: "orbit", spec: scanNear(0.08, 0.04, 1.5, 2.2), dur: 2.4 },
  projects: { kind: "ground", x: 0, w: 330, z0: 980, z1: 160, dur: 3.4 },
  toolkit: { kind: "ground", x: 0, w: 230, z0: 520, z1: -60, dur: 3 },
  contact: { kind: "ground", x: 0, w: 140, z0: 170, z1: -170, dur: 2.6 },
};

/* full-screen cloud layer used for the re-entry */
const overlayFrag = /* glsl */ `
  uniform float uAmt;
  uniform float uTime;
  uniform vec2 uAspect;
  uniform float uDawn;   // where the dawn is across the screen: -1 left, 1 right
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 p = (vUv - 0.5) * uAspect;
    float zoom = 1.6 + uAmt * 2.2;
    float n = fbm2(p * zoom + vec2(0.0, uTime * 0.05) + 3.0);
    float n2 = fbm2(p * zoom * 2.3 - vec2(uTime * 0.03, 0.0));
    float d = mix(n, n2, 0.4);
    float r = length(p);
    float cover = smoothstep(0.0, 1.0, uAmt * 1.6 - 0.35 + (d - 0.5) * 1.3 * (1.0 - uAmt) + r * 0.25 * (1.0 - uAmt));
    vec3 col = mix(vec3(0.05, 0.07, 0.12), vec3(0.2, 0.23, 0.31), smoothstep(0.3, 0.8, d));
    float glow = smoothstep(0.3, 1.0, uDawn >= 0.0 ? vUv.x : 1.0 - vUv.x) * mix(0.4, 1.0, abs(uDawn));
    col += vec3(0.55, 0.27, 0.14) * glow * smoothstep(0.4, 0.8, d) * 0.35;
    gl_FragColor = vec4(col, cover);
    #include <colorspace_fragment>
  }
`;

/** an HTML label pinned to a point in the world: the home city, a publication venue (index into VENUES) or the landing beacon */
export type GeoLabel = { el: HTMLElement; kind: "home" | "venue" | "beacon"; index?: number };

export class World {
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private orbitScene = new THREE.Scene();
  private groundScene = new THREE.Scene();
  private overlayScene = new THREE.Scene();
  private overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private overlayMat: THREE.ShaderMaterial;
  private composer?: EffectComposer;
  private renderPass?: RenderPass;
  private bloom?: UnrealBloomPass;
  private globe: Globe;
  private sat: Satellite;
  private ground: Ground;
  // home is on the night side, with dawn coming up from the east (see sunDirection)
  private sun = sunDirection(HOME.lat, HOME.lon);
  private labels: GeoLabel[] = [];
  private labelPos: { home: THREE.Vector3; venues: THREE.Vector3[]; beacon: THREE.Vector3 };
  private orbitKeys: OrbitKey[];
  private paper = -1;
  private focus = { lat: HOME.lat, lon: HOME.lon, dist: 400 };
  private focusV = new THREE.Vector3();
  private focusDist = 400;

  private raf = 0;
  private running = false;
  private t0 = performance.now();
  private lastT = 0;
  private dt = 1 / 60;
  private target = 0;
  private progress = 0;
  private intro = 1;
  private pointer = new THREE.Vector2();
  private ps = new THREE.Vector2();
  private satLocal = new THREE.Vector3();
  private satReady = false;
  private section: SectionId | "hero" = "hero";
  private passStart = -100;
  private passAmt = 0;
  private arcAmt = 0;
  private agentAmt = 0;
  private fov: number;
  private frameN = 0;
  private slow = 0;
  private level = 0;
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  perf = { logic: 0, total: 0 };
  /** development aid: override the interpolated orbit pose */
  debugKey?: Partial<OrbitKey>;

  onTelemetry?: (t: Telemetry) => void;
  onDegrade?: (level: number) => void;

  constructor(canvas: HTMLCanvasElement, private opts: { mobile: boolean; reduce: boolean; hq: boolean; parts: number; research: boolean }) {
    this.orbitKeys = buildOrbit(opts.research);
    const f0 = researchFocus(-1);
    this.focusV.copy(f0.c);
    this.focusDist = focusView(f0).dist;
    this.focus = focusView(f0);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.mobile, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.mobile ? 1.25 : 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    // clear to black and let the scene carry its colour: a non-black clear
    // colour was being encoded twice on the post-processing path
    this.renderer.setClearColor(0x000000, 1);
    this.orbitScene.background = new THREE.Color("#02040b");
    this.fov = opts.mobile ? 52 : 40;
    this.camera = new THREE.PerspectiveCamera(this.fov, window.innerWidth / window.innerHeight, 0.05, 8000);

    // orbit world
    this.globe = new Globe(this.sun, { mobile: opts.mobile });
    this.orbitScene.add(this.globe.group);
    this.sat = new Satellite(opts.parts);
    this.orbitScene.add(this.sat.root, this.sat.beam);
    const sunLight = new THREE.DirectionalLight(0xffe2c4, 3.2);
    sunLight.position.copy(this.sun).multiplyScalar(500);
    this.orbitScene.add(sunLight, sunLight.target);
    this.orbitScene.add(new THREE.HemisphereLight(0x6a8cc8, 0x2a1a10, 0.9));
    const earthshine = new THREE.PointLight(0xff9a50, 30, 60, 1.5);
    this.camera.add(earthshine);
    earthshine.position.set(0, -6, -6);
    this.orbitScene.add(this.camera);
    this.globe.starMat.uniforms.uPR.value = this.renderer.getPixelRatio();

    // ground world
    this.ground = new Ground({ mobile: opts.mobile }, this.sun);
    this.groundScene.add(this.ground.group);

    // overlay
    this.overlayMat = new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: overlayFrag,
      uniforms: { uAmt: { value: 0 }, uTime: { value: 0 }, uAspect: { value: new THREE.Vector2(1, 1) }, uDawn: { value: 1 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.overlayMat);
    quad.frustumCulled = false;
    this.overlayScene.add(quad);

    this.labelPos = {
      home: dir(HOME.lat, HOME.lon).multiplyScalar(R * 1.012),
      venues: VENUES.map((v) => dir(v.lat, v.lon).multiplyScalar(R * 1.012)),
      beacon: new THREE.Vector3(0, this.ground.beaconY + 62, 0),
    };

    if (!opts.mobile && !opts.reduce && !/[?&]nobloom\b/.test(location.search)) {
      this.composer = new EffectComposer(this.renderer);
      this.renderPass = new RenderPass(this.orbitScene, this.camera);
      this.composer.addPass(this.renderPass);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.4, 0.0, 0.86);
      // only the tight mips: city lights and the beacon glow, no haze across the sky
      this.bloom.compositeMaterial.uniforms.bloomFactors.value = [1.0, 0.7, 0.25, 0.0, 0.0];
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.resize();
  }

  /* ---------------- inputs from the page ---------------- */
  setProgress(p: number) { this.target = Math.min(1, Math.max(0, p)); }
  setIntro(v: number) { this.intro = v; }
  setPointer(x: number, y: number) { this.pointer.set(x, y); }
  setLabels(l: GeoLabel[]) { this.labels = l; }
  setPaper(i: number) { this.paper = i; this.globe.setPaper(i); }
  setAgent(i: number) { this.sat.activeAgent = i; }
  setSection(id: SectionId | "hero") {
    if (id === this.section) return;
    const prev = PASSES[this.section as SectionId];
    this.section = id;
    const next = PASSES[id as SectionId];
    if (next && next !== prev) this.passStart = this.now();
  }

  private now() { return (performance.now() - this.t0) / 1000; }

  /* ---------------- camera ---------------- */
  private orbitPose(p: number) {
    const ORBIT = this.orbitKeys;
    let i = 0;
    while (i < ORBIT.length - 2 && p > ORBIT[i + 1].p) i++;
    const a = this.live(ORBIT[i]), b = this.live(ORBIT[i + 1]);
    const u = ease(Math.min(1, Math.max(0, (p - a.p) / (b.p - a.p))));
    const k: OrbitKey = {
      p, lat: lerp(a.lat, b.lat, u), lon: lerp(a.lon, b.lon, u), dist: lerp(a.dist, b.dist, u),
      tilt: lerp(a.tilt, b.tilt, u), yaw: lerp(a.yaw, b.yaw, u), roll: lerp(a.roll, b.roll, u), shift: lerp(a.shift, b.shift, u),
      sat: [lerp(a.sat[0], b.sat[0], u), lerp(a.sat[1], b.sat[1], u), lerp(a.sat[2], b.sat[2], u)],
    };
    if (this.debugKey) Object.assign(k, this.debugKey);
    // the intro: drift in from deep space
    const e = ease(this.intro);
    if (e < 1) {
      k.dist = lerp(k.dist * 3.4, k.dist, e);
      k.yaw = lerp(k.yaw - 28, k.yaw, e);
      k.tilt = lerp(k.tilt * 0.35, k.tilt, e);
      k.lon = lerp(k.lon - 26, k.lon, e);
      k.shift = lerp(0, k.shift, e);
      k.sat = [k.sat[0] + (1 - e) * 9, k.sat[1] + (1 - e) * 5, k.sat[2]];
    }
    return k;
  }

  /** research keys take their position from the live research focus */
  private live(k: OrbitKey): OrbitKey {
    if (k.research === undefined) return k;
    const f = this.focus;
    return { ...k, lat: f.lat, lon: f.lon + k.research, dist: f.dist + k.dist };
  }

  /** ease the research focus toward the paper in view */
  private updateFocus() {
    const f = researchFocus(this.paper);
    if (!this.opts.mobile && window.innerWidth >= 900) {
      const ll = latLonOf(f.c);
      f.c = f.c.clone().addScaledVector(tangents(ll.lat, ll.lon).east, Math.tan(THREE.MathUtils.degToRad(NUDGE))).normalize();
    }
    const want = focusView(f);
    const k = this.opts.reduce ? 1 : 1 - Math.exp(-this.dt * 1.6);
    this.focusV.lerp(f.c, k).normalize();
    this.focusDist += (want.dist - this.focusDist) * k;
    const v = focusView({ c: this.focusV, spread: f.spread });
    this.focus = { lat: v.lat, lon: v.lon, dist: this.focusDist };
  }

  private placeOrbit(k: OrbitKey) {
    const c = dir(k.lat, k.lon);
    const { east, north } = tangents(k.lat, k.lon);
    const yaw = THREE.MathUtils.degToRad(k.yaw);
    const n2 = north.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(east, Math.sin(yaw));
    const tilt = THREE.MathUtils.degToRad(k.tilt);
    const down = c.clone().negate();
    const fwd = down.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(n2, Math.sin(tilt));
    const up = n2.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(c, Math.sin(tilt));
    this.camera.position.copy(c).multiplyScalar(k.dist);
    this.camera.up.copy(up);
    this.camera.lookAt(this.tmpA.copy(this.camera.position).add(fwd));
    this.camera.rotateZ(THREE.MathUtils.degToRad(k.roll));
  }

  private groundPose(p: number) {
    let i = 0;
    while (i < GROUND.length - 2 && p > GROUND[i + 1].p) i++;
    const a = GROUND[i], b = GROUND[i + 1];
    const u = ease(Math.min(1, Math.max(0, (p - a.p) / (b.p - a.p))));
    const pos = new THREE.Vector3(...a.pos).lerp(new THREE.Vector3(...b.pos), u);
    const look = new THREE.Vector3(...a.look).lerp(new THREE.Vector3(...b.look), u);
    return { pos, look, shift: lerp(a.shift, b.shift, u) };
  }

  private applyShift(shift: number) {
    const w = window.innerWidth, h = window.innerHeight;
    const s = this.opts.mobile || w < 900 ? 0 : shift;
    this.camera.setViewOffset(w, h, -s * w, 0, w, h);
  }

  private pointerTilt() {
    if (this.opts.reduce) return;
    this.camera.rotateY(-this.ps.x * 0.035);
    this.camera.rotateX(this.ps.y * 0.022);
  }

  /* ---------------- loop ---------------- */
  private frame = () => {
    this.raf = requestAnimationFrame(this.frame);
    const f0 = performance.now();
    const t = this.now();
    this.dt = Math.min(0.25, Math.max(0.001, t - this.lastT));
    this.lastT = t;
    this.frameN++;
    this.adapt(t);

    const k = this.opts.reduce ? 1 : 1 - Math.exp(-this.dt * 3.2);
    this.progress += (this.target - this.progress) * k;
    if (Math.abs(this.target - this.progress) < 1e-5) this.progress = this.target;
    this.ps.lerp(this.pointer, 1 - Math.exp(-this.dt * 2.5));
    const p = this.progress;
    const orbit = p < SWITCH_AT;

    // pass state
    const pass = PASSES[this.section as SectionId];
    const passT = this.opts.reduce ? 1 : Math.min(1, (t - this.passStart) / (pass?.dur ?? 1));
    const want = pass && (pass.kind === "orbit") === orbit ? 1 : 0;
    this.passAmt += (want - this.passAmt) * (1 - Math.exp(-this.dt * 3));
    this.arcAmt += ((this.section === "research" ? 1 : 0) - this.arcAmt) * (1 - Math.exp(-this.dt * 3));
    this.agentAmt += ((this.section === "flagship" ? 1 : 0) - this.agentAmt) * (1 - Math.exp(-this.dt * 3));

    let scene: THREE.Scene;
    let tele: Telemetry;
    this.updateFocus();
    if (orbit) {
      scene = this.orbitScene;
      this.camera.near = 0.05; this.camera.far = 8000;
      const key = this.orbitPose(p);
      this.placeOrbit(key);
      this.applyShift(key.shift);
      this.pointerTilt();
      this.camera.updateMatrixWorld();

      // satellite rides in the camera's frame so it never falls behind
      const want3 = this.tmpA.set(key.sat[0] + this.ps.x * 0.5, key.sat[1] + Math.sin(t * 0.6) * 0.15 + this.ps.y * 0.3, key.sat[2]);
      if (this.opts.mobile) want3.set(want3.x * 0.4, want3.y + 1.2, want3.z - 2);
      if (!this.satReady) { this.satLocal.copy(want3); this.satReady = true; }
      this.satLocal.lerp(want3, 1 - Math.exp(-this.dt * 3));
      this.sat.root.position.copy(this.satLocal).applyMatrix4(this.camera.matrixWorld);
      const fade = 1 - smooth(0.53, 0.575, p);
      this.sat.root.visible = fade > 0.01;
      this.sat.root.scale.setScalar(0.3 * fade + 0.0001);
      this.sat.orient(new THREE.Vector3(0, 0, 0), this.sun, t);
      this.sat.agentAmt = this.agentAmt;
      this.sat.update(t, this.dt);

      const diveFade = 1 - smooth(0.512, 0.545, p);
      if (pass?.kind === "orbit") {
        this.globe.setScan(pass.spec, ease(passT), this.passAmt * diveFade);
        this.globe.sweepEnds(pass.spec, ease(passT), this.tmpA, this.tmpB);
        this.sat.root.updateMatrixWorld(true);
        this.sat.setBeam(this.tmpA, this.tmpB, this.passAmt * (passT < 1 ? 1 : 0.35) * fade * diveFade);
      } else {
        // the last mask fades out with the pass, but never lingers into the dive
        this.globe.mat.uniforms.uScanAmt.value = this.passAmt * diveFade;
        this.sat.setBeam(this.tmpA, this.tmpB, 0);
      }
      this.globe.mat.uniforms.uHaze.value = smooth(0.515, 0.585, p) * 0.85;
      this.globe.arcAmt = this.arcAmt;
      this.globe.arcVis = smooth(200, 300, key.dist);
      this.globe.mat.uniforms.uGrid.value = 0.022 + this.arcAmt * 0.05;
      this.globe.update(t, this.dt, this.camera, this.opts.reduce);

      const ll = latLonOf(this.camera.position);
      tele = { altKm: (this.camera.position.length() - R) * KM_PER_UNIT, lat: ll.lat, lon: wrapLon(ll.lon) };
    } else {
      scene = this.groundScene;
      this.camera.near = 1; this.camera.far = 9000;
      const g = this.groundPose(p);
      this.camera.position.copy(g.pos);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(g.look);
      this.applyShift(g.shift);
      this.pointerTilt();
      this.camera.updateMatrixWorld();
      if (pass?.kind === "ground") this.ground.setScan(pass.x, pass.w, pass.z0, pass.z1, ease(passT), this.passAmt);
      else this.ground.terrainMat.uniforms.uScanAmt.value = this.passAmt;
      this.ground.beacon.target = this.section === "contact" ? 1 : this.section === "toolkit" ? 0.5 : 0;
      this.ground.markers.target = this.section === "toolkit" ? 1 : 0;
      this.ground.cloudMat.uniforms.uAmt.value = 1;
      this.ground.setCamera(this.camera.position);
      this.ground.update(t, this.dt, this.opts.reduce);
      const cg = toGeo(this.camera.position.x, this.camera.position.z);
      const lat = HOME.lat - (cg.z * M_PER_UNIT) / 111000;
      const lon = wrapLon(HOME.lon + (cg.x * M_PER_UNIT) / (111000 * Math.max(0.05, Math.cos((HOME.lat * Math.PI) / 180))));
      tele = { altKm: (this.camera.position.y * M_PER_UNIT) / 1000, lat, lon };
    }
    this.camera.updateProjectionMatrix();

    // re-entry cloud layer
    const ov = smooth(0.53, 0.588, p) * (1 - smooth(0.606, 0.655, p));
    this.overlayMat.uniforms.uAmt.value = ov;
    if (ov > 0.002) {
      // the dawn side of the cloud layer follows the sun: right of the camera or left
      const right = this.tmpA.setFromMatrixColumn(this.camera.matrixWorld, 0);
      const dawn = orbit ? this.tmpB.copy(this.sun).addScaledVector(this.camera.position.clone().normalize(), -this.sun.dot(this.camera.position.clone().normalize())) : this.tmpB.copy(this.ground.east);
      this.overlayMat.uniforms.uDawn.value = THREE.MathUtils.clamp(right.dot(dawn.normalize()) * 1.6, -1, 1);
    }
    this.overlayMat.uniforms.uTime.value = this.opts.reduce ? 0 : t;

    this.updateLabels(orbit);
    if (this.frameN % 3 === 0) this.onTelemetry?.(tele);

    const f1 = performance.now();
    if (this.composer && this.renderPass) {
      this.renderPass.scene = scene;
      this.composer.render();
    } else {
      this.renderer.render(scene, this.camera);
    }
    if (ov > 0.002) {
      this.renderer.autoClear = false;
      this.renderer.render(this.overlayScene, this.overlayCam);
      this.renderer.autoClear = true;
    }
    const f2 = performance.now();
    this.perf.logic += ((f1 - f0) - this.perf.logic) * 0.05;
    this.perf.total += ((f2 - f0) - this.perf.total) * 0.05;
  };

  private updateLabels(orbit: boolean) {
    const w = window.innerWidth, h = window.innerHeight;
    const v = this.tmpB;
    for (const l of this.labels) {
      let amt = 0;
      const pos = l.kind === "home" ? this.labelPos.home : l.kind === "beacon" ? this.labelPos.beacon : this.labelPos.venues[l.index ?? 0];
      if (!pos) continue;
      if (l.kind === "beacon") amt = orbit ? 0 : this.ground.beacon.amt * (this.section === "contact" ? 1 : 0);
      else if (orbit) {
        const pin = this.globe.pins[l.kind === "home" ? 0 : 1 + (l.index ?? 0)];
        amt = pin.on * this.globe.arcVis;
        // hide when on the far side of the globe
        const facing = this.tmpA.copy(this.camera.position).sub(pos).normalize().dot(pos.clone().normalize());
        amt *= smooth(0.0, 0.15, facing);
      }
      if (amt < 0.02) { if (l.el.style.opacity !== "0") l.el.style.opacity = "0"; continue; }
      v.copy(pos).project(this.camera);
      if (v.z > 1) { l.el.style.opacity = "0"; continue; }
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      if (l.kind !== "beacon") {
        // labels on the right half sit to the left of their pin: clear of the
        // research panel on desktop, inside the screen on a phone
        const thr = w >= 900 ? w * 0.455 - 150 : w - 150;
        const flipped = l.el.classList.contains("geo__l--flip");
        if (!flipped && x > thr + 12) l.el.classList.add("geo__l--flip");
        else if (flipped && x < thr - 12) l.el.classList.remove("geo__l--flip");
      }
      l.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      l.el.style.opacity = amt.toFixed(2);
    }
  }

  /** adaptive quality: drop bloom, then resolution and glass blur, if frames stay slow */
  private adapt(t: number) {
    if (this.opts.hq || t < 3 || this.level >= 3) return;
    this.slow = this.dt > 0.034 ? this.slow + 1 : Math.max(0, this.slow - 2);
    if (this.slow < 75) return;
    this.slow = 0;
    this.level++;
    if (this.level === 1 && this.composer) {
      this.composer.dispose();
      this.composer = undefined;
    } else {
      if (this.level === 1) this.level = 2;
      const pr = this.level === 2 ? 1 : 0.75;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, pr));
      this.globe.starMat.uniforms.uPR.value = this.renderer.getPixelRatio();
      this.resize();
    }
    this.onDegrade?.(this.level);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.t0 = performance.now();
    this.lastT = 0;
    this.frame();
  }

  /** compile both worlds behind the loader so the first scroll doesn't hitch */
  warm() {
    this.camera.updateMatrixWorld();
    this.renderer.compile(this.orbitScene, this.camera);
    this.renderer.compile(this.groundScene, this.camera);
    this.renderer.compile(this.overlayScene, this.overlayCam);
    this.placeOrbit(this.orbitPose(0));
    this.camera.updateMatrixWorld();
    this.renderer.render(this.orbitScene, this.camera);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? this.fov + 10 : this.fov;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.overlayMat.uniforms.uAspect.value.set(w / h, 1);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.running = false;
    const kill = (s: THREE.Scene) => s.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
    });
    kill(this.orbitScene); kill(this.groundScene); kill(this.overlayScene);
    (this.globe.mat.uniforms.uMap.value as THREE.Texture).dispose();
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
