# 6ummy.xyz

Static site. No build step, no dependencies, no framework. Edit, commit, done.

```
index.html
assets/css/style.css     visual system
assets/js/content.js     ← the only file you edit for normal updates
assets/js/app.js         logic
assets/img/              photos (any size, auto-desaturated)
.well-known/             Brave verification file goes here
```

Open `index.html` directly in a browser to preview. Everything works from
`file://` except the calendar fetch, which needs a real origin.

---

## The palette rule

`#232323` ink, `#EFF3F4` paper, and that's the whole site — **except when you're
live**, when `#FFEA00` floods the status bar. Colour is information here, not
decoration, so it stays meaningful.

Yellow is never used as text on the light ground: the contrast is about 1.06:1,
which is invisible rather than merely non-compliant. It's always a fill with ink
on top (~12.8:1). Keep that rule if you extend the design.

Dark mode comes free from `prefers-color-scheme` — ink and paper swap, the
yellow gets better.

**Preview the live state any time:** add `?live=1` to the URL.

---

## Setup

### 1. Calendar (required for the Dates section)

The calendar ID is already in `content.js`. You need two things:

1. **Make the calendar public.** Google Calendar → Settings for that calendar →
   *Access permissions* → tick **Make available to public**.
2. **Get a browser API key.** [console.cloud.google.com](https://console.cloud.google.com)
   → new project → *APIs & Services* → enable **Google Calendar API** →
   *Credentials* → **Create credentials → API key**.
3. **Restrict the key** — this matters. On the key: *Application restrictions* →
   **Websites** → add `6ummy.xyz/*` and `localhost/*`. Then *API restrictions* →
   **Google Calendar API** only.
4. Paste it into `content.js` → `calendarKey`.

The key is visible in the page source, which is fine: it's referrer-restricted
and only reads a calendar you've already made public. Don't reuse it for
anything else.

Behaviour: shows upcoming dates; if there are none it automatically shows recent
past ones instead, labelled *Recent*. The section never renders empty.

### 2. Live status (optional)

Twitch's API needs a client secret, so it can't be called safely from the
browser. A tiny Cloudflare Worker does it — free tier, one file:

```js
export default {
  async fetch(req, env) {
    const auth = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: env.TWITCH_ID,
        client_secret: env.TWITCH_SECRET,
        grant_type: "client_credentials"
      })
    }).then(r => r.json());

    const res = await fetch("https://api.twitch.tv/helix/streams?user_login=6ummy", {
      headers: {
        "Client-ID": env.TWITCH_ID,
        "Authorization": `Bearer ${auth.access_token}`
      }
    }).then(r => r.json());

    const s = res.data && res.data[0];
    return Response.json(
      { live: !!s, title: s ? s.title : null, viewers: s ? s.viewer_count : 0 },
      { headers: { "Access-Control-Allow-Origin": "https://6ummy.xyz" } }
    );
  }
};
```

Set `TWITCH_ID` / `TWITCH_SECRET` as Worker secrets, then put the Worker URL in
`content.js` → `liveEndpoint`. The page polls every two minutes.

Leave it empty and the site simply always reads *Off air* — nothing breaks.

### 3. Contact form

Static hosting can't send mail. Put any form endpoint in `content.js` →
`formEndpoint` — [Formspree](https://formspree.io), [Web3Forms](https://web3forms.com),
or your own Worker. Leave it empty and the form falls back to `mailto:`.

There's a honeypot field instead of reCAPTCHA. reCAPTCHA was roughly half a
megabyte on the old site; the honeypot is 0 KB and works fine at this scale.

### 4. Brave verification

Drop your verification file in `.well-known/` and commit it. Every static host
serves that directory as-is, so it survives moving hosts. If you used the DNS TXT
method instead, it lives at your registrar and none of this applies.

---

## Updating

**Photos** — drop any image in `assets/img/`, point `hero.src` at it. It's
desaturated in CSS, so *any* photo matches the design with no editing. Swap it
as often as you like.

**Crate** — the records section is example data. Replace it with your own; this
is the one thing on the site nobody else has, so it's worth writing yourself.
Add or remove entries freely, the layout adapts.

**Sets, links, support** — all arrays in `content.js`. Reorder at will.

**Language** — every string has an `en` and `es`. The toggle is CSS-driven
(`html[data-lang]`), so there's no flash of the wrong language on load. It
defaults to the browser's language, remembers the choice, and `?lang=es` links
straight to Spanish.

---

## Weight

| | gzipped |
|---|---|
| HTML | 2.0 KB |
| CSS | 2.8 KB |
| JS | 6.5 KB |
| Fonts | 0 |
| **Total before images** | **~10.5 KB** |

Zero font downloads — system mono paired with system grotesk. If you'd rather
have a specific face later, self-host one subset `.woff2` and change two lines in
`:root`; the budget can absorb ~20 KB.

Twitch and SoundCloud are click-to-load rather than live iframes. That's where
the real saving is — those embeds were most of the old page's weight, and now
they cost nothing until someone presses play.

---

## Hosting

Nothing here is host-specific: relative paths, no config files, no build. It runs
anywhere that serves static files.

Note that **GitHub Pages won't publish from a private repo** on a free account —
that needs Pro. Cloudflare Pages and Netlify both connect to private repos on
their free tiers, so you keep the repo private and hosting free. Point either at
the repo, no build command, output directory `/`.
