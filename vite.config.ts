import { defineConfig, type HtmlTagDescriptor, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { education, profile, publications, site } from "./src/data/content.ts";

/* ------------------------------------------------------------------ */
/* SEO from content: fills index.html (title, description, canonical,  */
/* Open Graph, Twitter and JSON-LD Person) and serves sitemap.xml and   */
/* robots.txt, all from `site` and `profile` in src/data/content.ts.    */
/* ------------------------------------------------------------------ */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const base = site.url.endsWith("/") ? site.url : `${site.url}/`;
const abs = (p: string) => new URL(p.replace(/^\//, ""), base).href;

function sitemap() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${esc(base)}</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>
</urlset>
`;
}
function robots() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${abs("sitemap.xml")}\n`;
}

function personLd() {
  const award = publications.filter((p) => p.award).map((p) => `${p.awardLabel ?? "Best Paper"}, ${p.venue}`);
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.name,
    url: base,
    jobTitle: profile.role,
    worksFor: { "@type": "Organization", name: profile.company },
    address: { "@type": "PostalAddress", addressLocality: site.home.city, addressCountry: site.home.countryCode },
    email: `mailto:${profile.email}`,
    knowsAbout: profile.knowsAbout,
  };
  if (education[0]) ld.alumniOf = { "@type": "CollegeOrUniversity", name: education[0].school };
  if (award.length) ld.award = award.length === 1 ? award[0] : award;
  const same = site.socials.map((s) => s.href).filter((h) => /^https?:\/\//.test(h));
  if (same.length) ld.sameAs = same;
  return JSON.stringify(ld, null, 2).replace(/</g, "\\u003c");
}

const seo = (): Plugin => {
  const serve = (req: { url?: string }, res: import("http").ServerResponse, next: () => void) => {
    const path = (req.url || "").split("?")[0];
    if (path === "/sitemap.xml") { res.setHeader("Content-Type", "application/xml"); return res.end(sitemap()); }
    if (path === "/robots.txt") { res.setHeader("Content-Type", "text/plain"); return res.end(robots()); }
    next();
  };
  return {
    name: "seo-from-content",
    configureServer(server) { server.middlewares.use(serve); },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemap() });
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robots() });
    },
    transformIndexHtml(html) {
      const meta = (attrs: Record<string, string>): HtmlTagDescriptor => ({ tag: "meta", attrs, injectTo: "head" });
      const tags: HtmlTagDescriptor[] = [
        meta({ name: "description", content: site.description }),
        meta({ name: "author", content: profile.name }),
        meta({ name: "theme-color", content: site.themeColor }),
        { tag: "link", attrs: { rel: "canonical", href: base }, injectTo: "head" },
        meta({ property: "og:type", content: "profile" }),
        meta({ property: "og:url", content: base }),
        meta({ property: "og:site_name", content: profile.name }),
        meta({ property: "og:locale", content: site.locale }),
        meta({ property: "og:title", content: site.title }),
        meta({ property: "og:description", content: site.description }),
        meta({ property: "og:image", content: abs(site.ogImage) }),
        meta({ property: "og:image:width", content: "1200" }),
        meta({ property: "og:image:height", content: "630" }),
        meta({ property: "og:image:alt", content: site.ogImageAlt }),
        meta({ name: "twitter:card", content: "summary_large_image" }),
        ...(site.twitter ? [meta({ name: "twitter:site", content: `@${site.twitter}` })] : []),
        meta({ name: "twitter:title", content: site.title }),
        meta({ name: "twitter:description", content: site.description }),
        meta({ name: "twitter:image", content: abs(site.ogImage) }),
        { tag: "script", attrs: { type: "application/ld+json" }, children: personLd(), injectTo: "head" },
        {
          tag: "noscript", injectTo: "body-prepend",
          children: `<p style="padding:2rem;font-family:sans-serif;color:#e8eef7;background:${site.themeColor}">${esc(profile.name)}, ${esc(profile.role)} in ${esc(site.home.city)}. Email ${esc(profile.email)}.</p>`,
        },
      ];
      return {
        html: html
          .replace(/<html lang="[^"]*">/, `<html lang="${esc(site.lang)}">`)
          .replace(/<title>[^<]*<\/title>/, `<title>${esc(site.title)}</title>`),
        tags,
      };
    },
  };
};

/* The agent's optional LLM endpoint (api/ask.ts) is a Vercel Edge Function and
 * does not exist under `vite` or `vite preview`. Answer it locally the same way
 * the deployed function does without a key (501), so the console shows no 404
 * and the agent falls back to its offline answers. */
const localAsk = (): Plugin => {
  const handler = (req: { method?: string; url?: string }, res: import("http").ServerResponse, next: () => void) => {
    if (!req.url || !req.url.startsWith("/api/ask")) return next();
    res.statusCode = req.method === "POST" ? 501 : 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: req.method === "POST" ? "LLM not configured locally" : "Use POST" }));
  };
  return {
    name: "local-api-ask",
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
};

export default defineConfig({
  plugins: [react(), seo(), localAsk()],
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        // Split the big libraries into their own cached files.
        manualChunks(id: string) {
          if (/[\\/]node_modules[\\/]three[\\/]/.test(id)) return "three";
          if (/[\\/]node_modules[\\/](gsap|lenis)[\\/]/.test(id)) return "gsap";
        },
      },
    },
  },
});
