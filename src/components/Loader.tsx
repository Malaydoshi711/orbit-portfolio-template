import { forwardRef, useMemo } from "react";
import { landRings, HOME } from "../world/geo";
import { site } from "../data/content";

const CX = 200, CY = 200, RG = 104;
const D2R = Math.PI / 180;

/** Orthographic projection for the boot globe, centred near the home city. */
function project(lon: number, lat: number, lon0: number, lat0: number) {
  const la = lat * D2R, lo = (lon - lon0) * D2R, la0 = lat0 * D2R;
  const cosc = Math.sin(la0) * Math.sin(la) + Math.cos(la0) * Math.cos(la) * Math.cos(lo);
  const x = Math.cos(la) * Math.sin(lo);
  const y = Math.cos(la0) * Math.sin(la) - Math.sin(la0) * Math.cos(la) * Math.cos(lo);
  return { x: CX + x * RG, y: CY - y * RG, front: cosc > 0 };
}

function buildPaths(lon0: number, lat0: number) {
  const land: string[] = [];
  for (const r of landRings()) {
    let d = "", pen = false;
    for (let i = 0; i <= r.length; i += 2) {
      const j = i % r.length;
      const p = project(r[j], r[j + 1], lon0, lat0);
      // the data's own seams (the date line, the south pole edge) are not coastline
      const k = (j + r.length - 2) % r.length;
      const seam = i > 0 && ((Math.abs(r[j]) > 179.8 && Math.abs(r[k]) > 179.8) || (r[j + 1] < -84 && r[k + 1] < -84));
      if (!p.front || seam) { pen = false; if (!p.front) continue; }
      d += `${pen ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      pen = true;
    }
    if (d) land.push(d);
  }
  const grid: string[] = [];
  for (let lat = -60; lat <= 60; lat += 30) {
    let d = "", pen = false;
    for (let lon = -180; lon <= 180; lon += 4) {
      const p = project(lon, lat, lon0, lat0);
      if (!p.front) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`; pen = true;
    }
    grid.push(d);
  }
  for (let lon = -180; lon < 180; lon += 30) {
    let d = "", pen = false;
    for (let lat = -88; lat <= 88; lat += 4) {
      const p = project(lon, lat, lon0, lat0);
      if (!p.front) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`; pen = true;
    }
    grid.push(d);
  }
  // a sun-synchronous style ground track crossing home
  let track = "", pen = false;
  for (let k = -90; k <= 90; k += 2) {
    const lat = HOME.lat + k * 0.85;
    const lon = HOME.lon - k * 0.32 + Math.sin(k * D2R * 2) * 6;
    if (lat > 82 || lat < -82) continue;
    const p = project(lon, lat, lon0, lat0);
    if (!p.front) { pen = false; continue; }
    track += `${pen ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`; pen = true;
  }
  const home = project(HOME.lon, HOME.lat, lon0, lat0);
  return { land, grid, track, home };
}

/** Mission boot: a small globe, its ground track and the orbit drawing in. */
const Loader = forwardRef<HTMLDivElement>(function Loader(_, ref) {
  const g = useMemo(() => buildPaths(HOME.lon + 2.1, Math.max(-60, Math.min(60, HOME.lat - 4.5))), []);
  const orbit = "M33.1,241.6 A172,54 -14 0 1 366.9,158.4 A172,54 -14 0 1 33.1,241.6";
  const front = "M366.9,158.4 A172,54 -14 0 1 33.1,241.6";
  return (
    <div className="loader" ref={ref} role="status" aria-live="polite">
      <div className="loader__stage">
        <svg className="loader__globe" viewBox="0 0 400 400" aria-hidden="true">
          <defs>
            <radialGradient id="lg-limb" cx="62%" cy="38%" r="70%">
              <stop offset="0%" stopColor="#0d1c36" />
              <stop offset="70%" stopColor="#060d1d" />
              <stop offset="100%" stopColor="#03060f" />
            </radialGradient>
            <clipPath id="lg-clip"><circle cx={CX} cy={CY} r={RG} /></clipPath>
          </defs>
          <path className="loader__orbit loader__orbit--back" d={orbit} />
          <circle cx={CX} cy={CY} r={RG + 7} className="loader__halo" />
          <circle cx={CX} cy={CY} r={RG} fill="url(#lg-limb)" />
          <g clipPath="url(#lg-clip)">
            {g.grid.map((d, i) => <path key={i} d={d} className="loader__grid" />)}
            {g.land.map((d, i) => <path key={i} d={d} pathLength={1} className="loader__land" />)}
            <path d={g.track} pathLength={1} className="loader__track" />
          </g>
          <circle cx={CX} cy={CY} r={RG} className="loader__rim" />
          <circle cx={g.home.x} cy={g.home.y} r="3" className="loader__home" />
          <circle cx={g.home.x} cy={g.home.y} r="3" className="loader__ping" />
          <path className="loader__orbit loader__orbit--front" d={front} />
          <g className="loader__sat">
            <rect x="-7" y="-1.5" width="14" height="3" rx="0.5" />
            <rect x="-2" y="-2.5" width="4" height="5" rx="0.8" />
            <animateMotion dur="5.5s" repeatCount="indefinite" path={orbit} rotate="auto" />
            <animate attributeName="opacity" dur="5.5s" repeatCount="indefinite" values="0.25;0.25;1;1;0.25" keyTimes="0;0.47;0.53;0.97;1" />
          </g>
        </svg>
      </div>
      <div className="loader__inner">
        <p className="loader__kicker">Orbit to {site.home.city} <span>/</span> {site.tagline}</p>
        <p className="loader__count"><span className="loader__num">000</span><i>%</i></p>
        <p className="loader__step">Establishing telemetry uplink</p>
        <div className="loader__bar"><i /></div>
        <ol className="loader__log" aria-hidden="true" />
      </div>
    </div>
  );
});

export default Loader;
