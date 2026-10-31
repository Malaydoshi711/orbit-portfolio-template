/* Development only: preview another home city without editing content.ts.
 *   http://localhost:5173/?home=51.507,-0.128,London
 *   ...&venues=35.68,139.69;-33.87,151.21   (moves the publication pins, in order)
 *   ...&coast=180   (or coast=none, coast=auto)
 * It must be imported before anything that reads site.home. Production builds ignore it. */
import { publications, site } from "./data/content";

if (import.meta.env.DEV) {
  const q = new URLSearchParams(location.search);
  const home = q.get("home");
  if (home) {
    const [lat, lon, ...name] = home.split(",");
    if (isFinite(+lat) && isFinite(+lon)) {
      site.home.lat = +lat;
      site.home.lon = +lon;
      if (name.length) site.home.city = name.join(",");
    }
  }
  const coast = q.get("coast");
  if (coast) (site.home.terrain as { coast?: unknown }).coast = coast === "none" ? null : coast === "auto" ? "auto" : +coast;
  const venues = q.get("venues");
  if (venues) {
    venues.split(";").forEach((v, i) => {
      const [lat, lon, ...name] = v.split(",");
      const p = publications[i];
      if (p && isFinite(+lat) && isFinite(+lon)) p.geo = { city: name.join(",") || p.geo?.city || `Venue ${i + 1}`, lat: +lat, lon: +lon };
    });
  }
}
