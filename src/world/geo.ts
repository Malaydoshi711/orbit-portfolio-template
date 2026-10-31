import * as THREE from "three";
import { publications, site } from "../data/content";
import { NE_LAND, NE_HOLES } from "./land";

/* ------------------------------------------------------------------ */
/* Geography. Coastlines come from Natural Earth 1:110m land (public    */
/* domain, naturalearthdata.com; embedded in land.ts). City lights,     */
/* populated regions, arid regions and big lakes are authored by hand.  */
/* Everything is painted into a canvas at boot, so the globe needs no   */
/* downloaded texture.                                                  */
/* ------------------------------------------------------------------ */

export const R = 100; // globe radius in world units (1 unit = 63.71 km)
export const KM_PER_UNIT = 6371 / R;

/** where the descent lands (from content.ts: site.home) */
export const HOME = { lat: site.home.lat, lon: site.home.lon };

/** wrap a longitude into -180..180 */
export const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;
/** a point given as an offset from home, in degrees */
export const nearHome = (dLat: number, dLon: number) => ({
  lat: Math.max(-85, Math.min(85, HOME.lat + dLat)),
  lon: wrapLon(HOME.lon + dLon),
});

/** publication venues with a pin on the globe; `pub` is the index in content.publications */
export const VENUES = publications
  .map((p, pub) => (p.geo ? { ...p.geo, pub, venue: p.venue } : null))
  .filter((v): v is NonNullable<typeof v> => !!v);

const D2R = Math.PI / 180;

/** Unit direction for a latitude/longitude. Matches THREE.SphereGeometry uvs:
 *  u = (lon + 180) / 360, v = (lat + 90) / 180. */
export function dir(lat: number, lon: number, out = new THREE.Vector3()) {
  const la = lat * D2R, lo = lon * D2R;
  return out.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
}
export function latLonOf(v: THREE.Vector3) {
  const n = v.clone().normalize();
  return { lat: Math.asin(n.y) / D2R, lon: Math.atan2(-n.z, n.x) / D2R };
}
/** local east / north unit tangents at a point */
export function tangents(lat: number, lon: number) {
  const lo = lon * D2R, la = lat * D2R;
  const east = new THREE.Vector3(-Math.sin(lo), 0, -Math.cos(lo));
  const north = new THREE.Vector3(-Math.sin(la) * Math.cos(lo), Math.cos(la), Math.sin(la) * Math.sin(lo));
  return { east, north };
}

type Ring = number[]; // flat [lon, lat, lon, lat, ...]

/** coastlines: Natural Earth 1:110m land (public domain), see land.ts */
const LAND: Ring[] = NE_LAND;

/* Natural Earth land already leaves out the oceans and the Caspian (a hole in
 * the data). Large lakes are part of the land polygons, so the biggest ones are
 * cut out here by hand, coarsely. */
const WATER: Ring[] = [
  ...NE_HOLES,
  // Great Lakes: Superior, Michigan, Huron, Erie, Ontario
  [-92.1, 46.75, -91, 46.9, -89.6, 46.85, -88.4, 46.95, -87.5, 46.5, -86.5, 46.45, -85, 46.75, -84.6, 46.5, -84.8, 47.5, -85.6, 47.9,
    -86.5, 48.7, -88.3, 48.7, -89.3, 48, -90.5, 47.6, -91.7, 47.1],
  [-87.52, 41.68, -87.3, 41.63, -86.6, 42.2, -86.2, 43, -86.5, 43.8, -86.2, 44.5, -85.6, 45.2, -85, 45.7, -84.8, 45.8, -85.6, 46.05,
    -86.7, 45.85, -87.6, 45.1, -87.75, 44.5, -87.7, 43.8, -87.83, 43.1, -87.78, 42.5, -87.6, 41.95],
  [-82.4, 43, -81.7, 43.5, -81.7, 44.5, -81.3, 45.2, -80.4, 44.6, -79.8, 44.8, -80.5, 45.6, -81.5, 46.1, -83.5, 46.1, -84.5, 46,
    -84, 45.6, -83.4, 45.2, -83.3, 44.4, -83.9, 43.7, -83.4, 44, -82.5, 43.5],
  [-83.4, 41.7, -82.5, 41.4, -81, 41.8, -79.8, 42.2, -78.9, 42.85, -79.8, 42.9, -81, 42.65, -82, 42.4, -83.2, 42],
  [-79.8, 43.3, -79, 43.25, -77.5, 43.25, -76.2, 43.5, -76.3, 44.1, -77, 44, -78.5, 43.95, -79.4, 43.65],
  // East African lakes: Victoria, Tanganyika, Malawi
  [31.8, -1, 32, -0.3, 32.9, 0.1, 33.9, 0.2, 34.1, -0.4, 34.8, -0.3, 34.2, -1.1, 33.9, -2.1, 33.2, -2.5, 32.6, -2.6, 31.7, -2.3, 31.6, -1.4],
  [29.1, -3.4, 29.4, -3.4, 29.7, -4.5, 30.3, -6, 31, -7, 30.8, -8.6, 30.4, -8.7, 29.9, -7.6, 29.4, -6.1, 29.3, -5],
  [34.2, -9.5, 34.6, -9.6, 34.9, -11.6, 34.8, -12.8, 35.3, -14.2, 34.9, -14.4, 34.4, -13.8, 34.2, -12.2, 34, -10.8],
  // Baikal, Ladoga
  [103.8, 51.5, 104.8, 51.6, 106, 52.3, 107.4, 53.2, 108.4, 54, 109.4, 55, 109.7, 55.8, 109.2, 55.8, 108, 54.5, 106.5, 53.2, 105.5, 52.8, 104.2, 52],
  [29.9, 60, 31.5, 60.2, 32.8, 60.8, 32.5, 61.2, 31, 61.7, 30, 61.2, 29.8, 60.6],
];

/* City lights: lon, lat, weight (0.15 small or dim .. 1 megacity). About 300
 * cities on every continent, so any home city sits in a believable night. */
const CITIES: number[] = [
  // North America and the Caribbean
  -74, 40.71, 1, -118.24, 34.05, 0.95, -87.63, 41.88, 0.85, -95.37, 29.76, 0.75, -96.8, 32.78, 0.75, -77.04, 38.9, 0.7, -75.17, 39.95, 0.7,
  -80.19, 25.76, 0.7, -84.39, 33.75, 0.7, -71.06, 42.36, 0.65, -112.07, 33.45, 0.6, -122.42, 37.77, 0.7, -122.33, 47.6, 0.6, -83.05, 42.33, 0.6,
  -93.27, 44.98, 0.5, -117.16, 32.72, 0.55, -104.99, 39.74, 0.55, -82.46, 27.95, 0.45, -90.2, 38.63, 0.45, -76.61, 39.29, 0.45, -80.84, 35.23, 0.4,
  -81.38, 28.54, 0.45, -98.49, 29.42, 0.45, -122.68, 45.52, 0.45, -121.49, 38.58, 0.4, -79.99, 40.44, 0.4, -115.14, 36.17, 0.5, -84.51, 39.1, 0.4,
  -94.58, 39.1, 0.4, -82.99, 39.96, 0.4, -86.16, 39.77, 0.4, -81.69, 41.5, 0.4, -86.78, 36.16, 0.4, -97.74, 30.27, 0.45, -90.07, 29.95, 0.35,
  -111.89, 40.76, 0.4, -78.64, 35.78, 0.35, -87.91, 43.04, 0.35, -81.66, 30.33, 0.35, -97.52, 35.47, 0.35, -90.05, 35.15, 0.3, -85.76, 38.25, 0.3,
  -106.65, 35.08, 0.3, -78.88, 42.89, 0.3, -157.86, 21.31, 0.35, -149.9, 61.22, 0.25, -79.38, 43.65, 0.75, -73.57, 45.5, 0.6, -123.12, 49.28, 0.55,
  -114.07, 51.05, 0.4, -113.49, 53.55, 0.35, -75.7, 45.42, 0.4, -97.14, 49.9, 0.3, -71.21, 46.81, 0.3, -63.57, 44.65, 0.25, -99.13, 19.43, 1,
  -103.35, 20.67, 0.6, -100.32, 25.69, 0.6, -98.21, 19.04, 0.45, -117.04, 32.51, 0.45, -101.68, 21.12, 0.35, -106.42, 31.69, 0.4, -89.59, 20.97, 0.3,
  -86.85, 21.16, 0.3, -82.37, 23.11, 0.45, -69.93, 18.49, 0.45, -72.34, 18.54, 0.35, -66.1, 18.47, 0.4, -76.79, 18, 0.3, -90.51, 14.63, 0.45,
  -89.19, 13.69, 0.35, -87.19, 14.07, 0.3, -86.25, 12.13, 0.3, -84.09, 9.93, 0.35, -79.52, 8.98, 0.4,
  // South America
  -46.63, -23.55, 1, -43.17, -22.91, 0.85, -58.38, -34.6, 0.9, -77.04, -12.05, 0.75, -74.07, 4.71, 0.75, -70.67, -33.45, 0.7, -43.94, -19.92, 0.6,
  -66.9, 10.48, 0.55, -47.88, -15.79, 0.5, -51.23, -30.03, 0.5, -34.88, -8.05, 0.5, -38.54, -3.72, 0.5, -38.5, -12.97, 0.5, -49.27, -25.43, 0.5,
  -75.56, 6.24, 0.5, -76.53, 3.45, 0.45, -79.89, -2.19, 0.45, -78.47, -0.18, 0.4, -60.02, -3.12, 0.4, -48.5, -1.46, 0.4, -49.25, -16.69, 0.4,
  -47.06, -22.91, 0.45, -56.16, -34.9, 0.4, -57.58, -25.26, 0.35, -68.15, -16.5, 0.35, -63.18, -17.78, 0.35, -64.18, -31.42, 0.4, -60.64, -32.95, 0.35,
  -68.83, -32.89, 0.3, -74.8, 10.97, 0.35, -71.64, 10.65, 0.35, -71.62, -33.05, 0.3, -71.54, -16.41, 0.25, -48.55, -27.6, 0.3, -35.21, -5.79, 0.3,
  -44.3, -2.53, 0.3,
  // Europe and Turkey
  -0.13, 51.51, 0.95, 2.35, 48.86, 0.95, 37.62, 55.75, 1, 28.98, 41.01, 0.9, -3.7, 40.42, 0.75, 2.17, 41.39, 0.65, 13.4, 52.52, 0.7, 12.5, 41.9, 0.65,
  9.19, 45.46, 0.7, 14.27, 40.85, 0.5, 30.3, 59.93, 0.7, 30.52, 50.45, 0.6, 7, 51.45, 0.75, 9.99, 53.55, 0.55, 11.58, 48.14, 0.55, 8.68, 50.11, 0.5,
  9.18, 48.78, 0.45, 4.9, 52.37, 0.6, 4.48, 51.92, 0.5, 4.35, 50.85, 0.55, 16.37, 48.21, 0.55, 21.01, 52.23, 0.55, 19.04, 47.5, 0.5, 14.42, 50.08, 0.45,
  26.1, 44.43, 0.5, 23.32, 42.7, 0.4, 20.46, 44.79, 0.4, 23.73, 37.98, 0.55, -9.14, 38.72, 0.5, -8.61, 41.15, 0.4, -5.98, 37.39, 0.35, -0.38, 39.47, 0.4,
  -2.24, 53.48, 0.55, -1.9, 52.49, 0.5, -1.55, 53.8, 0.4, -4.25, 55.86, 0.4, -2.98, 53.41, 0.4, -3.19, 55.95, 0.3, -6.26, 53.35, 0.45, 4.83, 45.76, 0.45,
  5.37, 43.3, 0.45, 1.44, 43.6, 0.35, 3.06, 50.63, 0.4, 7.26, 43.7, 0.35, -0.58, 44.84, 0.3, 8.54, 47.38, 0.4, 6.14, 46.2, 0.3, 12.57, 55.68, 0.45,
  18.07, 59.33, 0.45, 10.75, 59.91, 0.4, 24.94, 60.17, 0.4, 11.97, 57.71, 0.3, 24.11, 56.95, 0.3, 25.28, 54.69, 0.3, 27.56, 53.9, 0.4, 19.94, 50.06, 0.35,
  17.04, 51.11, 0.3, 7.69, 45.07, 0.45, 11.26, 43.77, 0.3, 11.34, 44.49, 0.35, 13.36, 38.12, 0.35, 15.09, 37.5, 0.3, 36.23, 49.99, 0.4, 30.73, 46.48, 0.35,
  35.05, 48.46, 0.35, 44, 56.33, 0.4, 49.11, 55.79, 0.4, 50.1, 53.2, 0.4, 44.52, 48.71, 0.35, 39.72, 47.23, 0.4, 39.2, 51.66, 0.35, -21.94, 64.15, 0.25,
  22.94, 40.64, 0.3, 27.14, 38.42, 0.4, 32.86, 39.93, 0.55, 29.06, 40.18, 0.35, 30.71, 36.9, 0.3, 35.32, 37, 0.35, 44.79, 41.72, 0.35, 49.87, 40.41, 0.4,
  44.51, 40.18, 0.3,
  // Russia east of the Volga, Central Asia
  60.6, 56.84, 0.45, 61.4, 55.16, 0.4, 56.25, 58.01, 0.35, 55.96, 54.74, 0.35, 73.37, 54.99, 0.35, 82.93, 55.03, 0.45, 92.87, 56.01, 0.35,
  104.28, 52.29, 0.3, 131.89, 43.12, 0.3, 135.07, 48.48, 0.25, 69.24, 41.3, 0.5, 76.89, 43.24, 0.4, 71.45, 51.17, 0.3, 74.59, 42.87, 0.25,
  58.38, 37.95, 0.25, 68.79, 38.56, 0.25, 69.17, 34.53, 0.4,
  // Middle East
  51.39, 35.69, 0.85, 44.36, 33.31, 0.65, 46.68, 24.71, 0.7, 39.19, 21.49, 0.6, 39.83, 21.42, 0.4, 55.27, 25.2, 0.75, 54.37, 24.45, 0.5, 51.53, 25.29, 0.5,
  47.98, 29.37, 0.55, 58.4, 23.59, 0.4, 50.58, 26.22, 0.35, 50.1, 26.43, 0.45, 35.93, 31.95, 0.45, 34.78, 32.08, 0.55, 35.5, 33.89, 0.4, 36.29, 33.51, 0.45,
  37.16, 36.2, 0.35, 59.6, 36.3, 0.5, 51.67, 32.65, 0.45, 46.29, 38.08, 0.35, 52.53, 29.59, 0.35, 47.78, 30.51, 0.35, 44.21, 15.35, 0.35, 45.03, 12.79, 0.25,
  // South Asia
  77.2, 28.6, 1, 72.88, 19.08, 0.95, 88.36, 22.57, 0.85, 77.59, 12.97, 0.8, 80.27, 13.08, 0.75, 78.49, 17.39, 0.75, 72.57, 23.02, 0.6, 73.86, 18.52, 0.6,
  72.83, 21.17, 0.5, 75.79, 26.91, 0.45, 80.95, 26.85, 0.45, 80.33, 26.45, 0.35, 79.09, 21.15, 0.35, 85.14, 25.59, 0.35, 75.86, 22.72, 0.35, 77.41, 23.26, 0.3,
  76.27, 9.93, 0.35, 76.96, 11, 0.3, 83.22, 17.69, 0.3, 76.78, 30.73, 0.3, 91.74, 26.14, 0.25, 76.94, 8.52, 0.3, 78.12, 9.93, 0.25, 82.97, 25.32, 0.3,
  90.41, 23.81, 0.9, 91.83, 22.36, 0.45, 67, 24.86, 0.85, 74.35, 31.55, 0.75, 73.05, 33.68, 0.45, 73.08, 31.42, 0.4, 71.58, 34.01, 0.35, 85.32, 27.72, 0.35,
  79.86, 6.93, 0.4,
  // East Asia
  139.69, 35.69, 1, 135.5, 34.69, 0.85, 136.91, 35.18, 0.6, 130.4, 33.59, 0.45, 141.35, 43.06, 0.4, 140.87, 38.27, 0.35, 132.46, 34.39, 0.35,
  126.98, 37.57, 0.95, 129.07, 35.18, 0.55, 128.6, 35.87, 0.4, 125.76, 39.04, 0.15, 121.56, 25.03, 0.7, 120.3, 22.63, 0.45, 120.68, 24.15, 0.4,
  121.47, 31.23, 1, 116.4, 39.9, 1, 113.26, 23.13, 0.95, 114.06, 22.54, 0.9, 114.17, 22.32, 0.8, 106.55, 29.56, 0.7, 104.07, 30.67, 0.75, 117.2, 39.13, 0.75,
  114.3, 30.59, 0.7, 108.94, 34.34, 0.6, 118.8, 32.06, 0.6, 120.16, 30.27, 0.65, 120.62, 31.3, 0.5, 123.43, 41.8, 0.55, 126.63, 45.75, 0.5, 125.32, 43.88, 0.4,
  121.61, 38.91, 0.45, 120.38, 36.07, 0.5, 117, 36.65, 0.45, 113.62, 34.75, 0.55, 112.94, 28.23, 0.5, 102.83, 24.88, 0.4, 118.09, 24.48, 0.45, 119.3, 26.08, 0.4,
  117.23, 31.82, 0.45, 108.37, 22.82, 0.35, 114.51, 38.04, 0.45, 112.55, 37.87, 0.4, 103.83, 36.06, 0.35, 87.62, 43.83, 0.35, 106.63, 26.65, 0.35,
  115.86, 28.68, 0.4, 121.55, 29.87, 0.45, 113.75, 23.02, 0.6, 113.12, 23.02, 0.55, 111.75, 40.84, 0.3, 106.92, 47.92, 0.3,
  // Southeast Asia
  100.5, 13.75, 0.9, 106.7, 10.78, 0.75, 105.85, 21.03, 0.65, 101.69, 3.14, 0.75, 103.82, 1.35, 0.75, 106.85, -6.2, 0.95, 112.75, -7.25, 0.6,
  107.61, -6.91, 0.55, 110.42, -6.97, 0.45, 98.67, 3.59, 0.45, 104.76, -2.98, 0.35, 119.42, -5.14, 0.35, 115.22, -8.65, 0.3, 110.37, -7.8, 0.35,
  120.98, 14.6, 0.9, 123.89, 10.32, 0.4, 125.61, 7.07, 0.35, 96.2, 16.84, 0.5, 96.08, 21.97, 0.3, 104.92, 11.56, 0.35, 102.63, 17.97, 0.2,
  108.22, 16.05, 0.3, 100.33, 5.41, 0.35, 98.99, 18.79, 0.25,
  // Oceania
  151.21, -33.87, 0.75, 144.96, -37.81, 0.7, 153.03, -27.47, 0.55, 115.86, -31.95, 0.5, 138.6, -34.93, 0.45, 153.4, -28, 0.35, 149.13, -35.28, 0.3,
  151.78, -32.93, 0.3, 147.33, -42.88, 0.25, 174.76, -36.85, 0.45, 174.78, -41.29, 0.3, 172.64, -43.53, 0.3, 147.18, -9.44, 0.2, 178.44, -18.14, 0.15,
  166.45, -22.27, 0.15, 130.84, -12.46, 0.2, -149.57, -17.53, 0.15,
  // Africa
  3.38, 6.52, 0.85, 31.24, 30.04, 0.95, 15.27, -4.44, 0.55, 28.05, -26.2, 0.75, 28.19, -25.75, 0.5, 31.02, -29.86, 0.45, 18.42, -33.92, 0.55,
  25.6, -33.96, 0.3, 13.23, -8.84, 0.5, 36.82, -1.29, 0.55, 39.67, -4.04, 0.3, 38.74, 9.03, 0.5, 39.28, -6.79, 0.45, 32.53, 15.5, 0.45, 32.58, 0.35, 0.4,
  -0.19, 5.6, 0.45, -1.62, 6.69, 0.3, -4.01, 5.36, 0.5, -17.45, 14.69, 0.4, -7.59, 33.57, 0.55, -6.84, 34.02, 0.35, -8, 31.63, 0.3, -5, 34.03, 0.3,
  -5.83, 35.76, 0.3, 3.06, 36.75, 0.5, -0.64, 35.7, 0.35, 10.18, 36.81, 0.45, 13.19, 32.89, 0.4, 20.07, 32.12, 0.25, 29.92, 31.2, 0.6, 8.52, 12, 0.4,
  3.95, 7.38, 0.4, 7.49, 9.06, 0.35, 7.01, 4.82, 0.35, 9.7, 4.05, 0.35, 11.52, 3.87, 0.35, 28.28, -15.42, 0.35, 31.05, -17.83, 0.35, 32.57, -25.97, 0.3,
  47.5, -18.88, 0.3, -8, 12.64, 0.3, -1.52, 12.37, 0.25, 2.11, 13.51, 0.2, -13.58, 9.64, 0.25, -13.23, 8.48, 0.2, 1.22, 6.13, 0.25, 2.42, 6.37, 0.3,
  45.32, 2.05, 0.3, 30.06, -1.95, 0.25, 27.48, -11.66, 0.3, 17.08, -22.56, 0.2, 25.91, -24.65, 0.2, 28.58, -20.15, 0.2, 32.3, 31.26, 0.3, 38.93, 15.32, 0.15,
  15.24, -4.27, 0.3,
];

/* broad populated regions, a soft glow under the cities: lon, lat, rx, ry, rotation (deg), alpha */
const POPULATED: number[] = [
  // Europe
  8, 49, 14, 5, 0, 0.3, -1.5, 52.5, 2.5, 3, 0, 0.32, 10, 45.3, 3.5, 1.2, 0, 0.3, -4, 40, 6, 4, 0, 0.12, 19, 50.5, 8, 3, 0, 0.2, 38, 54, 9, 4, 0, 0.17,
  31, 48.5, 7, 3, 0, 0.17, 23, 44, 5, 3, 0, 0.14, 30, 39.5, 6, 2, 0, 0.15,
  // Nile, Levant, Mesopotamia, Gulf, northern Iran
  31.2, 27, 0.9, 4.5, 0, 0.4, 31, 30.8, 1.6, 1, 0, 0.35, 35.5, 33, 1, 2, 0, 0.25, 44.5, 33, 3, 2.5, -30, 0.18, 51, 26, 4, 1.5, -35, 0.2, 51.5, 35.5, 5, 2, 0, 0.18,
  // Ganges plain, peninsular India, Bengal, Punjab, Gujarat, Kerala
  81, 26.3, 10, 3, -20, 0.38, 77.5, 16.5, 5.5, 7.5, 0, 0.25, 90, 24, 2.5, 2.5, 0, 0.42, 73.5, 30.5, 3, 2.5, 0, 0.3, 72.5, 22, 2, 2, 0, 0.22, 76.3, 10, 1, 2, -20, 0.22,
  // eastern China, Yangtze and Pearl deltas, Sichuan, the north-east, Fujian coast, Korea, Japan, Taiwan
  116, 34, 6, 6, 0, 0.32, 120, 31, 3, 2, 0, 0.4, 113.5, 23, 2.5, 1.2, 0, 0.45, 105, 30, 3, 2, 0, 0.3, 125, 43, 4, 4, 30, 0.2, 118.5, 25.5, 2, 1, 40, 0.25,
  127.5, 36.5, 1.5, 2, 0, 0.35, 136, 35.5, 5, 2, 35, 0.4, 139.7, 35.8, 1.2, 1, 0, 0.4, 120.5, 23.8, 0.8, 1.6, 20, 0.35,
  // Java, Luzon, Red River and Mekong deltas, central Thailand, the Klang Valley
  110, -7.2, 6, 0.9, 0, 0.4, 121, 15, 1.5, 2.5, 0, 0.2, 105.8, 21, 1.2, 1, 0, 0.3, 106, 10.3, 1.5, 1, 0, 0.3, 100.5, 14.5, 2, 2.5, 0, 0.22, 101.5, 3.5, 1, 1.8, -30, 0.22,
  // eastern US, the north-east corridor, Great Lakes, Florida, Texas, California, Pacific north-west, Ontario and Quebec, central Mexico
  -82, 38, 11, 6, 0, 0.28, -74.5, 40.5, 4, 1.2, 40, 0.35, -86, 41.8, 5, 2, 0, 0.25, -81.5, 27.5, 1.5, 3, 15, 0.25, -96.5, 30.5, 3, 2.5, 0, 0.22,
  -119, 35.5, 2, 4, -35, 0.28, -122.5, 46.5, 1, 2.5, 0, 0.18, -77, 44.5, 4, 1.2, 25, 0.22, -100, 20, 4, 2, 0, 0.28,
  // south-east Brazil, the north-east coast of Brazil, Rio de la Plata, Colombian Andes, central Chile
  -45, -22.5, 6, 2.5, -15, 0.3, -37.5, -8, 1.5, 4, 10, 0.22, -58.5, -34.5, 2, 1.2, 0, 0.25, -75, 5.5, 1.5, 3, 0, 0.2, -71, -34, 1, 2, 0, 0.18,
  // southern Nigeria, Gulf of Guinea coast, Lake Victoria basin, Gauteng, Maghreb coast, Ethiopian highlands
  5, 7, 4, 2, 0, 0.25, -1, 6, 6, 1, 0, 0.15, 33, -0.5, 3, 2, 0, 0.18, 28.1, -26, 1.5, 1.2, 0, 0.3, 2, 35.5, 9, 1.5, 0, 0.18, 38.7, 9, 2, 2, 0, 0.12,
  // south-east Australia
  150.5, -34, 3, 2.5, -40, 0.18,
];

// arid regions: lon, lat, rx, ry, alpha
const ARID: number[] = [
  10, 23, 23, 8, 0.95, 47, 22, 9, 7, 0.9, 71, 27, 4, 3, 0.7, 56, 32, 7, 4, 0.7, 62, 42, 10, 4, 0.6, 105, 42, 12, 4, 0.7, 83, 39, 6, 2.5, 0.8,
  132, -25, 14, 8, 0.85, 21, -23, 6, 5, 0.6, -112, 35, 7, 6, 0.6, -70, -22, 2.5, 6, 0.7, -68, -46, 4, 5, 0.5, 88, 33, 10, 4, 0.55,
  40, 33, 6, 3, 0.6, 30, 18, 6, 6, 0.6,
];

/* ---------------- point queries on the land mask ---------------- */
const bbox = (r: Ring) => {
  let x0 = 999, x1 = -999, y0 = 999, y1 = -999;
  for (let i = 0; i < r.length; i += 2) { x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]); y0 = Math.min(y0, r[i + 1]); y1 = Math.max(y1, r[i + 1]); }
  return [x0, x1, y0, y1];
};
const LAND_BOX = LAND.map(bbox), WATER_BOX = WATER.map(bbox);
function inRing(r: Ring, x: number, y: number) {
  let c = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const yi = r[i + 1], yj = r[j + 1];
    if ((yi > y) !== (yj > y) && x < ((r[j] - r[i]) * (y - yi)) / (yj - yi) + r[i]) c = !c;
  }
  return c;
}
const hit = (rings: Ring[], boxes: number[][], x: number, y: number) =>
  rings.some((r, i) => { const b = boxes[i]; return x >= b[0] && x <= b[1] && y >= b[2] && y <= b[3] && inRing(r, x, y); });
/** true when a point is on land in the (coarse) map data; lakes count as water */
export function isLand(lat: number, lon: number) {
  const x = wrapLon(lon);
  return hit(LAND, LAND_BOX, x, lat) && !hit(WATER, WATER_BOX, x, lat);
}

/** a point `km` away from home along a compass bearing (degrees, 0 north, 90 east) */
export function offsetKm(lat: number, lon: number, bearing: number, km: number) {
  const b = bearing * D2R;
  const dLat = (km * Math.cos(b)) / 111.2;
  const dLon = (km * Math.sin(b)) / (111.2 * Math.max(0.05, Math.cos(lat * D2R)));
  return { lat: Math.max(-89.9, Math.min(89.9, lat + dLat)), lon: wrapLon(lon + dLon) };
}

/**
 * Is home on a coast? Looks at the map in rings around home and returns the
 * compass bearing toward the sea and the rough distance to it, or null inland.
 * Natural Earth at this scale is only good to about 10 km, so this is a guess;
 * site.home.terrain.coast can always set the bearing by hand.
 */
export function detectCoast(lat: number, lon: number): { bearing: number; km: number } | null {
  let sx = 0, sy = 0, wet = 0, n = 0, near = 99;
  const radii = [6, 12, 20, 30, 42];
  for (const km of radii) {
    for (let b = 0; b < 360; b += 15) {
      const p = offsetKm(lat, lon, b, km);
      n++;
      if (isLand(p.lat, p.lon)) continue;
      wet++;
      const w = 1 / km; // nearby water counts more
      sx += Math.sin(b * D2R) * w; sy += Math.cos(b * D2R) * w;
      near = Math.min(near, km);
    }
  }
  const homeWet = !isLand(lat, lon);
  if (!homeWet && wet / n < 0.04) return null;
  if (Math.hypot(sx, sy) < 1e-6) return null; // water all round in equal measure: no single side to show
  const bearing = ((Math.atan2(sx, sy) / D2R) + 360) % 360;
  return { bearing, km: homeWet ? 3 : near };
}

/* ---------------- the sun ---------------- */
/**
 * Where the sun is, as a unit vector. It is placed relative to home, so every
 * home city gets the same picture: deep night, with the dawn terminator about
 * 47 degrees away toward the east (home is 137 degrees from the sun). If that
 * would put the sun too far north or south to be believable (the subsolar point
 * stays within about 25 degrees of the equator), the sun swings around toward
 * the equator side until it fits.
 */
export function sunDirection(lat: number, lon: number, out = new THREE.Vector3()) {
  const up = dir(lat, lon);
  const { east, north } = tangents(lat, lon);
  const UP = -0.7299, H = Math.sqrt(1 - UP * UP);
  const a0 = Math.atan2(0.6576, -0.1866); // east-south-east, as tuned for the demo city
  const maxY = Math.sin(25 * D2R);
  const at = (a: number) => out.copy(up).multiplyScalar(UP).addScaledVector(east, H * Math.sin(a)).addScaledVector(north, H * Math.cos(a));
  let best = a0, bestY = Infinity;
  for (let k = 0; k <= 90; k++) {
    for (const s of k ? [1, -1] : [1]) {
      const a = a0 + s * k * 2 * D2R;
      // never swing the dawn round to the west
      if (Math.sin(a) < 0.05) continue;
      const y = Math.abs(at(a).y);
      if (y <= maxY) return out.normalize();
      if (y < bestY) { bestY = y; best = a; }
    }
  }
  return at(best).normalize();
}

/** Paint the land mask (R), urban glow (G) and aridity (B) into a canvas. */
export function paintEarth(width: number) {
  const W = width, H = width / 2;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d")!;
  const px = (lon: number) => ((lon + 180) / 360) * W;
  const py = (lat: number) => ((90 - lat) / 180) * H;
  // land is painted small and scaled up softly, so the shader can roughen
  // the coastline with noise instead of showing straight polygon edges
  const sw = Math.min(2048, W / 2), sh = sw / 2;
  const small = document.createElement("canvas");
  small.width = sw; small.height = sh;
  const sg = small.getContext("2d")!;
  const sring = (r: Ring) => {
    sg.beginPath();
    for (let i = 0; i < r.length; i += 2) {
      const x = ((r[i] + 180) / 360) * sw, y = ((90 - r[i + 1]) / 180) * sh;
      if (i === 0) sg.moveTo(x, y); else sg.lineTo(x, y);
    }
    sg.closePath();
    sg.fill();
  };
  sg.fillStyle = "#000";
  sg.fillRect(0, 0, sw, sh);
  sg.fillStyle = "rgb(255,0,0)";
  LAND.forEach(sring);
  sg.fillStyle = "#000";
  WATER.forEach(sring);
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  // a wider soft band gives the shader room to fractalise the coast up close
  g.filter = `blur(${Math.round(W / 560)}px)`;
  g.drawImage(small, 0, 0, W, H);
  g.filter = "none";
  // home is always on land, even where the coarse coastline puts it in the sea
  // (small islands, harbour cities): a little solid patch under the city
  {
    const hx = px(HOME.lon), hy = py(HOME.lat), r = (W / 360) * 0.32;
    const grd = g.createRadialGradient(hx, hy, 0, hx, hy, r);
    grd.addColorStop(0, "rgba(255,0,0,1)");
    grd.addColorStop(0.55, "rgba(255,0,0,1)");
    grd.addColorStop(1, "rgba(255,0,0,0)");
    g.globalCompositeOperation = "lighten";
    g.fillStyle = grd;
    g.fillRect(hx - r, hy - r, r * 2, r * 2);
    g.globalCompositeOperation = "source-over";
  }

  g.globalCompositeOperation = "lighter";
  const k = W / 360; // pixels per degree
  const blob = (lon: number, lat: number, rx: number, ry: number, rot: number, a: number, rgb: string) => {
    g.save();
    g.translate(px(lon), py(lat));
    g.rotate((rot * Math.PI) / 180);
    g.scale(1, ry / rx);
    const r = rx * k;
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grd.addColorStop(0, `rgba(${rgb},${a})`);
    grd.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  for (let i = 0; i < POPULATED.length; i += 6) blob(POPULATED[i], POPULATED[i + 1], POPULATED[i + 2], POPULATED[i + 3], POPULATED[i + 4], POPULATED[i + 5], "0,255,0");
  // the home city always glows, even if it is not in the list above
  blob(HOME.lon, HOME.lat, 1.6, 1.6, 0, 0.35, "0,255,0");
  blob(HOME.lon, HOME.lat, 0.85, 0.85, 0, 1, "0,255,0");
  for (let i = 0; i < CITIES.length; i += 3) {
    const w = CITIES[i + 2];
    blob(CITIES[i], CITIES[i + 1], 0.3 + w * 0.6, 0.3 + w * 0.6, 0, Math.min(1, 0.45 + w * 0.55), "0,255,0");
  }
  for (let i = 0; i < ARID.length; i += 5) blob(ARID[i], ARID[i + 1], ARID[i + 2], ARID[i + 3], 0, ARID[i + 4], "0,0,255");
  g.globalCompositeOperation = "source-over";

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  return tex;
}

/** Small, fast 2D canvas painter for the loader globe: land outline only. */
export function landRings() {
  return LAND;
}
