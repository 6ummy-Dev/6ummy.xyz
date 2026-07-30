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

    // Your Cloudflare Worker. One URL powers three sections:
    //   /live   Twitch status      /dates  calendar      /crate  Discogs
    // Leave "" and all three degrade quietly instead of breaking.
    workerUrl: "",                // e.g. "https://6ummy-api.YOURNAME.workers.dev"

    // Contact form. Formspree / Web3Forms / your own Worker.
    // Not a secret — safe to keep here.
    formEndpoint: "",
    email: "hi@6ummy.xyz",        // mailto: fallback if the above is empty

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

  /* ---------- 5. CRATE ------------------------------------
     Records come from Discogs automatically, newest first —
     add a record there and it appears here. Nothing to maintain.

     What Discogs can't give you is why a record matters. Write
     a line for the few you care about, keyed by the Discogs
     release ID (the number in the release URL). Records without
     a note still show as a clean catalogue row.
     --------------------------------------------------------- */
  crateNotes: {
    // "249504": {
    //   en: "Found it in a bin in Cordón for nothing.",
    //   es: "Lo encontré tirado en un cajón en Cordón, por nada."
    // },
  },

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
