/* ============================================================
   6UMMY — agent-edge Worker  (OPTIONAL)

   This is NOT the API Worker. It sits on the apex in front of the
   GitHub Pages origin and does the three agent-readiness things that
   a static host physically cannot: content negotiation, response
   headers, and the right Content-Type on an extensionless file.

   It is the only path to Cloudflare Radar's Level 3 (Agent-Readable),
   whose sole gate is Markdown Negotiation. If you would rather not
   put a hop in front of the homepage, skip it — the repo files alone
   still fix the API Catalog check and leave you a stronger Level 2.

   ── Deploy ──────────────────────────────────────────────────
   New Worker (separate from 6ummy-api), paste this, then add routes:

       6ummy.xyz/                        ← homepage only
       6ummy.xyz/.well-known/api-catalog ← content-type fix (optional)

   Scoping to those two paths keeps the Worker off every asset
   request, so the page weight budget is untouched — the hop only
   exists on the two URLs that need it. A route of 6ummy.xyz/* would
   work too but would proxy every request for no benefit.

   No secrets, no bindings. It only reads the origin and rewrites
   headers; it never touches the API Worker or its data.
   ============================================================ */

/* Advertised to agents on the homepage. Points at things that
   actually exist in the repo — sitemap, the API catalog, and the
   markdown overview. RFC 8288 format. */
const LINK =
  '</sitemap.xml>; rel="sitemap", ' +
  '</.well-known/api-catalog>; rel="api-catalog", ' +
  '</llms.txt>; rel="service-doc"';

export default {
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    /* 1. Correct Content-Type for the API catalog. GitHub Pages
          serves an extensionless file as octet-stream; RFC 9727
          wants application/linkset+json. Only rewrites the header,
          streams the body through untouched. */
    if (path === "/.well-known/api-catalog") {
      const r = await fetch(req);
      const h = new Headers(r.headers);
      h.set("Content-Type", "application/linkset+json");
      return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
    }

    /* From here down: homepage only. */
    const isHome = path === "/" || path === "/index.html";
    if (!isHome) return fetch(req);

    /* 2. Markdown negotiation. An agent that asks for text/markdown
          gets index.md; a browser (which never sends that Accept)
          gets the HTML, unchanged. Vary: Accept so a shared cache
          never hands one to the other. */
    const accept = req.headers.get("Accept") || "";
    if (/text\/markdown/i.test(accept)) {
      /* index.md is served by Pages directly — this route only
         matches "/", so fetching "/index.md" does not re-enter here. */
      const md = await fetch(new URL("/index.md", url).toString(), {
        cf: { cacheEverything: true, cacheTtl: 3600 }
      });
      if (md.ok) {
        return new Response(await md.text(), {
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
            "Vary": "Accept",
            "Link": LINK
          }
        });
      }
      /* If index.md is missing, fall through to normal HTML rather
         than erroring — degrade, don't break. */
    }

    /* 3. Normal homepage: pass the HTML through, add the Link header
          (RFC 8288 agent discovery) and Vary: Accept. */
    const res = await fetch(req);
    const h = new Headers(res.headers);
    h.append("Link", LINK);
    h.append("Vary", "Accept");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  }
};
