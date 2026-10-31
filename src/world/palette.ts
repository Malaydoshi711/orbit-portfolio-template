/* ------------------------------------------------------------------ */
/* Colours used by the WebGL world. Keep these in step with the CSS     */
/* tokens at the top of src/styles.css (--c-1..--c-4, --signal, --mask) */
/* so the 3D mask and the page legend match.                           */
/* ------------------------------------------------------------------ */

/** the four segmentation classes, in tone order 1..4 (linear RGB, 0..1) */
export const CLASS_RGB: [number, number, number][] = [
  [0.24, 0.55, 1.0], // 1 water      (--c-1)
  [0.18, 0.9, 0.65], // 2 vegetation (--c-2)
  [1.0, 0.71, 0.28], // 3 built-up   (--c-3)
  [1.0, 0.36, 0.45], // 4 slope      (--c-4)
];
/** scan lines, graticule, beams (--signal) */
export const SCAN_RGB: [number, number, number] = [0.36, 0.88, 1.0];
/** home pin, arcs, landing pad (--mask), linear RGB */
export const HOME_RGB: [number, number, number] = [1.0, 0.72, 0.36];
/** colours of the flagship's parts flying around the satellite (cycled) */
export const PART_HEX = ["#5ce1ff", "#2ee6a6", "#ffb547", "#ff8f6b", "#b59cff", "#ff6fa8"];
