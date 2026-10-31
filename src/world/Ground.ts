import * as THREE from "three";
import { NOISE, CLASS_GLSL } from "./glsl";
import { HOME_RGB, SCAN_RGB } from "./palette";
import { site } from "../data/content";
import { HOME, detectCoast, tangents, sunDirection } from "./geo";

/* ------------------------------------------------------------------ */
/* Low-altitude world around the home city (site.home in content.ts):   */
/* land with hills on one side, a river, maybe a sea, the city at       */
/* night, clouds above, ground control markers and a landing beacon.    */
/* 1 unit = 40 m. The home city is the origin.                          */
/*                                                                      */
/* Two frames: the land itself is built in a geographic frame (north    */
/* is -z, east is +x) inside `geo`, a group turned by HEADING so the    */
/* camera path, which always flies toward -z, faces the most            */
/* interesting side (the sea, for a coastal city).                      */
/* ------------------------------------------------------------------ */
export const M_PER_UNIT = 40;

export type Terrain = {
  /** compass bearing of the hills beyond the city, or null for none */
  ridgeBearing: number | null;
  /** flat-topped steps in the land, like an old lava plateau */
  terraced: boolean;
  /** a river winding west to east through the city */
  river: boolean;
  /** height of the land: 0 flat, 1 rolling (default), 2 mountainous */
  relief: number;
  /** compass bearing of the sea, null for an inland city, "auto" to guess it from the map */
  coast: number | null | "auto";
};
const TERRAIN: Terrain = {
  ridgeBearing: 270, terraced: true, river: true, relief: 1, coast: "auto",
  ...((site.home as { terrain?: Partial<Terrain> }).terrain ?? {}),
};
const D2R = Math.PI / 180;
const RIDGE = TERRAIN.ridgeBearing == null ? null : { x: Math.sin(TERRAIN.ridgeBearing * D2R), z: -Math.cos(TERRAIN.ridgeBearing * D2R) };
const RIVER = TERRAIN.river ? 1 : 0;
const RELIEF = Math.max(0, Math.min(2.5, Number(TERRAIN.relief ?? 1)));

/** the sea: unit vector (x, z) from the city toward it and the distance to the shore (units), or null */
export const COAST = (() => {
  let bearing: number | null = null, km = 6;
  if (typeof TERRAIN.coast === "number") bearing = TERRAIN.coast;
  else if (TERRAIN.coast === "auto" || TERRAIN.coast === undefined) {
    const c = detectCoast(HOME.lat, HOME.lon);
    if (c) { bearing = c.bearing; km = c.km; }
  }
  if (bearing == null || !isFinite(bearing)) return null;
  // the map is coarse, so the shore sits where it reads well: inside the city's edge
  const dist = Math.max(150, Math.min(340, km * 25 * 0.6));
  return { x: Math.sin(bearing * D2R), z: -Math.cos(bearing * D2R), dist, bearing };
})();

/** compass direction the camera looks along on the final approach. Inland it
 *  is north. For a coastal city the sea opens up ahead, to one side of the
 *  beacon, and the heading is picked so the dawn glow stays off to one side
 *  (as it is inland) instead of flooding the whole view ahead. */
export const HEADING = (() => {
  if (!COAST) return 0;
  const sun = sunDirection(HOME.lat, HOME.lon);
  const { east, north } = tangents(HOME.lat, HOME.lon);
  const dawn = Math.atan2(sun.dot(east), sun.dot(north)) / D2R; // compass bearing of the dawn
  const wrap = (a: number) => ((a + 540) % 360) - 180;
  let best = 0, score = Infinity;
  for (const rel of [50, -50, 35, -35, 65, -65]) {
    const h = wrap(COAST.bearing - rel);
    const d = wrap(dawn - h);
    // dawn off to one side, the right preferred (as inland), sea about 50 degrees off the nose
    const sc = Math.min(Math.abs(d - 90), Math.abs(d + 90) + 10) + Math.abs(Math.abs(rel) - 50) * 0.6 + (rel < 0 ? 4 : 0);
    if (sc < score) { score = sc; best = h; }
  }
  return best * D2R;
})();
const HC = Math.cos(HEADING), HS = Math.sin(HEADING);
/** view frame (the camera path's x, z) to the geographic frame */
export const toGeo = (x: number, z: number) => ({ x: x * HC - z * HS, z: x * HS + z * HC });
/** geographic frame to the view frame */
export const toView = (x: number, z: number) => ({ x: x * HC + z * HS, z: -x * HS + z * HC });

/** a wavy shoreline: shared by heightAt and the shader */
const shoreWiggle = (t: number) => 55 * Math.sin(t * 0.0042 + 1.0) + 22 * Math.sin(t * 0.011 + 2.0) + 8 * Math.sin(t * 0.031 + 0.5);
/** signed distance past the shore (> 0 at sea), in the geographic frame */
export function seaDist(x: number, z: number) {
  if (!COAST) return -1e4;
  const along = x * -COAST.z + z * COAST.x;
  return x * COAST.x + z * COAST.z - COAST.dist - shoreWiggle(along);
}

function hash2(x: number, y: number) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(x: number, y: number, o = 5) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < o; i++) { s += a * vnoise(x, y); n += a; x = x * 2.03 + 17.1; y = y * 2.03 + 5.3; a *= 0.5; }
  return s / n;
}
const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const riverZ = (x: number) => 70 * Math.sin(x * 0.0035 + 0.6) + 25 * Math.sin(x * 0.0105 + 1.3);

/** terrain height at a point in the geographic frame */
export function heightAt(x: number, z: number) {
  const n = fbm(x * 0.0016 + 3.1, z * 0.0016 - 1.7);
  let h = Math.max(0, (n - 0.32) * 300) * RELIEF;
  // old lava plateau: flat-topped steps with steep risers
  if (TERRAIN.terraced) {
    const step = 30 * Math.max(0.5, RELIEF), k = h / step, fl = Math.floor(k), fr = k - fl;
    h = (fl + sm(0.62, 0.92, fr)) * step;
  }
  // hills rising beyond the city, toward ridgeBearing
  if (RIDGE) h += sm(250, 1200, x * RIDGE.x + z * RIDGE.z) * 150 * RELIEF * fbm(x * 0.003 + 7, z * 0.003, 4);
  h += (fbm(x * 0.012, z * 0.012, 3) - 0.5) * 7 * Math.min(1, 0.3 + RELIEF);
  // river valley
  if (RIVER) {
    const d = Math.abs(z - riverZ(x));
    h = h * (0.22 + 0.78 * sm(10, 230, d)) - (1 - sm(0, 18, d)) * 7;
  }
  // the city sits in a broad basin
  const r = Math.hypot(x, z * 1.15);
  h = h * (0.12 + 0.88 * sm(140, 560, r));
  // the sea: a low coastal plain, a beach, then water
  if (COAST) {
    const s = seaDist(x, z);
    h = h * (0.1 + 0.9 * sm(0, 380, -s));
    h += (-6 - h) * sm(-6, 26, s);
  }
  return h;
}

const terrainVert = /* glsl */ `
  varying vec3 vW;
  varying vec3 vG;
  varying vec3 vN;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vG = position;
    vN = normal;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const terrainFrag = /* glsl */ `
  uniform float uTime;
  uniform vec4 uScan;     // x centre, half width, z start, z end
  uniform float uScanP, uScanAmt;
  uniform float uFogD;
  uniform vec3 uEast;     // toward the dawn, view frame (for fog)
  uniform vec3 uEastG;    // toward the dawn, geographic frame (for light)
  uniform float uRiver;
  uniform vec4 uCoast;    // toward the sea (x, z), shore distance, on
  uniform vec2 uRot;      // cos, sin of the heading: view frame to geographic
  uniform vec3 uCamG;     // camera position in the geographic frame
  varying vec3 vW;
  varying vec3 vG;
  varying vec3 vN;
  ${NOISE}
  ${CLASS_GLSL}

  float riverZ(float x) { return 70.0 * sin(x * 0.0035 + 0.6) + 25.0 * sin(x * 0.0105 + 1.3); }
  vec2 toGeo(vec2 q) { return vec2(q.x * uRot.x - q.y * uRot.y, q.x * uRot.y + q.y * uRot.x); }
  float shoreWiggle(float t) { return 55.0 * sin(t * 0.0042 + 1.0) + 22.0 * sin(t * 0.011 + 2.0) + 8.0 * sin(t * 0.031 + 0.5); }
  float seaDist(vec2 p) {
    if (uCoast.w < 0.5) return -1e4;
    float along = p.x * -uCoast.y + p.y * uCoast.x;
    return dot(p, uCoast.xy) - uCoast.z - shoreWiggle(along);
  }
  float roadD(vec2 p) {
    float d = 1e4;
    for (int i = 0; i < 7; i++) {
      float a = float(i) * 0.9 + 0.35;
      vec2 dd = vec2(cos(a), sin(a));
      float t = dot(p, dd);
      float perp = abs(p.x * dd.y - p.y * dd.x) + 6.0 * sin(t * 0.02 + float(i));
      d = min(d, t > 0.0 ? abs(perp) : 1e4);
    }
    return d;
  }
  // street grids, rotated per district, with some blocks dark
  float streets(vec2 p) {
    vec2 dc = floor(p / 260.0);
    float ang = (hash12(dc) - 0.5) * 1.4;
    float c = cos(ang), s = sin(ang);
    vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    float blk = 13.0;
    vec2 f = abs(fract(q / blk) - 0.5);
    vec2 w = fwidth(q / blk);
    vec2 l = smoothstep(vec2(0.5) - w * 1.1 - 0.012, vec2(0.5), f);
    float line = max(l.x, l.y);
    float lod = smoothstep(0.06, 0.25, max(w.x, w.y));
    float on = step(0.3, hash12(floor(q / blk) + 0.5));
    return mix(line * on, 0.1, lod);
  }
  float lights(vec2 p, float cell, float prob, float seed) {
    vec2 q = p / cell;
    vec2 c = floor(q), f = fract(q);
    float h = hash12(c + seed);
    vec2 o = vec2(hash12(c + 3.7 + seed), hash12(c + 9.1 + seed)) * 0.7 + 0.15;
    float d = length(f - o);
    float px = length(fwidth(q));
    float r = 0.06 + 0.06 * hash12(c + 1.3);
    float dotv = smoothstep(r + px * 0.7, r * 0.2, d);
    return mix(dotv * step(h, prob), prob * 0.06, smoothstep(0.18, 0.5, px));
  }

  /* the classifier at a cell centre: 0 water, 1 vegetation, 2 built-up, 3 exposed slope, 4 bare */
  float classAt(vec2 q) {
    if (uRiver > 0.5 && abs(q.y - riverZ(q.x)) < 11.0) return 0.0;
    if (seaDist(q) > 0.0) return 0.0;
    float nz = fbm2(q * 0.012);
    float r = length(vec2(q.x, q.y * 1.15));
    float city = 1.0 - smoothstep(110.0, 470.0, r + (nz - 0.5) * 160.0);
    float road = (1.0 - smoothstep(1.5, 5.0, roadD(q))) * (1.0 - smoothstep(500.0, 1500.0, r));
    if (city > 0.45 || road > 0.5) return 2.0;
    if (vnoise2(q * 0.02 + 9.0) * (1.0 - city) > 0.68) return 3.0;
    return nz > 0.5 ? 1.0 : 4.0;
  }
  vec3 classColor(float c) {
    return c < 0.5 ? C_WATER : c < 1.5 ? C_VEG : c < 2.5 ? C_URBAN : c < 3.5 ? C_SLOPE : vec3(0.55, 0.6, 0.75);
  }

  void main() {
    vec3 n = normalize(vN);
    vec2 p = vG.xz;          // geographic frame: the land
    vec2 q = vW.xz;          // view frame: the scan pass
    float slope = 1.0 - n.y;
    float hN = smoothstep(-5.0, 180.0, vW.y);
    float nz = fbm2(p * 0.012);

    float r = length(vec2(p.x, p.y * 1.15));
    float city = (1.0 - smoothstep(110.0, 470.0, r + (nz - 0.5) * 160.0));
    float rd = roadD(p);
    float road = (1.0 - smoothstep(1.5, 5.0, rd)) * (1.0 - smoothstep(500.0, 1500.0, r));
    float dr = abs(p.y - riverZ(p.x));
    float water = (1.0 - smoothstep(9.0, 13.0, dr)) * uRiver;
    float sd = seaDist(p);
    float sea = smoothstep(-3.0, 3.0, sd);
    float dry = 1.0 - max(water, sea);
    city *= 1.0 - smoothstep(-40.0, 0.0, sd);
    road *= dry;
    vec2 vc = floor(p / 170.0);
    vec2 vctr = (vc + vec2(hash12(vc), hash12(vc + 4.0)) * 0.6 + 0.2) * 170.0;
    float village = (1.0 - smoothstep(8.0, 34.0, length(p - vctr))) * step(0.55, hash12(vc + 2.0)) * (1.0 - city);

    // basalt plateau shading under a pre-dawn sky
    vec3 base = mix(vec3(0.028, 0.04, 0.07), vec3(0.075, 0.09, 0.13), hN);
    base = mix(base, vec3(0.11, 0.1, 0.11), smoothstep(0.25, 0.6, slope) * 0.6);
    base *= 0.8 + 0.4 * nz;
    vec3 L = normalize(vec3(uEastG.x, 0.22, uEastG.z));
    float dawn = max(dot(n, L), 0.0);
    vec3 col = base * (0.55 + 0.45 * n.y) * vec3(0.55, 0.7, 1.0);
    col += base * dawn * vec3(1.0, 0.55, 0.32) * 1.6;
    col = mix(col, vec3(0.02, 0.05, 0.1) + vec3(0.25, 0.18, 0.12) * 0.15, water);
    // the sea: dark water that mirrors the dawn sky, with the city's glow on the shallows
    if (sea > 0.0) {
      vec3 vdg = normalize(vG - uCamG);
      vec3 rf = reflect(vdg, vec3(0.0, 1.0, 0.0));
      float ripple = vnoise2(p * vec2(0.09, 0.03) + uTime * vec2(0.0, 0.25)) * 0.6 + vnoise2(p * 0.2 - uTime * 0.3) * 0.4;
      float fres = pow(1.0 - max(-vdg.y, 0.0), 4.0);
      float dawnR = pow(max(dot(normalize(vec3(rf.x, 0.0, rf.z) + 1e-5), uEastG), 0.0), 3.0);
      vec3 seaC = vec3(0.006, 0.018, 0.04) + vec3(0.06, 0.09, 0.16) * fres * (0.7 + 0.6 * ripple);
      seaC += vec3(0.5, 0.24, 0.13) * dawnR * fres * (0.35 + 0.55 * ripple);
      float shallows = 1.0 - smoothstep(0.0, 160.0, sd);
      seaC += vec3(1.0, 0.55, 0.22) * shallows * shallows * (0.04 + 0.1 * ripple);
      float foam = (1.0 - smoothstep(0.0, 5.0, abs(sd - 2.0))) * (0.5 + 0.5 * ripple);
      seaC += vec3(0.12, 0.16, 0.22) * foam * 0.5;
      col = mix(col, seaC, sea);
    }

    // night lights
    float prob = (city * 0.45 + road * 0.7 + village * 0.5 + 0.003) * dry;
    float li = (lights(p, 7.0, prob, 0.0) + 0.7 * lights(p, 3.4, city * 0.35 + road * 0.4, 7.0)) * dry;
    vec3 lc = mix(vec3(1.0, 0.62, 0.28), vec3(0.85, 0.92, 1.0), step(0.8, hash12(floor(p / 7.0) + 2.0)));
    col += lc * li * 1.4;
    float st = streets(p) * smoothstep(0.15, 0.6, city) * dry;
    col += vec3(1.0, 0.58, 0.24) * st * 0.55;
    col += vec3(1.0, 0.55, 0.22) * (city * 0.025 + road * 0.05) * dry;

    // survey graticule
    float g = max(lineAA(p.x / 100.0, 0.7), lineAA(p.y / 100.0, 0.7));
    col += C_SCAN * g * 0.035;

    // ---- segmentation pass ----
    float fx = fwidth(q.x);
    float inX = 1.0 - smoothstep(uScan.y - fx, uScan.y + fx, abs(q.x - uScan.x));
    float z0 = uScan.z, z1 = uScan.w;              // sweep runs from z0 to z1 (z1 < z0)
    float sweep = mix(z0, z1, uScanP);
    float inZ = step(q.y, z0) * step(z1, q.y);
    float fz = max(fwidth(q.y), 1e-4);
    float painted = inX * inZ * smoothstep(sweep - fz, sweep + fz, q.y) * uScanAmt;
    if (painted > 0.001) {
      // classified raster: one class per cell, crisp 1px edges where neighbouring classes differ
      float cs = uScan.y / 20.0;
      vec2 cell = floor(q / cs);
      float c0 = classAt(toGeo((cell + 0.5) * cs));
      float cR = classAt(toGeo((cell + vec2(1.5, 0.5)) * cs));
      float cT = classAt(toGeo((cell + vec2(0.5, 1.5)) * cs));
      vec2 fr = fract(q / cs);
      float eR = (1.0 - smoothstep(0.4, 1.4, (1.0 - fr.x) * cs / max(fx, 1e-4))) * step(0.5, abs(cR - c0));
      float eT = (1.0 - smoothstep(0.4, 1.4, (1.0 - fr.y) * cs / fz)) * step(0.5, abs(cT - c0));
      vec3 cc = classColor(c0);
      float strength = c0 > 3.5 ? 0.3 : c0 > 1.5 && c0 < 2.5 ? 0.55 : 1.0;
      col = col * (1.0 - 0.3 * strength * painted) + cc * 0.14 * strength * painted;
      col += cc * max(eR, eT) * painted * 0.7;
    }
    float pg = max(lineAA(q.x / 40.0, 0.6), lineAA(q.y / 40.0, 0.6));
    col += C_SCAN * pg * painted * 0.12;
    float border = (1.0 - smoothstep(0.0, fx * 2.0, abs(abs(q.x - uScan.x) - uScan.y))) * inZ * uScanAmt;
    col += C_SCAN * border * 0.7;
    float live = 1.0 - step(0.999, uScanP);
    float sl = exp(-abs(q.y - sweep) / 3.0) * inX * inZ * uScanAmt * live;
    col += C_SCAN * sl * 1.4;

    // fog toward a dawn-tinted horizon
    vec3 vd = normalize(vW - cameraPosition);
    float dist = length(vW - cameraPosition);
    float east = smoothstep(-0.2, 1.0, dot(normalize(vec3(vd.x, 0.0, vd.z)), uEast));
    vec3 fogC = mix(vec3(0.05, 0.075, 0.13), vec3(0.42, 0.24, 0.17), east * 0.8);
    float f = 1.0 - exp(-pow(dist * uFogD, 1.5));
    col = mix(col, fogC, f);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const skyVert = /* glsl */ `
  varying vec3 vD;
  void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const skyFrag = /* glsl */ `
  uniform vec3 uEast;
  varying vec3 vD;
  ${NOISE}
  void main() {
    vec3 d = normalize(vD);
    float h = d.y;
    float east = max(dot(normalize(vec3(d.x, 0.0, d.z)), uEast), 0.0);
    vec3 zen = vec3(0.006, 0.014, 0.035);
    vec3 hor = mix(vec3(0.05, 0.075, 0.13), vec3(0.62, 0.3, 0.16), pow(east, 2.5));
    vec3 col = mix(hor, zen, smoothstep(-0.02, 0.45, h));
    col += vec3(1.0, 0.55, 0.25) * pow(east, 8.0) * exp(-max(h, 0.0) * 14.0) * 0.55;
    vec3 sc = floor(d * 380.0);
    float s = step(0.9965, hash13(sc)) * smoothstep(0.1, 0.5, h) * (1.0 - pow(east, 3.0) * 0.8);
    col += vec3(0.8, 0.88, 1.0) * s * 0.9;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const cloudVert = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aScale;
  attribute float aSeed;
  varying vec2 vUv;
  varying float vSeed;
  varying float vFade;
  varying float vEast;
  uniform vec3 uEast;
  void main() {
    vUv = uv;
    vSeed = aSeed;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 wp = aOffset + (right * position.x + up * position.y * 0.55) * aScale;
    float d = distance(wp, cameraPosition);
    vFade = smoothstep(20.0, 120.0, d) * (1.0 - smoothstep(1400.0, 2200.0, d));
    vEast = dot(normalize(aOffset - cameraPosition), uEast);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;
const cloudFrag = /* glsl */ `
  uniform float uAmt;
  varying vec2 vUv;
  varying float vSeed;
  varying float vFade;
  varying float vEast;
  ${NOISE}
  void main() {
    vec2 c = vUv - 0.5;
    float rr = length(c * vec2(1.0, 1.15)) * 2.0;
    float n = fbm2(vUv * 3.2 + vSeed * 31.0);
    float a = smoothstep(1.0, 0.25, rr + (n - 0.5) * 0.9);
    vec3 col = mix(vec3(0.07, 0.09, 0.15), vec3(0.2, 0.22, 0.3), vUv.y);
    col += vec3(0.85, 0.42, 0.25) * smoothstep(0.45, 1.0, vUv.y) * (0.25 + 0.6 * max(vEast, 0.0)) * n;
    gl_FragColor = vec4(col, a * 0.82 * vFade * uAmt);
    #include <colorspace_fragment>
  }
`;

const beamVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const beamFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float a = pow(1.0 - vUv.y, 1.8) * uAlpha;
    a *= 0.8 + 0.2 * sin(vUv.y * 40.0 - uTime * 4.0);
    gl_FragColor = vec4(uColor * a, 1.0);
    #include <colorspace_fragment>
  }
`;

type Fader = { obj: THREE.Object3D; mats: { m: THREE.Material; base: number }[]; amt: number; target: number };

export class Ground {
  group = new THREE.Group();
  terrainMat: THREE.ShaderMaterial;
  cloudMat: THREE.ShaderMaterial;
  beacon: Fader;
  markers: Fader;
  private beams: THREE.ShaderMaterial[] = [];
  private rings: THREE.Mesh[] = [];
  private markerRings: THREE.Mesh[] = [];
  readonly beaconY: number;
  /** the land, in the geographic frame, turned by HEADING into the view frame */
  geo = new THREE.Group();
  /** toward the dawn on the horizon: geographic frame and view frame */
  eastG = new THREE.Vector3(1, 0, 0);
  east = new THREE.Vector3(1, 0, 0);
  private camG = new THREE.Vector3();

  constructor(opts: { mobile: boolean }, sun: THREE.Vector3) {
    // dawn direction: the sun's bearing from home, flattened onto the ground
    const { east, north } = tangents(HOME.lat, HOME.lon);
    this.eastG.set(sun.dot(east), 0, -sun.dot(north));
    if (this.eastG.lengthSq() < 1e-6) this.eastG.set(1, 0, 0);
    this.eastG.normalize();
    const ev = toView(this.eastG.x, this.eastG.z);
    this.east.set(ev.x, 0, ev.z).normalize();
    this.geo.rotation.y = HEADING;
    this.group.add(this.geo);

    const size = 4200, seg = opts.mobile ? 150 : 260;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    // extend mostly ahead, the way we fly
    const ahead = toGeo(0, -600);
    geo.translate(ahead.x, 0, ahead.z);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    this.terrainMat = new THREE.ShaderMaterial({
      vertexShader: terrainVert,
      fragmentShader: terrainFrag,
      uniforms: {
        uTime: { value: 0 },
        uScan: { value: new THREE.Vector4(0, 200, 600, 0) },
        uScanP: { value: 0 },
        uScanAmt: { value: 0 },
        uFogD: { value: 1 / 1900 },
        uEast: { value: this.east },
        uEastG: { value: this.eastG },
        uRiver: { value: RIVER },
        uCoast: { value: new THREE.Vector4(COAST?.x ?? 1, COAST?.z ?? 0, COAST?.dist ?? 0, COAST ? 1 : 0) },
        uRot: { value: new THREE.Vector2(Math.cos(HEADING), Math.sin(HEADING)) },
        uCamG: { value: this.camG },
      },
    });
    const terrain = new THREE.Mesh(geo, this.terrainMat);
    for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
    this.geo.add(terrain);

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(5200, 48, 24),
      new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, uniforms: { uEast: { value: this.eastG } }, side: THREE.BackSide, depthWrite: false }),
    );
    sky.renderOrder = -2;
    this.geo.add(sky);

    // cloud deck the camera falls through after the re-entry
    const N = opts.mobile ? 70 : 150;
    const cg = new THREE.InstancedBufferGeometry();
    const plane = new THREE.PlaneGeometry(1, 1);
    cg.index = plane.index;
    cg.setAttribute("position", plane.attributes.position);
    cg.setAttribute("uv", plane.attributes.uv);
    const off = new Float32Array(N * 3), sc = new Float32Array(N), sd = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 1900;
      const z = 1500 - Math.random() * 2600;
      off.set([x, 430 + Math.random() * 110, z], i * 3);
      sc[i] = 160 + Math.random() * 260;
      sd[i] = Math.random();
    }
    cg.setAttribute("aOffset", new THREE.InstancedBufferAttribute(off, 3));
    cg.setAttribute("aScale", new THREE.InstancedBufferAttribute(sc, 1));
    cg.setAttribute("aSeed", new THREE.InstancedBufferAttribute(sd, 1));
    cg.instanceCount = N;
    this.cloudMat = new THREE.ShaderMaterial({
      vertexShader: cloudVert,
      fragmentShader: cloudFrag,
      uniforms: { uAmt: { value: 1 }, uEast: { value: this.east } },
      transparent: true,
      depthWrite: false,
    });
    const clouds = new THREE.Mesh(cg, this.cloudMat);
    clouds.frustumCulled = false;
    clouds.renderOrder = 3;
    this.group.add(clouds);

    // landing beacon at home
    this.beaconY = heightAt(0, 0);
    const bg = new THREE.Group();
    bg.position.set(0, this.beaconY, 0);
    const mats: { m: THREE.Material; base: number }[] = [];
    const beamMat = (c: THREE.Color, a: number) => {
      const m = new THREE.ShaderMaterial({
        vertexShader: beamVert, fragmentShader: beamFrag,
        uniforms: { uColor: { value: c }, uAlpha: { value: a }, uTime: { value: 0 } },
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      this.beams.push(m);
      mats.push({ m, base: a });
      return m;
    };
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 520, 32, 1, true), beamMat(new THREE.Color(...SCAN_RGB), 0.14));
    outer.position.y = 260;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 520, 12, 1, true), beamMat(new THREE.Color(0.6, 0.95, 1.1), 0.5));
    core.position.y = 260;
    bg.add(outer, core);
    const basic = (c: THREE.Color, op: number) => {
      const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      mats.push({ m, base: op });
      return m;
    };
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(9.5, 10, 64), basic(new THREE.Color(...SCAN_RGB), 0.8));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 1.5;
      this.rings.push(ring);
      bg.add(ring);
    }
    const pad = new THREE.Mesh(new THREE.RingGeometry(14, 15, 6), basic(new THREE.Color(...HOME_RGB), 0.9));
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 1.2;
    const pad2 = new THREE.Mesh(new THREE.RingGeometry(22, 22.6, 6, 1), basic(new THREE.Color(...HOME_RGB), 0.45));
    pad2.rotation.x = -Math.PI / 2;
    pad2.rotation.z = Math.PI / 6;
    pad2.position.y = 1.2;
    bg.add(pad, pad2);
    this.geo.add(bg);
    this.beacon = { obj: bg, mats, amt: 0, target: 0 };

    // ground control points: survey markers along the final approach
    const mg = new THREE.Group();
    const mm: { m: THREE.Material; base: number }[] = [];
    // spots along the final approach (view frame); any that fall in the sea move to the other side
    const spots = [[-150, 330], [170, 260], [-230, 140], [240, 60], [-90, 470], [120, 520]]
      .map(([x, z]) => [toGeo(x, z), toGeo(-x, z)].find((g) => seaDist(g.x, g.z) < -25))
      .filter((g): g is { x: number; z: number } => !!g);
    spots.forEach(({ x, z }, i) => {
      const y = heightAt(x, z);
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const c = i % 2 ? new THREE.Color(...HOME_RGB) : new THREE.Color(...SCAN_RGB);
      const m = new THREE.ShaderMaterial({
        vertexShader: beamVert, fragmentShader: beamFrag,
        uniforms: { uColor: { value: c }, uAlpha: { value: 0.7 }, uTime: { value: 0 } },
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      this.beams.push(m);
      mm.push({ m, base: 0.7 });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 90, 8, 1, true), m);
      beam.position.y = 45;
      const rm = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      mm.push({ m: rm, base: 0.8 });
      const ring = new THREE.Mesh(new THREE.RingGeometry(5, 5.6, 4), rm);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 1;
      this.markerRings.push(ring);
      const tipM = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1.3), transparent: true, opacity: 1 });
      mm.push({ m: tipM, base: 1 });
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), tipM);
      tip.position.y = 92;
      g.add(beam, ring, tip);
      mg.add(g);
    });
    this.geo.add(mg);
    this.markers = { obj: mg, mats: mm, amt: 0, target: 0 };
  }

  setScan(x: number, w: number, z0: number, z1: number, p: number, amt: number) {
    const u = this.terrainMat.uniforms;
    u.uScan.value.set(x, w, z0, z1);
    u.uScanP.value = p;
    u.uScanAmt.value = amt;
  }
  /** the camera, for the water's reflections (world position in, geographic frame stored) */
  setCamera(p: THREE.Vector3) {
    const g = toGeo(p.x, p.z);
    this.camG.set(g.x, p.y, g.z);
  }

  update(t: number, dt: number, reduce: boolean) {
    this.terrainMat.uniforms.uTime.value = t;
    const k = 1 - Math.exp(-dt * 2.5);
    for (const f of [this.beacon, this.markers]) {
      f.amt += (f.target - f.amt) * (reduce ? 1 : k);
      f.obj.visible = f.amt > 0.01;
      f.mats.forEach(({ m, base }) => {
        if ((m as THREE.ShaderMaterial).uniforms?.uAlpha) (m as THREE.ShaderMaterial).uniforms.uAlpha.value = base * f.amt;
        else (m as THREE.MeshBasicMaterial).opacity = base * f.amt;
      });
    }
    this.beams.forEach((b) => (b.uniforms.uTime.value = t));
    this.rings.forEach((r, i) => {
      const ph = reduce ? i / 3 : (t * 0.35 + i / 3) % 1;
      r.scale.setScalar(1 + ph * 9);
      (r.material as THREE.MeshBasicMaterial).opacity = (1 - ph) * 0.8 * this.beacon.amt;
    });
    this.markers.obj.children.forEach((g, i) => {
      g.children[2].rotation.y = t * 1.2 + i;
      g.children[2].position.y = 92 + Math.sin(t * 1.5 + i) * 2;
    });
    this.markerRings.forEach((r, i) => (r.rotation.z = t * 0.4 + i));
  }
}
