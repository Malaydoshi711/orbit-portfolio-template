import * as THREE from "three";
import { NOISE, CLASS_GLSL } from "./glsl";
import { R, dir, paintEarth, tangents, HOME, VENUES } from "./geo";
import { HOME_RGB, SCAN_RGB } from "./palette";

/* ------------------------------------------------------------------ */
/* Night-side Earth: land mask + city lights + twilight + scan sweep    */
/* ------------------------------------------------------------------ */
const globeVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vUv = uv;
    vN = normalize(position);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const globeFrag = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uSun;
  uniform float uTime;
  uniform vec3 uScanC, uScanE, uScanN;
  uniform float uScanW, uScanL, uScanP, uScanAmt;
  uniform float uGrid;
  uniform float uDetail;
  uniform float uHaze;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vW;
  ${NOISE}
  ${CLASS_GLSL}

  float lightsAt(vec3 n, float scale, float prob, float seed) {
    vec3 p = n * scale;
    vec3 c = floor(p);
    vec3 f = fract(p);
    float h = hash13(c + seed);
    vec3 o = vec3(hash13(c + 3.1 + seed), hash13(c + 7.7 + seed), hash13(c + 1.9 + seed)) * 0.7 + 0.15;
    vec3 dv = f - o;
    dv -= n * dot(dv, n);
    float d = length(dv);
    float px = length(fwidth(p));
    // lights are point sources: a near-constant size on screen, so a coarse
    // octave never swells into a disc when the camera dives in close
    float r = min(px * (0.6 + 0.8 * hash13(c + 5.5)), 0.3);
    float dotv = smoothstep(r + px * 0.7, r * 0.2, d) * (0.55 + 0.45 * hash13(c + 2.2));
    float on = step(h, prob);
    return mix(dotv * on, prob * 0.05, smoothstep(0.22, 0.55, px));
  }

  /* the land field before thresholding: painted mask + noise that roughens the
   * coastline. Fine octaves fade in only once they span enough pixels, so the
   * coast keeps gaining detail all the way down instead of going soft. They act
   * only inside the mask's soft coastal band, so no stray islands appear at sea. */
  float coastDetail(vec3 n, float mr, float pxr, int octaves) {
    float band = smoothstep(0.0, 0.4, mr) * (1.0 - smoothstep(0.6, 1.0, mr));
    if (band <= 0.0) return 0.0;
    float d = 0.0, f = 60.0, a = 1.0;
    for (int i = 0; i < 6; i++) {
      if (i >= octaves) break;
      float vis = 1.0 - smoothstep(0.07, 0.2, pxr * f);
      if (vis <= 0.0) break;
      d += (vnoise3(n * f + float(i) * 13.7) - 0.5) * a * vis;
      f *= 2.6; a *= 0.42;
    }
    return d * band;
  }
  float landField(vec3 n, vec4 m, float nz, float nz2, float pxr, int octaves) {
    return m.r + (nz - 0.5) * 0.42 + (nz2 - 0.5) * 0.16 * uDetail + coastDetail(n, m.r, pxr, octaves);
  }

  /* the classifier: one class per raster cell (0 water, 1 vegetation, 2 built-up, 3 exposed slope) */
  float classAt(vec2 q) {
    vec3 qn = normalize(uScanC + uScanE * q.x + uScanN * q.y);
    vec2 quv = vec2(atan(-qn.z, qn.x) * 0.15915494 + 0.5, asin(clamp(qn.y, -1.0, 1.0)) * 0.31830989 + 0.5);
    vec4 m = textureLod(uMap, quv, 0.0);
    float nz = fbm3(qn * 16.0);
    float nz2 = vnoise3(qn * 64.0);
    float field = m.r + (nz - 0.5) * 0.42 + (nz2 - 0.5) * 0.16 * uDetail + coastDetail(qn, m.r, 0.0, 2);
    if (field < 0.5) return 0.0;
    float urban = m.g * (0.45 + 1.1 * nz2) * (0.7 + 0.6 * nz);
    if (urban + (vnoise3(qn * 150.0) - 0.5) * 0.5 + (nz2 - 0.5) * 0.25 > 0.36) return 2.0;
    if (m.b * 0.7 + vnoise3(qn * 26.0 + 4.0) + (nz2 - 0.5) * 0.3 > 0.72) return 3.0;
    return 1.0;
  }
  vec3 classColor(float c) {
    return c < 0.5 ? C_WATER : c < 1.5 ? C_VEG : c < 2.5 ? C_URBAN : C_SLOPE;
  }

  void main() {
    vec3 n = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    vec4 m = texture2D(uMap, vUv);
    float pxr = length(fwidth(n));
    float nz = fbm3(n * 16.0);
    float nz2 = vnoise3(n * 64.0);
    float field = landField(n, m, nz, nz2, pxr, uDetail < 1.0 ? 4 : 6);
    // screen-space edge width: the coastline stays crisp at every altitude
    float fw = clamp(fwidth(field) * 0.9, 1e-4, 0.03);
    float land = smoothstep(0.5 - fw, 0.5 + fw, field);
    float urban = m.g * (0.45 + 1.1 * nz2) * (0.7 + 0.6 * nz);
    float arid = m.b;
    float lat = asin(clamp(n.y, -1.0, 1.0));

    float sunD = dot(n, uSun);
    float day = smoothstep(-0.06, 0.32, sunD);
    float twi = smoothstep(-0.28, 0.0, sunD) * (1.0 - smoothstep(0.02, 0.3, sunD));

    // close-range ground texture: ridges and field patterns that only show once resolvable
    float near = 1.0 - smoothstep(0.003, 0.012, pxr * 64.0);
    float ridge = 0.0;
    if (near > 0.0) ridge = (1.0 - abs(vnoise3(n * 900.0) * 2.0 - 1.0)) * 0.6 + vnoise3(n * 2600.0) * 0.4;

    vec3 ocean = vec3(0.008, 0.035, 0.085);
    vec3 veg = vec3(0.075, 0.105, 0.06);
    vec3 sand = vec3(0.34, 0.25, 0.15);
    float ice = smoothstep(1.08, 1.2, abs(lat)) * land;
    vec3 landC = mix(veg, sand, clamp(arid + (nz2 - 0.5) * 0.35, 0.0, 1.0)) * (0.75 + 0.5 * nz);
    landC = mix(landC, vec3(0.75, 0.8, 0.85), ice);
    vec3 alb = mix(ocean, landC, land);

    vec3 col = alb * vec3(1.0, 0.88, 0.74) * max(sunD, 0.0) * 1.5;
    vec3 H = normalize(uSun + V);
    col += (1.0 - land) * pow(max(dot(n, H), 0.0), 60.0) * 0.55 * day * vec3(1.0, 0.75, 0.5);
    // moonlit night side: land barely lighter than the sea, with some texture
    vec3 nightLand = vec3(0.016, 0.02, 0.03) * (0.6 + 0.8 * nz) * (1.0 + near * (ridge - 0.5) * 0.9);
    col += mix(vec3(0.004, 0.01, 0.024), nightLand, land) * (1.0 - day);
    // a faint lit shoreline, so the coast reads on the night side up close
    float shore = (1.0 - smoothstep(0.0, fw * 3.0, abs(field - 0.5))) * near;
    col += vec3(0.05, 0.09, 0.14) * shore * (1.0 - day);
    col += vec3(0.6, 0.22, 0.07) * twi * 0.08;

    // city lights; up close they follow a road-like network instead of raining evenly
    float up = urban * sqrt(max(urban, 0.0));
    float roads = 1.0;
    if (near > 0.0) roads = mix(1.0, 0.25 + 2.4 * smoothstep(0.78, 0.96, 1.0 - abs(vnoise3(n * 380.0 + 5.0) * 2.0 - 1.0)), near);
    float lights = lightsAt(n, 240.0, (up * 1.3 + 0.018) * mix(1.0, roads, 0.7), 0.0)
                 + 0.75 * lightsAt(n, 620.0, (up * 1.5 + 0.012) * roads, 9.0) * uDetail
                 + 0.6 * lightsAt(n, 1500.0, (up * 1.6 + 0.01) * roads, 3.0) * uDetail;
    if (near > 0.0) lights += 0.5 * near * lightsAt(n, 4200.0, (up * 1.8 + 0.006) * roads, 6.0);
    lights = lights * land + urban * urban * urban * 0.12 * land;
    lights *= 1.0 - smoothstep(-0.12, 0.12, sunD);
    col += vec3(1.0, 0.6, 0.26) * lights * 1.15;

    // graticule
    float latD = lat * 57.2958;
    float lonD = atan(-n.z, n.x) * 57.2958;
    float gr = max(lineAA(latD / 10.0, 0.75), lineAA(lonD / 10.0, 0.75));
    col += C_SCAN * gr * uGrid * (0.3 + 0.7 * (1.0 - day)) * (1.0 - near);

    // ---- satellite pass: a classified raster painted behind the sweep ----
    float su = dot(n, uScanE), sv = dot(n, uScanN), sc = dot(n, uScanC);
    float front = step(0.0, sc) * uScanAmt;
    float fu = max(fwidth(su), 1e-6), fv = max(fwidth(sv), 1e-6);
    float inU = 1.0 - smoothstep(uScanW - fu, uScanW + fu, abs(su));
    float inL = 1.0 - smoothstep(uScanL - fv, uScanL + fv, abs(sv));
    float sweep = mix(-uScanL, uScanL, uScanP);
    float painted = inU * inL * (1.0 - smoothstep(sweep - fv, sweep + fv, sv)) * front;
    if (painted > 0.001) {
      float cs = uScanW / 13.0;
      vec2 cell = floor(vec2(su, sv) / cs);
      float c0 = classAt((cell + 0.5) * cs);
      float cR = classAt((cell + vec2(1.5, 0.5)) * cs);
      float cT = classAt((cell + vec2(0.5, 1.5)) * cs);
      vec2 fr = fract(vec2(su, sv) / cs);
      // crisp 1px class boundaries on the shared cell edges
      float eR = (1.0 - smoothstep(0.4, 1.4, (1.0 - fr.x) * cs / fu)) * step(0.5, abs(cR - c0));
      float eT = (1.0 - smoothstep(0.4, 1.4, (1.0 - fr.y) * cs / fv)) * step(0.5, abs(cT - c0));
      vec3 cc = classColor(c0);
      float fill = c0 < 0.5 ? 0.22 : 0.42;
      col = col * (1.0 - fill * 0.6 * painted) + cc * fill * 0.32 * painted;
      col += cc * max(eR, eT) * painted * 0.75;
    }
    float gu = uScanW / 4.0;
    float pg = max(lineAA(su / gu, 0.7), lineAA(sv / gu, 0.7));
    col += C_SCAN * pg * painted * 0.12;
    float border = (1.0 - smoothstep(0.0, fu * 1.6, abs(abs(su) - uScanW))) * step(abs(sv), uScanL) * front;
    col += C_SCAN * border * (0.35 + 0.5 * painted);
    float cap = (1.0 - smoothstep(0.0, fv * 1.6, abs(abs(sv) - uScanL))) * step(abs(su), uScanW) * front;
    col += C_SCAN * cap * 0.4;
    float live = 1.0 - step(0.999, uScanP);
    float sl = exp(-abs(sv - sweep) / max(uScanW * 0.02, 1e-4)) * inU * inL * front * live;
    col += C_SCAN * sl * 1.3;

    // atmosphere at grazing angles
    float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
    vec3 atm = mix(vec3(0.03, 0.08, 0.25), vec3(0.35, 0.6, 1.0), day);
    col += atm * fres * (0.18 + 0.9 * smoothstep(-0.35, 0.3, sunD));
    col += vec3(1.0, 0.45, 0.16) * fres * twi * 0.6;

    // aerial perspective during the dive: distance fades into night haze
    float hz = (1.0 - exp(-length(cameraPosition - vW) * 0.14)) * uHaze;
    col = mix(col, vec3(0.03, 0.045, 0.08), hz);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const cloudFrag = /* glsl */ `
  uniform vec3 uSun;
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vN;
  varying vec3 vW;
  ${NOISE}
  void main() {
    vec3 n = normalize(vN);
    vec3 q = n * 4.2 + vec3(uTime * 0.004, 0.0, 0.0);
    float w = fbm3(q * 1.7);
    float c = fbm3(q + w * 0.9);
    float band = 0.85 + 0.25 * cos(asin(n.y) * 6.0);
    float a = smoothstep(0.5, 0.78, c * band);
    float sunD = dot(n, uSun);
    float lit = smoothstep(-0.12, 0.35, sunD);
    float twi = smoothstep(-0.25, 0.0, sunD) * (1.0 - smoothstep(0.0, 0.25, sunD));
    // day-side clouds stay soft: a research view can look across into daylight
    vec3 col = mix(vec3(0.03, 0.045, 0.08), vec3(0.78, 0.78, 0.8), lit);
    col += vec3(1.0, 0.45, 0.18) * twi * 0.25;
    gl_FragColor = vec4(col, a * (0.45 + 0.3 * lit) * uOpacity);
    #include <colorspace_fragment>
  }
`;

const atmoVert = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const atmoFrag = /* glsl */ `
  uniform vec3 uSun;
  uniform float uR, uH, uAmt;
  varying vec3 vW;
  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vW - ro);
    float t = max(-dot(ro, rd), 0.0);
    vec3 cp = ro + rd * t;
    float b = length(cp);
    float h = max(b - uR, 0.0);
    float g = exp(-h / uH);
    vec3 sn = normalize(cp);
    float s = dot(sn, uSun);
    vec3 col = mix(vec3(0.02, 0.06, 0.2), vec3(0.3, 0.58, 1.0), smoothstep(-0.25, 0.45, s));
    col += vec3(1.0, 0.42, 0.13) * exp(-pow(s / 0.2, 2.0)) * 0.95;
    float a = g * (0.22 + 1.1 * smoothstep(-0.4, 0.35, s)) * uAmt;
    gl_FragColor = vec4(col * a, 1.0);
    #include <colorspace_fragment>
  }
`;

const starVert = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  uniform float uTime;
  uniform float uPR;
  varying float vA;
  varying vec3 vC;
  varying float vB;
  void main() {
    vB = aSize > 4.0 ? 1.0 : 0.62;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = 0.75 + 0.25 * sin(uTime * (0.6 + aSeed * 2.0) + aSeed * 40.0);
    vA = tw;
    vC = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.7), fract(aSeed * 7.3));
    gl_PointSize = aSize * uPR;
  }
`;
const starFrag = /* glsl */ `
  uniform float uAmt;
  varying float vA;
  varying vec3 vC;
  varying float vB;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    float a = smoothstep(1.0, 0.0, d);
    a *= a;
    gl_FragColor = vec4(vC * a * vA * uAmt * vB, 1.0);
    #include <colorspace_fragment>
  }
`;

const glowFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = (exp(-d * d * 9.0) * 0.9 + exp(-d * 3.2) * 0.25) * smoothstep(1.0, 0.85, d) * uAlpha;
    gl_FragColor = vec4(uColor * a, 1.0);
    #include <colorspace_fragment>
  }
`;
const uvVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const arcFrag = /* glsl */ `
  uniform float uDraw;
  uniform float uAlpha;
  uniform float uTime;
  uniform vec3 uA, uB;
  varying vec2 vUv;
  void main() {
    float x = vUv.x;
    float vis = 1.0 - smoothstep(uDraw - 0.004, uDraw, x);
    float head = exp(-abs(x - uDraw) * 60.0) * step(0.001, uDraw) * (1.0 - step(0.999, uDraw));
    float pulse = 0.65 + 0.35 * sin(x * 60.0 - uTime * 6.0);
    vec3 c = mix(uA, uB, x);
    float a = (vis * (0.55 + 0.25 * pulse) + head * 2.2) * uAlpha;
    gl_FragColor = vec4(c * a, 1.0);
    #include <colorspace_fragment>
  }
`;

export type ScanSpec = { lat: number; lon: number; w: number; l: number };

type Arc = { mat: THREE.ShaderMaterial; draw: number; target: number; alpha: number };
type Pin = { g: THREE.Group; ring: THREE.Mesh; pulse: THREE.Mesh; mats: THREE.Material[]; on: number; target: number; pos: THREE.Vector3 };

export class Globe {
  group = new THREE.Group();
  mat: THREE.ShaderMaterial;
  cloudMat: THREE.ShaderMaterial;
  atmoMat: THREE.ShaderMaterial;
  starMat: THREE.ShaderMaterial;
  sunMesh: THREE.Mesh;
  sunMat: THREE.ShaderMaterial;
  arcs: Arc[] = [];
  pins: Pin[] = [];
  arcAmt = 0;
  /** arcs and pins belong to the pulled-back view: hidden outright once the camera closes in */
  arcVis = 1;
  private arcTargets: number[] = VENUES.map(() => 0);
  private time = 0;

  constructor(sun: THREE.Vector3, opts: { mobile: boolean }) {
    const tex = paintEarth(opts.mobile ? 2048 : 4096);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: globeVert,
      fragmentShader: globeFrag,
      uniforms: {
        uMap: { value: tex },
        uSun: { value: sun },
        uTime: { value: 0 },
        uScanC: { value: new THREE.Vector3(1, 0, 0) },
        uScanE: { value: new THREE.Vector3(0, 0, -1) },
        uScanN: { value: new THREE.Vector3(0, 1, 0) },
        uScanW: { value: 0.1 },
        uScanL: { value: 0.1 },
        uScanP: { value: 0 },
        uScanAmt: { value: 0 },
        uGrid: { value: 0.05 },
        uDetail: { value: opts.mobile ? 0.6 : 1 },
        uHaze: { value: 0 },
      },
    });
    const seg = opts.mobile ? [128, 96] : [200, 140];
    const earth = new THREE.Mesh(new THREE.SphereGeometry(R, seg[0], seg[1]), this.mat);
    this.group.add(earth);

    this.cloudMat = new THREE.ShaderMaterial({
      vertexShader: globeVert,
      fragmentShader: cloudFrag,
      uniforms: { uSun: { value: sun }, uTime: { value: 0 }, uOpacity: { value: 1 } },
      transparent: true,
      depthWrite: false,
    });
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.006, seg[0], seg[1]), this.cloudMat);
    clouds.renderOrder = 2;
    this.group.add(clouds);

    this.atmoMat = new THREE.ShaderMaterial({
      vertexShader: atmoVert,
      fragmentShader: atmoFrag,
      uniforms: { uSun: { value: sun }, uR: { value: R }, uH: { value: 1.9 }, uAmt: { value: 1 } },
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.09, 96, 64), this.atmoMat);
    atmo.renderOrder = 3;
    this.group.add(atmo);

    // stars, denser along a galactic band
    const N = opts.mobile ? 1800 : 4200;
    const pos = new Float32Array(N * 3), size = new Float32Array(N), seed = new Float32Array(N);
    const band = new THREE.Vector3(0.3, 0.8, 0.52).normalize();
    const v = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      v.randomDirection();
      if (i % 3 === 0) { v.addScaledVector(band, -v.dot(band) * 0.85).normalize(); }
      v.multiplyScalar(2600);
      pos.set([v.x, v.y, v.z], i * 3);
      const r = Math.random();
      size[i] = 1.2 + Math.pow(r, 6) * 4.5;
      seed[i] = Math.random();
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    sg.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    sg.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    this.starMat = new THREE.ShaderMaterial({
      vertexShader: starVert,
      fragmentShader: starFrag,
      uniforms: { uTime: { value: 0 }, uPR: { value: 1 }, uAmt: { value: 1 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const stars = new THREE.Points(sg, this.starMat);
    stars.frustumCulled = false;
    stars.renderOrder = -1;
    this.group.add(stars);

    // the sun: a soft disc beyond the limb that the Earth can eclipse
    this.sunMat = new THREE.ShaderMaterial({
      vertexShader: uvVert,
      fragmentShader: glowFrag,
      uniforms: { uColor: { value: new THREE.Color(1.0, 0.78, 0.55) }, uAlpha: { value: 1 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), this.sunMat);
    this.sunMesh.position.copy(sun).multiplyScalar(1900);
    this.group.add(this.sunMesh);

    this.buildArcs();
  }

  private buildArcs() {
    const a = dir(HOME.lat, HOME.lon);
    const targets = VENUES;
    const cHome = new THREE.Color(...HOME_RGB), cScan = new THREE.Color(...SCAN_RGB);
    targets.forEach((c) => {
      const b = dir(c.lat, c.lon);
      const ang = a.angleTo(b);
      // long arcs rise higher, but not so high that they leave the frame
      const lift = R * (0.03 + Math.min(ang, 1.2) * 0.22 + Math.max(0, ang - 1.2) * 0.08);
      // rotate home toward the venue along the great circle. For a venue on the
      // far side of the planet (nearly antipodal) any great circle will do, so
      // the arc goes over the pole nearest to home, which keeps it in view.
      const axis = new THREE.Vector3().crossVectors(a, b);
      if (axis.lengthSq() < 1e-6) axis.crossVectors(a, tangents(HOME.lat, HOME.lon).north.multiplyScalar(HOME.lat >= 0 ? 1 : -1));
      axis.normalize();
      const pts: THREE.Vector3[] = [];
      const q = new THREE.Quaternion();
      for (let i = 0; i <= 64; i++) {
        const t = i / 64;
        const p = a.clone().applyQuaternion(q.setFromAxisAngle(axis, ang * t));
        p.multiplyScalar(R * 1.004 + lift * Math.sin(Math.PI * t));
        pts.push(p);
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, 128, 0.22, 6, false);
      const mat = new THREE.ShaderMaterial({
        vertexShader: uvVert,
        fragmentShader: arcFrag,
        uniforms: {
          uDraw: { value: 0 }, uAlpha: { value: 0 }, uTime: { value: 0 },
          uA: { value: cHome }, uB: { value: cScan },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 4;
      this.group.add(mesh);
      this.arcs.push({ mat, draw: 0, target: 0, alpha: 0 });
    });

    // pins: home + one per venue
    const pinAt = (lat: number, lon: number, color: THREE.Color, size: number) => {
      const g = new THREE.Group();
      const p = dir(lat, lon).multiplyScalar(R * 1.002);
      g.position.copy(p);
      g.lookAt(p.clone().multiplyScalar(2));
      const mk = (geo: THREE.BufferGeometry, op: number) => {
        const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, m);
        mesh.renderOrder = 5;
        g.add(mesh);
        return mesh;
      };
      const ring = mk(new THREE.RingGeometry(size * 0.75, size, 40), 0.9);
      const dot = mk(new THREE.CircleGeometry(size * 0.32, 20), 1);
      const pulse = mk(new THREE.RingGeometry(size * 0.92, size, 48), 0.6);
      const spike = mk(new THREE.CylinderGeometry(0.05, 0.05, size * 5, 6), 0.8);
      spike.rotation.x = Math.PI / 2;
      spike.position.z = size * 2.5;
      this.group.add(g);
      const pin: Pin = { g, ring, pulse, mats: [ring, dot, pulse, spike].map((x) => x.material as THREE.Material), on: 0, target: 0, pos: p };
      this.pins.push(pin);
      return pin;
    };
    pinAt(HOME.lat, HOME.lon, cHome.clone(), 0.9);
    targets.forEach((c) => pinAt(c.lat, c.lon, cScan.clone().offsetHSL(0, 0, 0.03), 0.75));
    this.pins.forEach((p) => p.mats.forEach((m) => ((m as THREE.MeshBasicMaterial).opacity = 0)));
  }

  /** which publication is in focus (index in content.publications, -1 none).
   *  Arcs are cumulative: every venue already reached stays drawn. */
  setPaper(i: number) {
    this.arcTargets = VENUES.map((v) => (v.pub <= i ? 1 : 0));
  }

  setScan(spec: ScanSpec, progress: number, amt: number) {
    const u = this.mat.uniforms;
    dir(spec.lat, spec.lon, u.uScanC.value);
    const { east, north } = tangents(spec.lat, spec.lon);
    u.uScanE.value.copy(east);
    u.uScanN.value.copy(north);
    u.uScanW.value = (spec.w * Math.PI) / 180;
    u.uScanL.value = (spec.l * Math.PI) / 180;
    u.uScanP.value = progress;
    u.uScanAmt.value = amt;
  }
  /** world-space endpoints of the current sweep line, for the satellite's beam */
  sweepEnds(spec: ScanSpec, progress: number, a: THREE.Vector3, b: THREE.Vector3) {
    const c = dir(spec.lat, spec.lon);
    const { east, north } = tangents(spec.lat, spec.lon);
    const W = (spec.w * Math.PI) / 180, L = (spec.l * Math.PI) / 180;
    const v = -L + 2 * L * progress;
    a.copy(c).addScaledVector(north, v).addScaledVector(east, -W).normalize().multiplyScalar(R);
    b.copy(c).addScaledVector(north, v).addScaledVector(east, W).normalize().multiplyScalar(R);
  }

  update(t: number, dt: number, camera: THREE.Camera, reduce: boolean) {
    this.time = t;
    this.mat.uniforms.uTime.value = t;
    this.cloudMat.uniforms.uTime.value = reduce ? 0 : t;
    this.starMat.uniforms.uTime.value = reduce ? 0 : t;
    this.sunMesh.quaternion.copy(camera.quaternion);
    const k = 1 - Math.exp(-dt * 2.2);
    this.arcs.forEach((a, i) => {
      a.target = this.arcTargets[i] * this.arcAmt;
      // draw in at a steady pace, fade out quickly
      if (a.target > a.draw) a.draw = reduce ? a.target : Math.min(a.target, a.draw + dt * 0.75);
      else a.draw += (a.target - a.draw) * k;
      a.alpha += ((a.target > 0 ? 1 : 0) * this.arcAmt - a.alpha) * k;
      a.mat.uniforms.uDraw.value = a.draw;
      a.mat.uniforms.uAlpha.value = a.alpha * this.arcVis;
      a.mat.uniforms.uTime.value = t;
    });
    // pins: home always while arcs are on; venue pins once their arc lands
    this.pins.forEach((p, i) => {
      p.target = i === 0 ? this.arcAmt : (this.arcTargets[i - 1] > 0 && this.arcs[i - 1].draw > 0.97 * this.arcAmt ? 1 : 0) * this.arcAmt;
      p.on += (p.target - p.on) * k;
      const pulseT = (t * 0.6 + i * 0.25) % 1;
      p.pulse.scale.setScalar(1 + pulseT * 2.2);
      const on = p.on * this.arcVis;
      (p.mats[2] as THREE.MeshBasicMaterial).opacity = on * (1 - pulseT) * 0.7;
      (p.mats[0] as THREE.MeshBasicMaterial).opacity = on * 0.9;
      (p.mats[1] as THREE.MeshBasicMaterial).opacity = on;
      (p.mats[3] as THREE.MeshBasicMaterial).opacity = on * 0.7;
      p.g.visible = on > 0.01;
    });
  }

  get now() { return this.time; }
}
