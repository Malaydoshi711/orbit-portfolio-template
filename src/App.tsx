import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";
import { World, PASSES, type GeoLabel, type Telemetry } from "./world/World";
import { ROUTE_AT, SPAN, type SectionId } from "./world/route";
import { HOME, VENUES, nearHome } from "./world/geo";
import { PART_HEX } from "./world/palette";
import Loader from "./components/Loader";
import Cursor from "./components/Cursor";
import Agent from "./components/Agent";
import Palette, { type Command } from "./components/Palette";
import { certifications, education, experience, featured, profile, projectClasses, projects, publications, site, skills, type Category } from "./data/content";

gsap.registerPlugin(ScrollTrigger, SplitText);

/* ---------- everything below is derived from content.ts ---------- */
const HAS_RESEARCH = publications.length > 0;
const FLAG_LABEL = featured.navLabel || featured.title;
const CITY = site.home.city;

const NAV_BASE: { id: SectionId; label: string; show: boolean }[] = [
  { id: "about", label: "About", show: true },
  { id: "experience", label: "Experience", show: experience.length > 0 },
  { id: "research", label: "Research", show: HAS_RESEARCH },
  { id: "flagship", label: FLAG_LABEL, show: true },
  { id: "projects", label: "Projects", show: projects.length > 0 },
  { id: "toolkit", label: "Toolkit", show: skills.length + certifications.length > 0 },
  { id: "contact", label: "Contact", show: true },
];
const NAV_SHOWN = NAV_BASE.filter((n) => n.show);
const NAV = NAV_SHOWN.map((n, i) => ({ ...n, pass: n.id === "contact" ? "LND" : String(i + 1).padStart(2, "0") }));
const PASS_TOTAL = String(NAV.length - 1).padStart(2, "0");
const passOf = (id: SectionId) => NAV.find((n) => n.id === id)?.pass ?? "00";
const ORDER: SectionId[] = (["about", "experience", "research", "flagship", "reentry", "projects", "toolkit", "contact"] as SectionId[])
  .filter((id) => id === "reentry" || NAV.some((n) => n.id === id));

const toneOf = (c: Category) => projectClasses.find((x) => x.name === c)?.tone ?? 1;
const CLASSES = projectClasses.filter((c) => projects.some((p) => p.category === c.name));

/** "#" placeholders open nothing new; real links open in a new tab */
const ext = (href: string) => (href && href !== "#" ? { href, target: "_blank", rel: "noreferrer" } : { href: href || "#" });
const real = (href?: string) => !!href && href !== "#";
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const NUM = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
const RESUME_NAME = site.resume.split("/").pop() || "Resume.pdf";

const fmtLat = (v: number) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "N" : "S"}`;
const fmtLon = (v: number) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "E" : "W"}`;
const fmtLL = (lat: number, lon: number) => `${fmtLat(lat)} ${fmtLon(lon)}`;
const fmtAlt = (km: number) => (km >= 100 ? `${Math.round(km).toLocaleString("en-US")} km` : km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(km * 1000)} m`);
const passLL = (id: SectionId) => { const p = PASSES[id]; return p?.kind === "orbit" ? fmtLL(p.spec.lat, p.spec.lon) : fmtLL(HOME.lat, HOME.lon); };
const HOME_LL = fmtLL(HOME.lat, HOME.lon);

const NAME_LINES = (() => {
  const w = profile.name.trim().split(/\s+/);
  return w.length < 2 ? [w[0]] : [w[0], w.slice(1).join(" ")];
})();
const NAME_LEN = Math.max(...NAME_LINES.map((l) => l.length + (l === NAME_LINES[1] ? 0.6 : 0)));

const pubNoun = publications.some((p) => /talk/i.test(p.where)) ? "papers and talks" : publications.length === 1 ? "paper" : "papers";
const RESEARCH_H = `${NUM[publications.length] ?? publications.length} ${pubNoun}, traced from ${CITY}.`;
const RESEARCH_TAG = (() => {
  const pinned = publications.filter((p) => p.geo).map((p) => p.geo!.city);
  const cities = [...new Set(pinned)];
  const unpinned = publications.filter((p) => !p.geo).map((p) => p.venue);
  let t = cities.length ? `As you scroll, an arc flies from ${CITY} to each venue: ${list(cities)}.` : `Each entry below was published or presented from ${CITY}.`;
  if (cities.length && unpinned.length) t += ` ${list(unpinned)} ${unpinned.length > 1 ? "have" : "has"} no city on record, so ${unpinned.length > 1 ? "they get" : "it gets"} no pin.`;
  return t;
})();

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const loader = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const tele = useRef<{ alt?: HTMLElement | null; lat?: HTMLElement | null; lon?: HTMLElement | null; bar?: HTMLElement | null }>({});
  const geo = useRef<{ el: HTMLElement | null; kind: GeoLabel["kind"]; index?: number }[]>([]);
  const lenisRef = useRef<Lenis | null>(null);
  const worldRef = useRef<World | null>(null);
  const userPicked = useRef(false);

  const [active, setActive] = useState<SectionId | "hero">("hero");
  const [paper, setPaper] = useState(-1);
  const [agent, setAgent] = useState(0);
  const [focus, setFocus] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [noGL, setNoGL] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentSeed, setAgentSeed] = useState<string | undefined>();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState("");

  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.matchMedia("(max-width: 820px), (pointer: coarse)").matches;
    const hq = /[?&]hq\b/.test(location.search);
    let world: World | null = null;
    let lenis: Lenis | null = null;
    let dead = false;
    const cleanups: (() => void)[] = [];
    const L = loader.current!;
    const num = L.querySelector<HTMLElement>(".loader__num")!;
    const step = L.querySelector<HTMLElement>(".loader__step")!;
    const bar = L.querySelector<HTMLElement>(".loader__bar i")!;
    const log = L.querySelector<HTMLElement>(".loader__log")!;
    document.documentElement.classList.add("is-loading");
    log.textContent = ""; // StrictMode runs this effect twice in dev
    if (reduce) document.documentElement.classList.add("reduce");

    const ctx = gsap.context(() => {}, root);
    const counter = { v: 0 };
    const paint = () => {
      num.textContent = String(Math.round(counter.v)).padStart(3, "0");
      bar.style.transform = `scaleX(${counter.v / 100})`;
    };
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // GSAP pauses with requestAnimationFrame in hidden tabs, so every wait is
    // raced against a timer and the counter is set explicitly afterwards
    const setCount = async (to: number, label: string, dur = 0.5) => {
      step.textContent = label;
      const li = document.createElement("li");
      li.textContent = label;
      log.appendChild(li);
      const tw = gsap.to(counter, { v: to, duration: reduce ? 0 : dur, ease: "power2.out", onUpdate: paint });
      await Promise.race([tw.then(() => null), wait(dur * 1000 + 250)]);
      tw.kill();
      counter.v = to;
      paint();
    };

    const boot = async () => {
      await setCount(16, "Establishing telemetry uplink", 0.55);
      await Promise.race([new Promise((r) => requestAnimationFrame(() => r(null))), wait(60)]);
      if (dead) return;
      try {
        world = new World(canvas.current!, { mobile, reduce, hq, parts: featured.parts.length, research: HAS_RESEARCH });
        worldRef.current = world;
        if (import.meta.env.DEV || /[?&]debug\b/.test(location.search)) (window as unknown as { __world: World }).__world = world;
      } catch (e) {
        console.warn("WebGL unavailable, using the static background", e);
        setNoGL(true);
      }
      await setCount(48, "Painting the land mask and city lights", 0.5);
      await Promise.race([document.fonts.ready, wait(2500)]);
      if (dead) return;

      /* ---- scroll position -> descent progress ---- */
      const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-sec]"));
      const pubs = Array.from(document.querySelectorAll<HTMLElement>(".pub"));
      const researchEl = document.getElementById("research");
      let anchors: [number, number][] = [[0, 0], [1, 1]];
      let lastActive = "";
      let lastPaper = -2;
      const computeAnchors = () => {
        const vh = window.innerHeight;
        const max = Math.max(1, document.documentElement.scrollHeight - vh);
        const list: [number, number][] = [[0, 0]];
        sections.forEach((el) => {
          const id = el.dataset.sec as SectionId;
          const at = ROUTE_AT[id];
          const top = el.getBoundingClientRect().top + window.scrollY;
          const h = el.offsetHeight;
          const span = SPAN[id];
          if (span) list.push([top, at - span], [Math.max(top + 1, top + h - vh), at + span]);
          else if (id === "contact") list.push([Math.min(max - 1, top + h / 2 - vh / 2), at]);
          else list.push([top + h / 2 - vh / 2, at]);
        });
        list.push([max, 1]);
        anchors = list.filter((a, i) => i === 0 || (a[0] > list[i - 1][0] && a[1] > list[i - 1][1]));
        onScroll();
      };
      const routeAt = (y: number) => {
        for (let i = 1; i < anchors.length; i++) {
          const [y0, p0] = anchors[i - 1], [y1, p1] = anchors[i];
          if (y <= y1) return p0 + ((p1 - p0) * Math.max(0, y - y0)) / (y1 - y0);
        }
        return 1;
      };
      const stickyMode = () => window.matchMedia("(min-width: 900px) and (min-height: 600px)").matches;

      function onScroll() {
        const y = window.scrollY;
        const p = routeAt(y);
        world?.setProgress(p);
        if (tele.current.bar) tele.current.bar.style.transform = `scaleX(${p})`;
        let id: SectionId | "hero" = "hero";
        for (const s of ORDER) if (p >= ROUTE_AT[s] - (SPAN[s] ?? 0) - 0.05) id = s;
        if (id !== lastActive) {
          lastActive = id;
          setActive(id);
          world?.setSection(id);
          document.documentElement.dataset.phase = p >= 0.6 ? "ground" : "orbit";
        }
        // which paper is in focus: drives the arcs on the globe
        let pi = -1;
        if (researchEl && id === "research") {
          if (stickyMode()) {
            const top = researchEl.getBoundingClientRect().top + y;
            const local = (y - top) / Math.max(1, researchEl.offsetHeight - window.innerHeight);
            const n = publications.length;
            pi = local < -0.25 ? -1 : Math.min(n - 1, Math.max(0, Math.floor((local + 0.1) * n)));
          } else {
            const mid = window.innerHeight * 0.55;
            pubs.forEach((el, i) => { if (el.getBoundingClientRect().top < mid) pi = i; });
          }
        }
        if (pi !== lastPaper) { lastPaper = pi; setPaper(pi); world?.setPaper(pi); }
      }

      if (!reduce) {
        lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
        lenisRef.current = lenis;
        lenis.on("scroll", ScrollTrigger.update);
        const raf = (time: number) => lenis!.raf(time * 1000);
        gsap.ticker.add(raf);
        cleanups.push(() => { gsap.ticker.remove(raf); lenis!.destroy(); lenisRef.current = null; });
        lenis.stop();
      }
      ctx.add(() => buildScroll(mobile, reduce));
      ScrollTrigger.addEventListener("refresh", computeAnchors);
      cleanups.push(() => ScrollTrigger.removeEventListener("refresh", computeAnchors));
      window.addEventListener("scroll", onScroll, { passive: true });
      cleanups.push(() => window.removeEventListener("scroll", onScroll));
      ScrollTrigger.refresh();
      computeAnchors();

      const onMove = (e: PointerEvent) => {
        if (e.pointerType === "mouse") document.documentElement.classList.add("cursor-live");
        world?.setPointer((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      };
      const onResize = () => world?.resize();
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("resize", onResize);
      cleanups.push(() => { window.removeEventListener("pointermove", onMove); window.removeEventListener("resize", onResize); });

      if (world) {
        world.setLabels(geo.current.filter((l) => l.el) as GeoLabel[]);
        world.onDegrade = (lvl) => { if (lvl >= 2) document.documentElement.classList.add("lowfx"); };
        world.onTelemetry = (t: Telemetry) => {
          const h = tele.current;
          if (h.alt) h.alt.textContent = fmtAlt(t.altKm);
          if (h.lat) h.lat.textContent = fmtLat(t.lat);
          if (h.lon) h.lon.textContent = fmtLon(t.lon);
        };
      }

      await setCount(84, "Compiling atmosphere and terrain shaders", 0.4);
      if (dead) return;
      try { world?.warm(); } catch (e) { console.warn(e); }
      await setCount(100, `Target acquired: ${CITY}, ${HOME_LL}`, 0.45);
      if (dead) return;

      document.documentElement.classList.remove("is-loading");
      world?.setIntro(reduce ? 1 : 0);
      world?.start();
      // let the first frames (and any late shader compiles) land before the
      // intro starts, and keep lag smoothing on so a hitch can't skip it
      gsap.ticker.lagSmoothing(250, 33);
      const unsmooth = setTimeout(() => gsap.ticker.lagSmoothing(0), 1500);
      cleanups.push(() => clearTimeout(unsmooth));
      for (let i = 0; i < 2; i++) await Promise.race([new Promise((r) => requestAnimationFrame(() => r(null))), wait(120)]);
      if (dead) return;
      ctx.add(() => {
        const tl = gsap.timeline({ onComplete: () => { gsap.ticker.lagSmoothing(0); lenis?.start(); } });
        if (reduce) {
          tl.set(L, { autoAlpha: 0 });
          return;
        }
        const intro = { v: 0 };
        tl.to(".loader__inner", { y: -30, autoAlpha: 0, duration: 0.55, ease: "power3.in" }, 0.15)
          .to(".loader__stage", { scale: 1.8, autoAlpha: 0, duration: 1.0, ease: "power2.in" }, 0.1)
          .to(L, { autoAlpha: 0, duration: 0.9, ease: "power2.inOut" }, 0.7)
          .to(intro, { v: 1, duration: 3.4, ease: "power2.out", onUpdate: () => world?.setIntro(intro.v) }, 0.55)
          .fromTo(".hero__name .ch", { yPercent: 115 }, { yPercent: 0, duration: 1.3, stagger: 0.035, ease: "expo.out" }, 1.2)
          .fromTo(".hero__kicker, .hero__meta > *, .hud__fade", { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.05, ease: "power3.out", clearProps: "transform" }, 1.7);
      });
    };
    boot();

    return () => {
      dead = true;
      cleanups.forEach((c) => c());
      ctx.revert();
      world?.dispose();
      worldRef.current = null;
      document.documentElement.classList.remove("is-loading");
    };
  }, []);

  /* ---------------- navigation ---------------- */
  const go = useCallback((id: string) => {
    setMenu(false);
    const to = (y: number) => {
      if (lenisRef.current) lenisRef.current.scrollTo(y, { duration: 2.6 });
      else window.scrollTo(0, y);
    };
    if (id === "top") return to(0);
    const el = document.getElementById(id);
    if (!el) return;
    const vh = window.innerHeight;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const max = document.documentElement.scrollHeight - vh;
    const span = SPAN[id as SectionId];
    if (span) to(top + (id === "research" ? vh * 0.1 : 0));
    else to(Math.min(max, top + el.offsetHeight / 2 - vh / 2));
  }, []);

  const openAgent = useCallback((seed?: string) => { setAgentSeed(seed); setAgentOpen(true); }, []);
  const closeAgent = useCallback(() => { setAgentOpen(false); setAgentSeed(undefined); }, []);
  const flash = useCallback((m: string) => setToast(m), []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2200); return () => clearTimeout(t); }, [toast]);
  const copyEmail = useCallback(async () => {
    try { await navigator.clipboard.writeText(profile.email); flash("Email address copied"); }
    catch { window.location.href = `mailto:${profile.email}`; }
  }, [flash]);
  const downloadResume = useCallback(() => {
    const a = document.createElement("a");
    a.href = site.resume;
    a.download = RESUME_NAME;
    a.click();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("has-dialog", agentOpen || paletteOpen);
    const l = lenisRef.current;
    if (!l) return;
    if (agentOpen || paletteOpen) l.stop(); else l.start();
  }, [agentOpen, paletteOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // flagship: the pipeline steps through its parts until the visitor picks one
  useEffect(() => {
    if (active !== "flagship" || userPicked.current || featured.parts.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setAgent((a) => (a + 1) % featured.parts.length), 2600);
    return () => clearInterval(t);
  }, [active]);
  useEffect(() => { worldRef.current?.setAgent(agent); }, [agent]);
  const pickAgent = (i: number) => { userPicked.current = true; setAgent(i); };

  const commands: Command[] = useMemo(() => [
    { id: "agent", label: "Ask my agent a question", hint: "AI", run: () => openAgent() },
    { id: "resume", label: "Download resume (PDF)", hint: "PDF", run: downloadResume },
    { id: "email", label: "Copy email address", run: copyEmail },
    ...featured.links.filter((l) => real(l.href)).map((l, i) => ({ id: `flag-${i}`, label: `${featured.title}: ${l.label}`, run: () => window.open(l.href, "_blank", "noopener") })),
    ...NAV.map((r) => ({ id: `go-${r.id}`, label: `Go to ${r.label}`, hint: r.pass === "LND" ? "Landing" : `Pass ${r.pass}`, run: () => go(r.id) })),
    { id: "go-top", label: "Back to orbit", run: () => go("top") },
    ...site.socials.filter((x) => real(x.href)).map((x) => ({ id: `social-${x.label}`, label: `Open ${x.label}`, run: () => window.open(x.href, "_blank", "noopener") })),
  ], [go, openAgent, downloadResume, copyEmail]);

  const activeNav = NAV.findIndex((n) => n.id === active);
  const passLabel = active === "hero" ? "Orbit" : active === "reentry" ? "Re-entry" : active === "contact" ? "Landing" : `${NAV[activeNav]?.pass ?? "00"} / ${PASS_TOTAL}`;
  const [emailUser, emailHost] = profile.email.split("@");
  const part = featured.parts[agent] ?? featured.parts[0];
  let geoI = 0;
  const geoRef = (kind: GeoLabel["kind"], index?: number) => {
    const slot = geoI++;
    return (el: HTMLElement | null) => { geo.current[slot] = { el, kind, index }; };
  };
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <div ref={root}>
      <a className="skip" href="#about">Skip to content</a>
      <canvas className={`world${noGL ? " world--none" : ""}`} ref={canvas} aria-hidden="true" />
      {noGL && <div className="nogl" aria-hidden="true"><i /></div>}
      <div className="scrim" aria-hidden="true" />
      <div className="geo" aria-hidden="true">
        <span className="geo__l geo__l--home" ref={geoRef("home")}><span className="geo__in"><b>{CITY}</b>home base</span></span>
        {VENUES.map((v, i) => (
          // World flips a label to the left of its pin when the pin is on the right of the screen
          <span key={`${v.city}-${i}`} className="geo__l" ref={geoRef("venue", i)}>
            <span className="geo__in"><b>{v.city}</b>{v.venue}</span>
          </span>
        ))}
        <span className="geo__l geo__l--beacon" ref={geoRef("beacon")}><b>{CITY}</b>{HOME_LL}</span>
      </div>
      <Loader ref={loader} />
      <Cursor />

      {/* ---------------- HUD ---------------- */}
      <header className="hud">
        <div className="hud__top">
          <a href="#top" className="brand hud__fade" onClick={(e) => { e.preventDefault(); go("top"); }} aria-label={`${profile.name}, back to orbit`}>
            <svg viewBox="0 0 32 32" aria-hidden="true" className="brand__mark">
              <circle cx="16" cy="16" r="8.5" />
              <ellipse cx="16" cy="16" rx="14.5" ry="5" transform="rotate(-20 16 16)" />
              <circle cx="28.6" cy="11.4" r="1.9" className="brand__sat" />
            </svg>
            <span className="brand__name">{profile.name}</span>
          </a>
          <dl className="tele hud__fade" aria-label="Descent telemetry">
            <div><dt>Alt</dt><dd ref={(el) => (tele.current.alt = el)}>4,969 km</dd></div>
            <div className="tele__ll"><dt>Lat</dt><dd ref={(el) => (tele.current.lat = el)}>{fmtLat(nearHome(-24.5, -3.9).lat)}</dd></div>
            <div className="tele__ll"><dt>Lon</dt><dd ref={(el) => (tele.current.lon = el)}>{fmtLon(nearHome(-24.5, -3.9).lon)}</dd></div>
            <div><dt>Pass</dt><dd>{passLabel}</dd></div>
          </dl>
          <button className="hud__menu hud__fade" aria-expanded={menu} aria-controls="passes" onClick={() => setMenu((m) => !m)}>
            {menu ? "Close" : "Passes"}
          </button>
        </div>
        <div className="hud__progress hud__fade" aria-hidden="true"><i ref={(el) => (tele.current.bar = el)} /></div>
        <nav id="passes" className={`passes hud__fade${menu ? " passes--open" : ""}`} aria-label="Sections">
          <ol>
            {NAV.map((n, i) => (
              <li key={n.id} className={i === activeNav ? "is-on" : i < activeNav ? "is-past" : ""}>
                <a href={`#${n.id}`} onClick={(e) => { e.preventDefault(); go(n.id); }} aria-current={i === activeNav ? "true" : undefined}>
                  <span className="passes__n">{n.pass}</span>
                  <span className="passes__l">{n.label}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="dock hud__fade">
          <button className="dock__btn dock__btn--agent" onClick={() => openAgent()} data-cursor="Ask">
            <i aria-hidden="true" /> Ask my agent
          </button>
          <a className="dock__btn" href={site.resume} download={RESUME_NAME} data-cursor="PDF">Resume</a>
          <button className="dock__btn dock__btn--kbd" onClick={() => setPaletteOpen(true)} aria-label="Open command menu">
            <kbd>{isMac ? "⌘" : "Ctrl"}</kbd><kbd>K</kbd>
          </button>
        </div>
      </header>

      <Agent open={agentOpen} onClose={closeAgent} seed={agentSeed} />
      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} onAsk={(q) => openAgent(q)} />
      <p className={`toast${toast ? " toast--on" : ""}`} role="status" aria-live="polite">{toast}</p>

      <main>
        {/* ---------------- HERO ---------------- */}
        <section className="hero" id="top">
          <p className="hero__kicker kicker"><span className="dot" /> Orbit to {CITY} <span className="sep">/</span> {site.tagline}</p>
          <h1 className="hero__name" aria-label={profile.name} style={{ ["--len" as string]: NAME_LEN }}>
            {NAME_LINES.map((line, li) => (
              <span key={li} className={`hero__line${li ? " hero__line--2" : ""}`} aria-hidden="true">
                {[...line].map((c, i) => <span className="ch" key={i}>{c === " " ? "\u00a0" : c}</span>)}
              </span>
            ))}
          </h1>
          <div className="hero__meta">
            <p className="hero__role">{profile.role}<span>{profile.company}, {CITY}</span></p>
            <p className="hero__lede">{profile.intro}</p>
            <div className="hero__actions">
              <button className="btn btn--solid" onClick={() => openAgent()} data-cursor="Ask">Ask my agent</button>
              <a className="btn" href={site.resume} download={RESUME_NAME} data-cursor="PDF">Download resume</a>
            </div>
          </div>
          <p className="hero__scroll"><i aria-hidden="true" /> Scroll to begin the descent</p>
        </section>

        {/* ---------------- ABOUT ---------------- */}
        <section className="sec sec--left" id="about" data-sec="about">
          <div className="panel panel--split">
            <header className="panel__bar"><span>Pass {passOf("about")} / About</span><span>{passLL("about")}</span></header>
            <div className="panel__head">
              <h2 className="h2 reveal">{profile.headline}</h2>
              <dl className="facts">
                <div><dt>Role</dt><dd>{profile.role}</dd></div>
                <div><dt>Company</dt><dd>{profile.company}</dd></div>
                <div><dt>Base</dt><dd>{CITY}, {site.home.country}</dd></div>
                <div><dt>Coordinates</dt><dd>{HOME_LL}</dd></div>
                {education.slice(0, 1).map((e) => <div key={e.degree}><dt>Education</dt><dd>{e.degree}, {e.school}</dd></div>)}
              </dl>
            </div>
            <div className="panel__body">
              {profile.about.map((p, i) => <p key={i}>{p}</p>)}
            </div>
          </div>
        </section>

        {/* ---------------- EXPERIENCE ---------------- */}
        {experience.length > 0 && (
          <section className="sec sec--right" id="experience" data-sec="experience">
            <div className="panel panel--xl">
              <header className="panel__bar"><span>Pass {passOf("experience")} / Experience</span><span>{passLL("experience")}</span></header>
              <h2 className="h2 reveal">Where the work happens.</h2>
              <ol className={`timeline${experience.length < 3 ? " timeline--short" : ""}`}>
                {experience.map((e, i) => (
                  <li key={`${e.org}-${i}`} className={i === 0 ? "timeline__lead" : ""}>
                    <p className="timeline__when">{e.start} to {e.end}</p>
                    <h3 className="h3">{e.role}</h3>
                    <p className="timeline__org">{e.org}, {e.place}</p>
                    <ul>{e.points.map((p, j) => <li key={j}>{p}</li>)}</ul>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        {/* ---------------- RESEARCH ---------------- */}
        {HAS_RESEARCH && (
          <section className="sec sec--right sec--tall" id="research" data-sec="research">
            <div className="research__sticky">
              <div className="panel panel--research">
                <header className="panel__bar"><span>Pass {passOf("research")} / Research</span><span>{paper >= 0 && publications[paper]?.geo ? fmtLL(publications[paper].geo!.lat, publications[paper].geo!.lon) : `Origin ${HOME_LL}`}</span></header>
                <h2 className="h2 reveal">{RESEARCH_H}</h2>
                <p className="panel__tag">{RESEARCH_TAG}</p>
                <ol className={`pubs${publications.length === 1 ? " pubs--one" : ""}`}>
                  {publications.map((p, i) => (
                    <li key={`${p.title}-${i}`} className={`pub${i === paper ? " is-on" : ""}${i < paper ? " is-past" : ""}${p.award ? " pub--award" : ""}`}>
                      <p className="pub__venue">
                        <span>{p.venue}</span>
                        <span className="pub__city">{p.geo?.city ?? "No pin"}</span>
                        {p.award && <em className="badge badge--award">{p.awardLabel ?? "Best Paper"}</em>}
                      </p>
                      <h3 className="pub__title">{p.title}</h3>
                      <p className="pub__meta">{p.publisher}. {p.where}. {p.year}.</p>
                      {p.note && !p.award && <p className="pub__note">{p.note}</p>}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </section>
        )}

        {/* ---------------- FLAGSHIP ---------------- */}
        <section className="sec sec--left" id="flagship" data-sec="flagship">
          <div className="panel panel--split panel--flagship">
            <header className="panel__bar"><span>Pass {passOf("flagship")} / Flagship project</span><span>{passLL("flagship")}</span></header>
            <div className="panel__head">
              <h2 className="h2 h2--big reveal">{featured.title}</h2>
              <p className="panel__tag">{featured.tagline}</p>
              <p className="panel__desc">{featured.description}</p>
            </div>
            <div>
              {featured.parts.length > 0 && (
                <>
                  <div className="agents" role="group" aria-label={`${featured.title} parts`} style={{ ["--n" as string]: Math.min(4, featured.parts.length) }}>
                    {featured.parts.map((a, i) => (
                      <button key={a.name} className={`agent${agent === i ? " agent--on" : ""}`} style={{ ["--k" as string]: PART_HEX[i % PART_HEX.length] }} aria-pressed={agent === i} onClick={() => pickAgent(i)} onMouseEnter={() => pickAgent(i)}>
                        <span className="agent__n">{String(i + 1).padStart(2, "0")}</span>{a.name}
                      </button>
                    ))}
                  </div>
                  <p className="agents__role" aria-live="polite"><strong>{part.name}.</strong> {part.role}</p>
                </>
              )}
              <ul className="ticks">{featured.facts.map((f) => <li key={f}>{f}</li>)}</ul>
              <p className="stack">{featured.stack.join(" / ")}</p>
              {featured.links.length > 0 && (
                <div className="flag__links">
                  {featured.links.map((l, i) => <a key={i} className={`btn${i === 0 ? " btn--solid" : ""}`} {...ext(l.href)} data-cursor="Open">{l.label}</a>)}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ---------------- RE-ENTRY ---------------- */}
        <section className="reentry" id="reentry" data-sec="reentry" aria-label="Re-entry">
          <p className="kicker">Leaving orbit</p>
          <p className="reentry__h">Through the clouds,<br />down to {CITY}.</p>
          <p className="reentry__sub">The next passes are flown low, over {site.home.surroundings}.</p>
        </section>

        {/* ---------------- PROJECTS ---------------- */}
        {projects.length > 0 && (
          <section className="projects" id="projects" data-sec="projects">
            <div className="projects__head panel">
              <header className="panel__bar"><span>Pass {passOf("projects")} / Projects</span><span>{projects.length} classified tiles</span></header>
              <h2 className="h2 reveal">Field work, classified.</h2>
              <p className="panel__tag">Every project is tagged with a class, like a segmentation mask. Pick a class to highlight its tiles.</p>
              {CLASSES.length > 1 && (
                <div className="legend" role="group" aria-label="Highlight projects by class">
                  <button className={`legend__chip${focus === null ? " is-on" : ""}`} aria-pressed={focus === null} onClick={() => setFocus(null)}>All <span>{projects.length}</span></button>
                  {CLASSES.map((c) => (
                    <button key={c.name} className={`legend__chip legend__chip--t${c.tone}${focus === c.name ? " is-on" : ""}`} aria-pressed={focus === c.name} onClick={() => setFocus(focus === c.name ? null : c.name)}>
                      <i aria-hidden="true" />{c.name} <span>{projects.filter((p) => p.category === c.name).length}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid">
              {projects.map((p, i) => (
                <article className={`card card--t${toneOf(p.category)}`} key={`${p.title}-${i}`}>
                  <div className={`card__in${focus && focus !== p.category ? " is-dim" : ""}`}>
                    <header className="card__top">
                      <span className="card__n">T{String(i + 1).padStart(2, "0")}</span>
                      <span className="card__cat"><i aria-hidden="true" />{p.category}</span>
                      <span className="card__year">{p.year}</span>
                    </header>
                    <h3 className="card__title">{p.title}{p.badge && <em className={`badge${/best paper|award/i.test(p.badge) ? " badge--award" : ""}`}>{p.badge}</em>}</h3>
                    <p className="card__sum">{p.summary}</p>
                    <p className="card__detail">{p.detail}</p>
                    {p.aside && <p className="card__nod">{p.aside}</p>}
                    <footer className="card__foot">
                      {p.metric ? <p className="card__metric"><b>{p.metric.value}</b>{p.metric.label}</p> : <span />}
                      <span className="card__links">
                        {p.links?.map((l, j) => <a key={j} {...ext(l.href)} data-cursor="Open">{l.label}</a>)}
                      </span>
                    </footer>
                    <p className="stack">{p.stack.join(" / ")}</p>
                  </div>
                </article>
              ))}
              {site.socials.find((x) => x.label === "GitHub") && (
                <article className="card card--end">
                  <div className="card__in">
                    <p className="card__endh">More of the archive lives on GitHub.</p>
                    <a className="btn" {...ext(site.socials.find((x) => x.label === "GitHub")!.href)} data-cursor="Open">Open GitHub</a>
                  </div>
                </article>
              )}
            </div>
          </section>
        )}

        {/* ---------------- TOOLKIT ---------------- */}
        {skills.length + certifications.length > 0 && (
          <section className="sec sec--left" id="toolkit" data-sec="toolkit">
            <div className="panel panel--xl panel--tools">
              <header className="panel__bar"><span>Pass {passOf("toolkit")} / Toolkit</span><span>Instruments on board</span></header>
              <h2 className="h2 reveal">Instruments on board.</h2>
              <div className={`tools${certifications.length ? "" : " tools--solo"}`}>
                <div className="skills">
                  {skills.map((g) => (
                    <div key={g.group}>
                      <h3 className="h4">{g.group}</h3>
                      <ul>{g.items.map((s) => <li key={s}>{s}</li>)}</ul>
                    </div>
                  ))}
                </div>
                {certifications.length > 0 && (
                  <div className="certs">
                    <h3 className="h4">Certifications</h3>
                    <ul>
                      {certifications.map((c) => (
                        <li key={c.name} className={c.badge ? "cert--tagged" : ""}>
                          <span className="certs__name">{c.name}{c.badge && <em className="badge">{c.badge}</em>}</span>
                          <span className="certs__meta">{c.issuer} <span>{c.date}</span></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ---------------- CONTACT ---------------- */}
        <section className="sec sec--left sec--contact" id="contact" data-sec="contact">
          <div className="panel panel--contact">
            <header className="panel__bar"><span>Landing / {CITY}</span><span>{HOME_LL}</span></header>
            <h2 className="contact__h reveal">Touchdown in {CITY}.</h2>
            <p className="contact__lead">{profile.contactLead}</p>
            <a className="contact__email" href={`mailto:${profile.email}`} data-cursor="Write">{emailUser}<wbr />@{emailHost}</a>
            <div className="contact__row">
              <a className="btn btn--solid" href={site.resume} download={RESUME_NAME} data-cursor="PDF">Download resume</a>
              <button className="btn" onClick={copyEmail}>Copy email</button>
              {site.socials.map((x) => <a key={x.label} className="btn" {...ext(x.href)}>{x.label}</a>)}
            </div>
          </div>
          <footer className="footer">
            <p>© {new Date().getFullYear()} {profile.name}. {CITY}, {site.home.country}.</p>
            {site.footerNote && <p>{site.footerNote}</p>}
            <p>Earth, clouds and terrain are generated live in WebGL.</p>
          </footer>
        </section>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------- */
/* Scroll choreography                                             */
/* -------------------------------------------------------------- */
function buildScroll(mobile: boolean, reduce: boolean) {
  if (reduce) return;

  gsap.utils.toArray<HTMLElement>(".reveal").forEach((h) => {
    const split = SplitText.create(h, { type: "words", mask: "words" });
    gsap.fromTo(split.words, { yPercent: 110 }, {
      yPercent: 0, duration: 1, stagger: 0.05, ease: "expo.out",
      scrollTrigger: { trigger: h, start: "top 90%", toggleActions: "play none none reverse" },
    });
  });

  gsap.utils.toArray<HTMLElement>(".sec").forEach((s) => {
    const panel = s.querySelector<HTMLElement>(".panel");
    if (!panel) return;
    const fromX = mobile ? 0 : s.classList.contains("sec--right") ? 36 : -36;
    gsap.fromTo(panel, { x: fromX, y: 48, autoAlpha: 0 }, {
      x: 0, y: 0, autoAlpha: 1, duration: 1.1, ease: "power3.out",
      scrollTrigger: { trigger: s.classList.contains("sec--tall") ? s : panel, start: "top 88%", toggleActions: "play none none reverse" },
    });
  });

  gsap.fromTo(".projects__head", { y: 48, autoAlpha: 0 }, {
    y: 0, autoAlpha: 1, duration: 1.1, ease: "power3.out",
    scrollTrigger: { trigger: ".projects__head", start: "top 88%", toggleActions: "play none none reverse" },
  });
  gsap.utils.toArray<HTMLElement>(".card").forEach((c, i) => {
    gsap.fromTo(c, { y: 60, autoAlpha: 0 }, {
      y: 0, autoAlpha: 1, duration: 0.9, ease: "power3.out", delay: mobile ? 0 : (i % 3) * 0.08,
      scrollTrigger: { trigger: c, start: "top 94%", toggleActions: "play none none reverse" },
    });
  });

  // the re-entry line drifts up through the clouds
  gsap.fromTo(".reentry > *", { y: 80, autoAlpha: 0 }, {
    y: -40, autoAlpha: 1, ease: "none", stagger: 0.08,
    scrollTrigger: { trigger: ".reentry", start: "top 85%", end: "center 45%", scrub: true },
  });

  // leaving the hero: the name splits apart
  gsap.to(".hero__line", {
    xPercent: (i) => (i === 0 ? -10 : 10), autoAlpha: 0, ease: "none",
    scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
  });
  gsap.to(".hero__meta, .hero__scroll", {
    y: -70, autoAlpha: 0, ease: "none",
    scrollTrigger: { trigger: ".hero", start: "15% top", end: "65% top", scrub: true },
  });
}
