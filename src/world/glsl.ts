import { CLASS_RGB, SCAN_RGB } from "./palette";

/* Shared GLSL helpers: hashing, value noise, fbm, anti-aliased lines. */
export const NOISE = /* glsl */ `
  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash13(i), b = hash13(i + vec3(1,0,0)), c = hash13(i + vec3(0,1,0)), d = hash13(i + vec3(1,1,0));
    float e = hash13(i + vec3(0,0,1)), g = hash13(i + vec3(1,0,1)), h = hash13(i + vec3(0,1,1)), k = hash13(i + vec3(1,1,1));
    return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
  }
  float vnoise2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash12(i), b = hash12(i + vec2(1,0)), c = hash12(i + vec2(0,1)), d = hash12(i + vec2(1,1));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm3(vec3 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * vnoise3(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return s / 0.9375;
  }
  float fbm2(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * vnoise2(p); p = p * 2.03 + 11.7; a *= 0.5; }
    return s / 0.9375;
  }
  float lineAA(float v, float w) {
    float d = abs(fract(v - 0.5) - 0.5) / max(fwidth(v), 1e-4);
    return 1.0 - min(d / w, 1.0);
  }
`;

/* segmentation class palette, shared with the CSS legend (see palette.ts) */
const v3 = (c: [number, number, number]) => `vec3(${c.map((x) => x.toFixed(3)).join(", ")})`;
export const CLASS_GLSL = /* glsl */ `
  const vec3 C_WATER = ${v3(CLASS_RGB[0])};
  const vec3 C_VEG   = ${v3(CLASS_RGB[1])};
  const vec3 C_URBAN = ${v3(CLASS_RGB[2])};
  const vec3 C_SLOPE = ${v3(CLASS_RGB[3])};
  const vec3 C_SCAN  = ${v3(SCAN_RGB)};
`;
