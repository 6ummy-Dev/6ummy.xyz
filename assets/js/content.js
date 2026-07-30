/* ============================================================
   6UMMY — content & config
   This is the only file you need to edit for normal updates.
   No build step. Save, commit, done.
   ============================================================ */

window.SITE = {

  /* ---------- 1. KEYS & ENDPOINTS ---------------------------
     Fill these in when you have them. Anything left as ""
     degrades gracefully — the section just hides or falls back.
     --------------------------------------------------------- */
  config: {

    // Google Calendar (public calendar + browser API key).
    // See README §Calendar for the 3-minute setup.
    calendarId: "jelhc76e0q5clq9er14l6963fo@group.calendar.google.com",
    calendarKey: "",              // <-- paste API key here

    // Live check. Expects JSON: { "live": true, "title": "...", "viewers": 42 }
    // See README §Live for a 15-line Cloudflare Worker.
    // Leave "" and the site simply always reads OFF AIR.
    liveEndpoint: "",

    // Contact form. Formspree / Web3Forms / your own Worker.
    // Leave "" and the form falls back to a mailto: link.
    formEndpoint: "",
    email: "hi@6ummy.xyz",        // used for the mailto fallback

    twitchChannel: "6ummy",
    defaultLang: "auto"           // "auto" | "en" | "es"
  },

  /* ---------- 2. IDENTITY ---------------------------------- */
  identity: {
    name: "6UMMY",
    since: "2004",
    base: "Montevideo, UY",
    formats: "Vinyl / Digital",
    styles: "Tech house · Deep house · Minimal techno",
    bio: {
      en: "DJ, collector and curator based in Uruguay. Records, livestreams, and the occasional rare find worth talking about.",
      es: "DJ, coleccionista y curador radicado en Uruguay. Discos, transmisiones en vivo y de vez en cuando una rareza que vale la pena contar."
    }
  },

  /* ---------- 3. HERO IMAGE --------------------------------
     Drop any photo in assets/img/ and point to it.
     It gets desaturated automatically — no editing needed,
     so you can swap it as often as you like.
     Leave src: "" to run type-only (looks good too).
     --------------------------------------------------------- */
  hero: {
    src: "",                      // e.g. "assets/img/booth.jpg"
    alt: { en: "6ummy in the booth", es: "6ummy en cabina" }
  },

  /* ---------- 4. SETS --------------------------------------
     SoundCloud playlists or tracks. Click-to-load, so having
     several costs nothing until someone presses play.
     --------------------------------------------------------- */
  sets: [
    {
      title: "mnml snds",
      note: { en: "Minimal selections, ongoing series.", es: "Selecciones minimal, serie en curso." },
      url: "https://soundcloud.com/6ummy/sets/mnml-snds"
    }
  ],

  /* ---------- 5. CRATE -------------------------------------
     ⚠️  EXAMPLE DATA — REPLACE WITH YOUR OWN RECORDS.
     The pressing details below are real, but the notes are
     placeholder copy. This section is the one thing on the
     site nobody else has, so it's worth writing yourself.
     Add or remove entries freely; the layout adapts.
     --------------------------------------------------------- */
  crate: [
    {
      artist: "Robert Hood",
      title: "Minimal Nation",
      label: "Axis",
      cat: "AX-008",
      year: "1994",
      note: {
        en: "Placeholder — write why this one matters to you.",
        es: "Marcador — escribí por qué este te importa."
      }
    },
    {
      artist: "Basic Channel",
      title: "Phylyps Trak",
      label: "Basic Channel",
      cat: "BC-04",
      year: "1993",
      note: {
        en: "Placeholder — a sentence or two is plenty.",
        es: "Marcador — con una o dos frases alcanza."
      }
    },
    {
      artist: "Ricardo Villalobos",
      title: "Alcachofa",
      label: "Playhouse",
      cat: "PLAY-123",
      year: "2003",
      note: {
        en: "Placeholder — where you found it works well here.",
        es: "Marcador — contar dónde lo encontraste funciona bien."
      }
    }
  ],

  /* ---------- 6. ELSEWHERE ---------------------------------
     Everything that isn't the main story. Reorder at will.
     --------------------------------------------------------- */
  elsewhere: [
    { label: "X",            url: "https://x.com/6ummy" },
    { label: "VINILOS · X",  url: "https://x.com/i/communities/1493258083975385088" },
    { label: "SoundCloud",   url: "https://soundcloud.com/6ummy" },
    { label: "Twitch",       url: "https://www.twitch.tv/6ummy" },
    { label: "YouTube",      url: "https://www.youtube.com/10mopiso" },
    { label: "Discord",      url: "https://discord.gg/CfmfMxDZv5" },
    { label: "OpenSea",      url: "https://opensea.io/6ummy" },
    { label: "OBJKT",        url: "https://objkt.com/@6ummy" }
  ],

  /* ---------- 7. SUPPORT ----------------------------------- */
  support: [
    { label: "PayPal", url: "https://www.paypal.com/paypalme/6ummy" }
  ]
};
