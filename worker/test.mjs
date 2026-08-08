/* Test harness: runs worker/index.js against a stubbed Discogs.
   No network. Asserts the behaviours the fix is supposed to have. */

import worker from "./index.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? "  -> " + extra : "")); }
};

/* ---------- stubs ---------- */

let upstream = [];                 // every fetch the worker makes
let discogsStatus = 200;
let discogsHeaders = { "X-Discogs-Ratelimit": "60", "X-Discogs-Ratelimit-Used": "88", "X-Discogs-Ratelimit-Remaining": "0" };

const DISCOGS_BODY = {
  pagination: { items: 295 },
  releases: [{
    id: 1, basic_information: {
      id: 249504, title: "Test Record", year: 1999,
      artists: [{ name: "Someone (2)" }], labels: [{ name: "A Label (3)", catno: "CAT001" }],
      formats: [{ name: "Vinyl" }], thumb: "t.jpg", cover_image: "c.jpg"
    }
  }]
};

globalThis.fetch = async (url, init = {}) => {
  upstream.push({ url: String(url), init });
  if (String(url).includes("api.discogs.com")) {
    return new Response(JSON.stringify(DISCOGS_BODY), {
      status: discogsStatus,
      headers: { "Content-Type": "application/json", ...discogsHeaders }
    });
  }
  return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
};

/* per-colo edge cache */
function makeEdgeCache() {
  const m = new Map();
  return {
    async match(req) { const v = m.get(req.url); return v ? new Response(v) : undefined; },
    async put(req, res) { m.set(req.url, await res.text()); }
  };
}
globalThis.caches = { default: makeEdgeCache() };

/* KV */
function makeKV() {
  const m = new Map();
  return {
    _m: m,
    async get(k, type) { const v = m.get(k); return v == null ? null : (type === "json" ? JSON.parse(v) : v); },
    async put(k, v) { m.set(k, v); }
  };
}

/* waitUntil returns immediately in production; the runtime keeps the
   promise alive after the response. The harness has to drain it
   explicitly before asserting on what was written. */
const pending = [];
const ctx = { waitUntil: p => { pending.push(p); return p; } };
const drain = async () => { await Promise.all(pending.splice(0)); };
const get = (path, headers = {}) =>
  new Request("https://api.test" + path, { headers: { Origin: "https://6ummy.xyz", ...headers } });

const reset = () => { upstream = []; pending.length = 0; globalThis.caches = { default: makeEdgeCache() }; };

/* ---------- 1. read-through ---------- */
console.log("\nread-through cache");
{
  reset();
  const env = { DISCOGS_TOKEN: "tok" };
  let bodies = [];
  for (let i = 0; i < 25; i++) {
    const r = await worker.fetch(get("/crate"), env, ctx);
    bodies.push(await r.json());
  }
  const calls = upstream.filter(u => u.url.includes("discogs")).length;
  ok("25 requests inside TTL produce exactly 1 upstream call", calls === 1, "got " + calls);
  ok("first response is not marked cached", !bodies[0].cached);
  ok("later responses are marked cached", bodies[24].cached === true);
  ok("records survive the cache round-trip", bodies[24].records[0].title === "Test Record");
  ok("artist disambiguator is stripped", bodies[0].records[0].artist === "Someone");
  ok("count comes from pagination", bodies[0].count === 295);
}

/* ---------- 2. 429 with nothing stored ---------- */
console.log("\n429, cold");
{
  reset();
  discogsStatus = 429;
  const env = { DISCOGS_TOKEN: "tok" };
  const r = await worker.fetch(get("/crate"), env, ctx);
  const b = await r.json();
  ok("reports the ceiling and usage", /used 88\/60/.test(b.error || ""), JSON.stringify(b));
  ok("names the auth mode", /authenticated/.test(b.error || ""));
  ok("retries once when there is nothing to fall back on",
     upstream.filter(u => u.url.includes("discogs")).length === 2);
  discogsStatus = 200;
}

/* ---------- 3. 429 with a stored copy ---------- */
console.log("\n429, warm — the case that was showing 'Couldn't load'");
{
  reset();
  const env = { DISCOGS_TOKEN: "tok", CACHE: makeKV() };
  await worker.fetch(get("/crate"), env, ctx);          // seed
  await drain();

  // age the stored entry past its TTL
  const raw = JSON.parse(await env.CACHE.get("v1:crate"));
  raw.at = Date.now() - 7200 * 1000;
  await env.CACHE.put("v1:crate", JSON.stringify(raw));

  discogsStatus = 429;
  upstream = [];
  const r = await worker.fetch(get("/crate"), env, ctx);
  const b = await r.json();
  ok("still serves the records", Array.isArray(b.records) && b.records.length === 1);
  ok("flags them as stale", b.stale === true);
  ok("does NOT set `error` (frontend throws the records away if set)", b.error === undefined);
  ok("explains itself in staleReason", /rate limited/.test(b.staleReason || ""));
  ok("does not retry when a copy exists",
     upstream.filter(u => u.url.includes("discogs")).length === 1);
  discogsStatus = 200;
}

/* ---------- 4. token handling ---------- */
console.log("\ntoken");
{
  reset();
  const r1 = await worker.fetch(get("/crate"), { DISCOGS_TOKEN: "tok" }, ctx);
  const b1 = await r1.json();
  const authed = upstream.find(u => u.url.includes("discogs"));
  ok("auth:true when the token is bound", b1.auth === true);
  ok("token is never echoed", !JSON.stringify(b1).includes("tok"));
  ok("no cf.cacheTtl on the authenticated path (Cloudflare ignores it)", !authed.init.cf);
  ok("ratelimit headers are surfaced", b1.limit && b1.limit.ceiling === "60");

  reset();
  const r2 = await worker.fetch(get("/crate"), {}, ctx);
  const b2 = await r2.json();
  const anon = upstream.find(u => u.url.includes("discogs"));
  ok("auth:false when it isn't", b2.auth === false);
  ok("cf.cacheTtl IS requested on the anonymous path", !!(anon.init.cf && anon.init.cf.cacheTtl));
  ok("no Authorization header when anonymous", !anon.init.headers.Authorization);
  ok("User-Agent is always sent", /6ummy\.xyz/.test(anon.init.headers["User-Agent"]));
  ok("folder 0 is what we ask for", /folders\/0\/releases/.test(anon.url));
}

/* ---------- 5. cron ---------- */
console.log("\ncron warmer");
{
  reset();
  const env = { DISCOGS_TOKEN: "tok", CACHE: makeKV() };
  await worker.scheduled({}, env, ctx);
  await drain();
  ok("writes to KV", !!(await env.CACHE.get("v1:crate")));

  upstream = [];
  const r = await worker.fetch(get("/crate"), env, ctx);
  const b = await r.json();
  ok("a later page view makes no upstream call at all",
     upstream.filter(u => u.url.includes("discogs")).length === 0);
  ok("and still gets the records", b.records.length === 1 && b.cached === true);

  // a throttled tick must not destroy the good copy
  discogsStatus = 429;
  await worker.scheduled({}, env, ctx);
  await drain();
  const after = await env.CACHE.get("v1:crate", "json");
  ok("a throttled tick leaves the stored copy intact", after.data.records.length === 1);
  discogsStatus = 200;
}

/* ---------- 6. KV is global, edge cache is not ---------- */
console.log("\nstore selection");
{
  reset();
  const kv = makeKV();
  await worker.fetch(get("/crate"), { DISCOGS_TOKEN: "t", CACHE: kv }, ctx);
  await drain();
  ok("KV used when bound", kv._m.size === 1);

  reset();
  await worker.fetch(get("/crate"), { DISCOGS_TOKEN: "t" }, ctx);
  await drain();
  const hit = await caches.default.match(new Request("https://cache.invalid/crate"));
  ok("edge cache used when KV is absent", !!hit);

  reset();
  discogsStatus = 429;
  const b = await (await worker.fetch(get("/crate"), { DISCOGS_TOKEN: "t" }, ctx)).json();
  ok("cold error says which store is in play", b.store === "edge", JSON.stringify(b));
  discogsStatus = 200;
}

/* ---------- 7. CORS ---------- */
console.log("\nCORS");
{
  reset();
  const pre = await worker.fetch(new Request("https://api.test/crate", {
    method: "OPTIONS",
    headers: {
      Origin: "https://6ummy.xyz",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "signature, signature-input, signature-agent"
    }
  }), {}, ctx);
  ok("echoes requested headers",
     pre.headers.get("Access-Control-Allow-Headers") === "signature, signature-input, signature-agent");
  ok("varies on origin and requested headers",
     /Access-Control-Request-Headers/.test(pre.headers.get("Vary") || ""));

  const r = await worker.fetch(get("/crate", { Origin: "https://evil.example" }), {}, ctx);
  ok("unknown origin falls back to the canonical one",
     r.headers.get("Access-Control-Allow-Origin") === "https://6ummy.xyz");
}

/* ---------- 8. /live is never stale ---------- */
console.log("\n/live");
{
  reset();
  const b = await (await worker.fetch(get("/live"), {}, ctx)).json();
  ok("unconfigured Twitch degrades quietly", b.live === false && b.reason === "not configured");

  reset();
  const env = { CACHE: makeKV() };
  await worker.fetch(get("/live"), env, ctx);
  await drain();
  ok("liveness is never written to the store", env.CACHE._m.size === 0);
}

console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
