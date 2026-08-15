/* ============================================================
   6UMMY — app.js
   No dependencies, no build step. Everything degrades: if the
   Worker isn't configured yet, sections say so rather than break.
   ============================================================ */

(function () {
  "use strict";

  var S = window.SITE;
  var C = S.config;
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  var API = (C.workerUrl || "").replace(/\/+$/, "");

  /* ---------------------------------------------------------
     LANGUAGE — CSS-driven, so there's no flash of wrong text.
     --------------------------------------------------------- */

  var lang = (function () {
    var q = params.get("lang");
    if (q === "en" || q === "es") return q;
    try {
      var saved = localStorage.getItem("6ummy-lang");
      if (saved === "en" || saved === "es") return saved;
    } catch (e) {}
    if (C.defaultLang === "en" || C.defaultLang === "es") return C.defaultLang;
    return (navigator.language || "en").toLowerCase().indexOf("es") === 0 ? "es" : "en";
  })();

  function setLang(next) {
    lang = next;
    document.documentElement.setAttribute("data-lang", next);
    document.documentElement.setAttribute("lang", next);
    var btn = $("langBtn");
    btn.textContent = next === "en" ? "ES" : "EN";
    btn.setAttribute("aria-label", next === "en" ? "Cambiar a español" : "Switch to English");
    try { localStorage.setItem("6ummy-lang", next); } catch (e) {}
  }

  function t(obj) { return obj ? (obj[lang] || obj.en || "") : ""; }
  function es(a, b) { return lang === "es" ? a : b; }

  setLang(lang);
  $("langBtn").addEventListener("click", function () {
    setLang(lang === "en" ? "es" : "en");
    render();
  });

  /* ---------------------------------------------------------
     CLOCK — Montevideo time. Small, but the one detail a
     booker in another timezone actually uses.
     --------------------------------------------------------- */

  function tick() {
    try {
      $("clock").textContent = new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/Montevideo",
        hour: "2-digit", minute: "2-digit", hour12: false
      }).format(new Date());
    } catch (e) {}
  }
  tick();
  setInterval(tick, 20000);
  $("year").textContent = new Date().getFullYear();

  /* ---------------------------------------------------------
     HELPERS
     --------------------------------------------------------- */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function api(route) {
    if (!API) return Promise.reject(new Error("no worker"));
    return fetch(API + route, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(route + " " + r.status);
      return r.json();
    });
  }

  function hostOf(u) {
    try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
  }

  /* ---------------------------------------------------------
     LIVE STATE — the only thing that brings colour in.
     Preview it any time with ?live=1
     --------------------------------------------------------- */

  function setLive(on, title) {
    document.body.classList.toggle("is-live", !!on);
    $("stateLabel").innerHTML = on
      ? '<span data-en>Live now</span><span data-es>En vivo ahora</span>'
      : '<span data-en>Off air</span><span data-es>Fuera del aire</span>';
    $("streamNote").textContent = on && title ? title : "";
  }

  function checkLive() {
    if (params.get("live") === "1") { setLive(true, "Preview"); return; }
    api("/live")
      .then(function (d) { setLive(d && d.live, d && d.title); })
      .catch(function () { setLive(false); });
  }
  checkLive();
  setInterval(checkLive, 120000);

  /* ---------------------------------------------------------
     DEFERRED EMBEDS — nothing from Twitch or SoundCloud is
     requested until someone presses the button.
     --------------------------------------------------------- */

  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-embed]");
    if (!btn) return;
    var box = btn.parentElement;
    var kind = btn.getAttribute("data-embed");
    var src;

    if (kind === "twitch") {
      src = "https://player.twitch.tv/?channel=" + encodeURIComponent(C.twitchChannel) +
            "&parent=" + location.hostname + "&autoplay=true";
    } else if (kind === "yt") {
      /* nocookie: YouTube sets nothing until someone actually plays,
         which is the whole point of loading it on demand. */
      src = "https://www.youtube-nocookie.com/embed/videoseries?list=" +
            encodeURIComponent(C.youtubePlaylist) + "&rel=0";
    } else {
      /* Classic player, not visual=true. In visual mode the artwork
         becomes the background and is sized at ~0.45 x the player's
         width — at 880px that is 391px, so it swallows the box and
         the tracklist falls off the bottom. Its share cannot be
         changed: show_artwork=false has no effect in that mode.

         The classic player's header is a FIXED height instead, so the
         artwork stays a small constant and the tracklist takes the
         rest at every width. The white background it ships with is
         handled by a filter in CSS. */
      src = "https://w.soundcloud.com/player/?url=" +
            encodeURIComponent(btn.getAttribute("data-url")) +
            "&color=%23FFEA00&auto_play=false" +
            "&hide_related=true&show_comments=false&show_teaser=false&show_reposts=false";
    }

    var f = document.createElement("iframe");
    f.src = src;
    f.title = btn.textContent.trim();
    f.loading = "lazy";
    f.allow = "autoplay; fullscreen; encrypted-media";
    f.setAttribute("allowfullscreen", "");
    box.innerHTML = "";
    box.appendChild(f);
    box.classList.add("is-loaded");
  });

  /* ---------------------------------------------------------
     DATES — from the Worker, which reads the .ics feed.
     If nothing is coming up, show recent past dates instead.
     An empty section makes a live act look dead.
     --------------------------------------------------------- */

  var MONTHS = {
    en: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
    es: ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Set","Oct","Nov","Dic"]
  };

  var datesState = null;

  /* Day/month/year in Montevideo, same zone as the time column and
     the clock. The visitor's local calendar can disagree with the
     MVD clock by a day on either side of midnight, which produced
     pairs like "21 Aug · 23:30" for a gig that is on the 20th. */
  function fmtDay(ms) {
    var day, month, year;
    try {
      var p = new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/Montevideo",
        year: "numeric", month: "numeric", day: "numeric"
      }).formatToParts(new Date(ms)).reduce(function (a, x) {
        a[x.type] = x.value; return a;
      }, {});
      day = +p.day; month = +p.month - 1; year = p.year;
    } catch (e) {
      var d = new Date(ms);
      day = d.getDate(); month = d.getMonth(); year = String(d.getFullYear());
    }
    return String(day).padStart(2, "0") + " " +
           MONTHS[lang][month] + " " + String(year).slice(2);
  }

  function fmtTime(ev) {
    if (ev.allDay) return "";
    try {
      return new Intl.DateTimeFormat(es("es-UY", "en-GB"), {
        hour: "2-digit", minute: "2-digit", hour12: false,
        timeZone: "America/Montevideo"
      }).format(new Date(ev.startMs));
    } catch (e) { return ""; }
  }

  /* The Worker sends at most 300 characters of the calendar
     description and cuts wherever the 300th character lands —
     mid-word, mid-name. Pull back to the last space so the text
     ends on a whole word, and say it was cut with an ellipsis
     rather than trailing a stray letter. Raising the cap means
     redeploying the Worker, which is a Cloudflare-side job; this
     costs nothing and fixes what the reader actually sees. */
  var DESC_CAP = 300;

  function tidyDesc(s) {
    var raw = String(s == null ? "" : s);
    /* Measure before collapsing whitespace, not after. The Worker
       counts its 300 against the raw text, and a calendar entry
       with blank lines in it normalises down to well under the cap
       — check the tidy string and a truncated description looks
       untouched. */
    var clipped = raw.length >= DESC_CAP;
    var text = raw.replace(/\s+/g, " ").trim();
    if (!clipped) return text;

    /* Whatever the cut left dangling is the last token. Only drop
       it if there is a word break to fall back to that isn't near
       the start — 300 characters without a space is a URL or a
       hashtag wall, and cutting at its first space would throw
       away most of the line. */
    var space = text.lastIndexOf(" ");
    if (space > text.length * 0.6) text = text.slice(0, space);
    return text.replace(/[\s,;:.–—-]+$/, "") + "…";
  }

  function loadDates() {
    api("/dates")
      .then(function (d) {
        if (d.error) throw new Error(d.error);
        datesState = (d.upcoming && d.upcoming.length)
          ? { mode: "upcoming", items: d.upcoming }
          : { mode: "past", items: d.past || [] };
        renderDates();
      })
      .catch(function () {
        datesState = { mode: API ? "error" : "nokey", items: [] };
        renderDates();
      });
  }

  function renderDates() {
    if (!datesState) return;
    var box = $("dates"), note = $("datesNote");
    var items = datesState.items;

    if (datesState.mode === "nokey") {
      note.textContent = "";
      box.innerHTML = '<p class="empty">' + es(
        "Agenda no conectada todavía — agregá la URL del Worker en content.js.",
        "Calendar not connected yet — add the Worker URL in content.js.") + "</p>";
      return;
    }

    /* A dead Worker is not an empty calendar. "Nothing announced"
       makes a live act look idle; say the load failed instead,
       like Crate and Portfolio already do. */
    if (datesState.mode === "error") {
      note.textContent = "";
      box.innerHTML = '<p class="empty">' + es(
        "No se pudo cargar la agenda.",
        "Couldn't load the dates.") + "</p>";
      return;
    }

    if (!items.length) {
      note.textContent = "";
      box.innerHTML = '<p class="empty">' + es(
        "Nada anunciado por ahora. Escribime para fechas.",
        "Nothing announced yet. Get in touch for dates.") + "</p>";
      return;
    }

    note.textContent = datesState.mode === "past"
      ? es("Recientes", "Recent")
      : es("Próximas", "Upcoming");

    /* Only what's ahead is worth saving. A calendar file for a gig
       that already happened is an entry in the past, which is what
       the Recent list is for. */
    var offerICS = CAN_ICS && datesState.mode === "upcoming";

    var html = '<div class="rows">';
    items.forEach(function (ev, i) {
      html += '<div class="row row--date">' +
        '<span class="row__key">' + fmtDay(ev.startMs) + "</span>" +
        '<span class="row__main">' + esc(ev.title) + "</span>" +
        '<span class="row__end">' + fmtTime(ev) + "</span>" +
        (ev.where ? '<span class="row__sub">' + esc(ev.where) + "</span>" : "") +
        (ev.description
          ? '<p class="row__desc">' + esc(tidyDesc(ev.description)) + "</p>"
          : "") +
        /* The toggle is added here later, ahead of the calendar
           button, so the strip reads MORE then ADD TO CALENDAR.
           Empty strips are display:none, so a row with neither
           control keeps the spacing it had before. */
        '<div class="row__acts">' +
          (offerICS
            ? '<button class="row__cal" type="button" data-cal="' + i + '">' +
                es("Agregar al calendario", "Add to calendar") +
                /* Eight buttons all named "Add to calendar" are eight
                   identical rows to anyone listening rather than
                   looking. The title is appended out of sight. */
                '<span class="sr"> — ' + esc(ev.title) + "</span>" +
              "</button>"
            : "") +
        "</div>" +
        "</div>";
    });
    box.innerHTML = html + "</div>";
    clampDescs();
    sweep();
  }

  /* ---------------------------------------------------------
     DESCRIPTIONS — clamped to two lines, because one event with
     a paragraph and three with a line each would make the list
     unreadable. The toggle only exists where there is something
     hidden behind it, and CSS can't ask that question, so the
     overflow is measured here.

     The toggle is a separate button rather than the paragraph
     itself: a button's accessible name is its text, and 300
     characters of Spanish prose is not a usable control name.
     --------------------------------------------------------- */

  function clampDescs() {
    var box = $("dates");
    if (!box) return;

    Array.prototype.forEach.call(box.querySelectorAll(".row__desc"), function (p, i) {
      /* An open one is unclamped by definition — measuring it
         would just say "fits" and take its own toggle away. */
      if (p.classList.contains("is-open")) return;

      var acts = p.parentNode.querySelector(".row__acts");
      var btn = acts && acts.querySelector(".row__more");
      var over = p.scrollHeight - p.clientHeight > 1;

      if (over && !btn && acts) {
        p.id = "dateDesc" + i;
        btn = document.createElement("button");
        btn.type = "button";
        btn.className = "row__more";
        btn.setAttribute("aria-controls", p.id);
        btn.setAttribute("aria-expanded", "false");
        /* A text node first, then the hidden title. The toggle
           relabels itself by rewriting that node, so the title
           survives every open and close — and the visible word
           stays the start of the accessible name, which is what
           voice control needs to match on. */
        btn.appendChild(document.createTextNode(es("Más", "More")));
        var sr = document.createElement("span");
        sr.className = "sr";
        sr.textContent = " — " + (p.parentNode.querySelector(".row__main") || {}).textContent;
        btn.appendChild(sr);
        acts.insertBefore(btn, acts.firstChild);
      } else if (!over && btn) {
        btn.parentNode.removeChild(btn);
      }
    });
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".row__more");
    if (!btn) return;
    var p = document.getElementById(btn.getAttribute("aria-controls"));
    if (!p) return;
    var open = p.classList.toggle("is-open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    /* First child only — the .sr title after it stays put. */
    btn.firstChild.nodeValue = open ? es("Menos", "Less") : es("Más", "More");
  });

  /* A narrower column fits fewer words, so a description that
     needed no toggle in landscape needs one in portrait. Without
     this a rotated phone shows two clamped lines and no way to
     reach the rest. Collapsed rows only — re-measuring an open
     one would close nothing but would drop its toggle. */
  var reflow;
  window.addEventListener("resize", function () {
    clearTimeout(reflow);
    reflow = setTimeout(clampDescs, 200);
  });

  /* ---------------------------------------------------------
     ADD TO CALENDAR — an .ics built here, from the event data
     already on the page. No second request, no third party, and
     it lands in whatever the reader actually uses: Calendar,
     Google, Outlook, Thunderbird. A calendar.google.com link
     would have been one line, but it only serves Google and it
     hands a visitor to a tracker on a site whose whole premise
     is that it doesn't have one.

     If Blob or createObjectURL is missing the button is never
     rendered, rather than rendered and dead.
     --------------------------------------------------------- */

  var CAN_ICS = (function () {
    try {
      return !!(window.Blob && window.URL && URL.createObjectURL &&
                "download" in document.createElement("a"));
    } catch (e) { return false; }
  })();

  /* RFC 5545 §3.3.11: backslash, semicolon and comma are
     delimiters inside a property value, and a real newline ends
     the property. All four have to be escaped or the file is
     rejected — "Denk y Sven von Thülen (Alpha Decay), es la
     historia" would otherwise end the DESCRIPTION at the comma. */
  function icsEsc(s) {
    return String(s == null ? "" : s)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  }

  function utf8Len(ch) {
    var c = ch.codePointAt(0);
    return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }

  /* §3.1: lines fold at 75 octets — octets, not characters. Folding
     on a character count splits "Berlín" through the middle of the
     í, and an importer that gets half a code point rejects the file
     rather than guessing. Continuations start with one space, which
     spends an octet of the next line's budget. */
  function icsFold(line) {
    var out = "", len = 0, i, ch;
    for (i = 0; i < line.length; i++) {
      ch = line.charAt(i);
      /* Keep a surrogate pair together: the emoji in a title is one
         character to a reader and two units to a for-loop. */
      if (ch >= "\uD800" && ch <= "\uDBFF" && i + 1 < line.length) {
        ch += line.charAt(++i);
      }
      var size = utf8Len(ch);
      if (len + size > 73) { out += "\r\n "; len = 1; }
      out += ch;
      len += size;
    }
    return out;
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function icsUTC(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) +
           "T" + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) +
           pad2(d.getUTCSeconds()) + "Z";
  }

  /* All-day events are anchored at UTC midday by the Worker, exactly
     so a timezone shift can't move them off their own date. Reading
     the UTC parts back out returns the day the calendar meant. */
  function icsDay(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate());
  }

  function slug(s) {
    var t = String(s || "");
    /* Decompose, then drop the combining marks: "Décimo" becomes
       "decimo" rather than "d-cimo". Escaped rather than literal —
       a bare combining range in the source is invisible in an
       editor and the next person to touch this line would lose it. */
    try { t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) {}
    return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "date";
  }

  function buildICS(ev) {
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//6ummy//6ummy.xyz//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      /* Stable across downloads: re-saving the same gig updates the
         entry the reader already has instead of duplicating it. */
      "UID:" + ev.startMs + "-" + slug(ev.title).slice(0, 40) + "@6ummy.xyz",
      "DTSTAMP:" + icsUTC(Date.now())
    ];

    if (ev.allDay) {
      lines.push("DTSTART;VALUE=DATE:" + icsDay(ev.startMs));
      /* DTEND is exclusive for a date value — the day after, or the
         event shows as ending the moment it starts. */
      lines.push("DTEND;VALUE=DATE:" + icsDay(ev.startMs + 864e5));
    } else {
      lines.push("DTSTART:" + icsUTC(ev.startMs));
      lines.push("DTEND:" + icsUTC(
        ev.endMs > ev.startMs ? ev.endMs : ev.startMs + 2 * 3600e3));
    }

    lines.push("SUMMARY:" + icsEsc(ev.title || "TBA"));
    if (ev.where) lines.push("LOCATION:" + icsEsc(ev.where));
    /* The tidied text, so a saved event doesn't carry the Worker's
       mid-word cut into the reader's calendar forever. */
    if (ev.description) lines.push("DESCRIPTION:" + icsEsc(tidyDesc(ev.description)));
    lines.push("URL:https://6ummy.xyz/");
    lines.push("END:VEVENT", "END:VCALENDAR");

    return lines.map(icsFold).join("\r\n") + "\r\n";
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".row__cal");
    if (!btn) return;

    var ev = datesState && datesState.items[Number(btn.getAttribute("data-cal"))];
    if (!ev) return;

    var url;
    try {
      url = URL.createObjectURL(
        new Blob([buildICS(ev)], { type: "text/calendar;charset=utf-8" }));
    } catch (err) { return; }

    var a = document.createElement("a");
    a.href = url;
    a.download = "6ummy-" + slug(ev.title).slice(0, 48) + "-" + icsDay(ev.startMs) + ".ics";
    document.body.appendChild(a);
    a.click();
    a.parentNode.removeChild(a);
    /* Revoked on a timer, not immediately: Safari reads the blob
       after the click returns, and pulling it out from under the
       download gives an empty file. */
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  });

  /* ---------------------------------------------------------
     CRATE — from Discogs via the Worker. Newest additions
     first. Notes you've written in content.js get merged in
     by release ID; records without one show as catalogue rows.
     --------------------------------------------------------- */

  var crateState = null;

  function loadCrate() {
    api("/crate")
      .then(function (d) {
        if (d.error) throw new Error(d.error);
        crateState = { records: d.records || [], count: d.count || 0 };
        renderCrate();
      })
      .catch(function () {
        crateState = { records: [], count: 0, failed: !!API };
        renderCrate();
      });
  }

  function renderCrate() {
    if (!crateState) return;
    var box = $("crate"), note = $("crateNote");
    var recs = crateState.records;

    if (!recs.length) {
      note.textContent = "";
      box.innerHTML = '<p class="empty">' + (crateState.failed
        ? es("No se pudo cargar la colección.", "Couldn't load the collection.")
        : es("Colección no conectada todavía.", "Collection not connected yet.")) + "</p>";
      return;
    }

    note.textContent = crateState.count
      ? crateState.count + es(" discos", " records")
      : "";

    /* A strip, like Portfolio. Twelve stacked rows with a note
       each ran taller than every other section combined; the
       sleeve is the point, so let the artwork carry the row and
       scroll sideways. Square cards rather than 16:9 — a sleeve
       cropped to widescreen is a sleeve with its corners cut off. */
    box.innerHTML =
      '<div class="reel__track">' +
      recs.map(function (r) {
        var n = (S.crateNotes || {})[String(r.id)];
        var meta = [r.year, [r.label, r.cat].filter(Boolean).join(" / ")]
                     .filter(Boolean).join("  ·  ");
        /* The 2x sleeve is held back rather than declared. Discogs
           serves two sizes and nothing between: thumb at 150 and
           cover_image at 600, on signed URLs we can't rewrite. In a
           srcset the browser reads 600 as the answer for any phone
           above 1x and fetches all twelve of them up front — 1,058 KiB
           of artwork on a page whose entire document, styles and
           scripts come to about 10.5 KB gzipped. loading="lazy" didn't
           save us: these cards are offscreen horizontally, inside the
           viewport vertically, which Chrome loads anyway.

           So the thumb ships and upgradeArt() promotes a card to the
           600 when it scrolls near the strip. Same picture when you
           are looking at it, roughly 860 KiB less when you aren't. */
        var art = r.cover && r.cover !== r.thumb
          ? ' data-cover="' + esc(r.cover) + '"'
          : "";
        return '<a class="reel__item" href="' + esc(r.url) + '" target="_blank" rel="noopener">' +
          (r.thumb
            ? '<img src="' + esc(r.thumb) + '"' + art +
              ' alt="" loading="lazy" decoding="async" width="150" height="150">'
            : '<span class="reel__blank" aria-hidden="true"></span>') +
          '<span class="reel__title">' + esc(r.artist) + " — " + esc(r.title) + "</span>" +
          '<span class="reel__year">' + esc(meta) + "</span>" +
          (n ? '<span class="reel__note">' + esc(t(n)) + "</span>" : "") +
          "</a>";
      }).join("") + "</div>" +
      '<div class="reel__nav">' +
        '<button class="reel__arrow" type="button" data-reel="-1" aria-label="' +
          es("Anterior", "Previous") + '">\u2190</button>' +
        '<button class="reel__arrow" type="button" data-reel="1" aria-label="' +
          es("Siguiente", "Next") + '">\u2192</button>' +
      "</div>";
    upgradeArt(box);
    sweep();
  }

  /* Promote crate sleeves from the 150 to the 600 as they come
     into the strip. Rooted on the track, so it answers the question
     the reel actually asks — "is this card scrolled into view
     sideways" — with 200px of margin so the swap lands before the
     card arrives rather than in front of the reader.

     srcset rather than src: the browser keeps painting the thumb
     until the cover has decoded, so a card never blinks empty. And
     with no IntersectionObserver, or no /crate response worth
     upgrading, the thumbs simply stay — the strip is complete
     either way, just softer. */
  function upgradeArt(box) {
    var imgs = [].slice.call(box.querySelectorAll("img[data-cover]"));
    if (!imgs.length) return;

    if (!("IntersectionObserver" in window)) {
      imgs.forEach(promote);
      return;
    }

    var track = box.querySelector(".reel__track");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        promote(en.target);
        io.unobserve(en.target);
      });
    }, { root: track, rootMargin: "0px 200px" });

    imgs.forEach(function (img) { io.observe(img); });

    function promote(img) {
      var cover = img.getAttribute("data-cover");
      if (!cover) return;
      img.removeAttribute("data-cover");
      var thumb = img.getAttribute("src") || "";
      /* A comma inside either URL would split the srcset into
         nonsense candidates. Discogs doesn't emit one, but the
         fallback costs a line and fails visibly rather than
         silently if it ever does. */
      if (cover.indexOf(",") < 0 && thumb.indexOf(",") < 0) {
        img.setAttribute("srcset", thumb + " 1x, " + cover + " 2x");
      }
    }
  }

  /* ---------------------------------------------------------
     PORTFOLIO — one curated YouTube playlist via the Worker.
     Rows link out rather than embed: an embedded player costs
     the better part of a megabyte before anyone presses play,
     and this is a list you scan, not a thing you watch in place.
     --------------------------------------------------------- */

  var videoState = null;

  function loadVideos() {
    api("/youtube")
      .then(function (d) {
        if (d.error) throw new Error(d.error);
        videoState = { videos: d.videos || [] };
        renderVideos();
      })
      .catch(function () {
        videoState = { videos: [], failed: !!API };
        renderVideos();
      });
  }

  function renderVideos() {
    if (!videoState) return;
    var box = $("portfolio"), note = $("portfolioNote");
    var vids = videoState.videos.slice(0, (S.portfolio && S.portfolio.max) || 24);

    if (!vids.length) {
      note.textContent = "";
      box.innerHTML = '<p class="empty">' + (videoState.failed
        ? es("No se pudo cargar la lista.", "Couldn\u2019t load the playlist.")
        : es("Lista no conectada todav\u00eda.", "Playlist not connected yet.")) + "</p>";
      return;
    }

    note.textContent = vids.length + " videos";

    /* A strip rather than a stack: twenty-four rows made this
       section taller than the rest of the page put together, and
       worse on a phone. Horizontal scroll-snap costs no library —
       a swipe is native, and the arrows are only for pointers. */
    box.innerHTML =
      '<div class="reel__track">' +
      vids.map(function (v) {
        return '<button class="reel__item" type="button" data-video="' + esc(v.id) + '">' +
          '<img src="' + esc(v.thumb) + '" alt="" loading="lazy" decoding="async" width="320" height="180">' +
          '<span class="reel__title">' + esc(v.title) + "</span>" +
          '<span class="reel__year">' + esc(v.year) + "</span></button>";
      }).join("") + "</div>" +
      '<div class="reel__nav">' +
        '<button class="reel__arrow" type="button" data-reel="-1" aria-label="' +
          es("Anterior", "Previous") + '">\u2190</button>' +
        '<button class="reel__arrow" type="button" data-reel="1" aria-label="' +
          es("Siguiente", "Next") + '">\u2192</button>' +
      "</div>";
    sweep();
  }

  /* Arrows page the strip by roughly one screenful. */
  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-reel]");
    if (!a) return;
    /* Two strips on the page now, so the arrows have to find
       their own track rather than a fixed id. */
    var reel = a.closest(".reel");
    var track = reel && reel.querySelector(".reel__track");
    if (!track) return;
    var step = Math.max(160, Math.round(track.clientWidth * 0.8));
    try {
      track.scrollBy({ left: step * Number(a.getAttribute("data-reel")),
                       behavior: reduced ? "auto" : "smooth" });
    } catch (err) {
      track.scrollLeft += step * Number(a.getAttribute("data-reel"));
    }
  });

  /* Play a chosen video in the section's own player, continuing
     into the rest of the playlist afterwards. */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-video]");
    if (!btn) return;

    var id = btn.getAttribute("data-video");
    var player = $("portfolioPlayer");

    var f = player.querySelector("iframe");
    if (!f) {
      f = document.createElement("iframe");
      f.title = "YouTube";
      f.loading = "lazy";
      f.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
      f.setAttribute("allowfullscreen", "");
      player.innerHTML = "";
      player.appendChild(f);
      player.classList.add("is-loaded");
    }

    f.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id) +
            "?autoplay=1&rel=0&list=" + encodeURIComponent(C.youtubePlaylist);
    player.hidden = false;

    var rows = $("portfolio").querySelectorAll("[data-video]");
    Array.prototype.forEach.call(rows, function (r) {
      r.classList.toggle("is-playing", r === btn);
    });
  });

  /* ---------------------------------------------------------
     RENDER — everything else driven by content.js
     --------------------------------------------------------- */

  function render() {
    var id = S.identity;

    /* The mark is pixel art, so the wordmark is drawn on the same
       grid instead of being set in a typeface that fights it. The
       real text stays in the h1 for search and screen readers; the
       SVG is decorative. If a name ever contains a glyph the set
       doesn't have, this falls back to plain text. */
    var wm = $("wordmark"), drawn = pixelText(id.name, "pix pix--wordmark");
    if (drawn) {
      wm.innerHTML = '<span class="sr">' + esc(id.name) + "</span>" + drawn +
                     '<span class="wordmark__cursor" aria-hidden="true"></span>';
      wm.classList.add("wordmark--pix");
    } else {
      wm.textContent = id.name;
    }

    var mk = document.querySelector(".status__mark");
    var mkPix = pixelText(id.name.charAt(0), "pix");
    if (mk && mkPix) {
      mk.innerHTML = '<span class="sr">' + esc(id.name.charAt(0)) + "</span>" + mkPix;
    }

    var L = lang === "es"
      ? { artist: "Artista", base: "Base", since: "Desde", format: "Formato", styles: "Estilos" }
      : { artist: "Artist", base: "Base", since: "Since", format: "Format", styles: "Styles" };

    $("specs").innerHTML =
      spec(L.artist, id.name.toLowerCase()) +
      spec(L.base, id.base + "  ·  UTC−3") +
      spec(L.since, id.since) +
      spec(L.format, id.formats) +
      spec(L.styles, id.styles);

    /* The bio is prerendered in index.html and is the hero's largest
       text block (PSI's mobile run named it the LCP element). content.js
       normally holds the same string, so this write is usually a no-op
       that still replaces the text node and repaints that element. Skip
       it unless content.js has actually diverged — identical content
       keeps the original first paint instead of repainting at render()
       time. Same intent as the reveal guard below, other repaint path. */
    if ($("bioEn").textContent !== id.bio.en) $("bioEn").textContent = id.bio.en;
    if ($("bioEs").textContent !== id.bio.es) $("bioEs").textContent = id.bio.es;

    if (S.hero && S.hero.src) {
      var fig = $("heroImg");
      fig.hidden = false;
      fig.innerHTML = '<img src="' + esc(S.hero.src) + '" alt="' + esc(t(S.hero.alt)) +
                      '" loading="lazy" decoding="async">';
    }

    $("sets").innerHTML = (S.sets || []).map(function (s) {
      return '<div class="embed embed--audio set">' +
        '<button class="embed__btn" type="button" data-embed="sc" data-url="' + esc(s.url) + '">' +
        esc(s.title) + "<small>" + esc(t(s.note)) + "</small></button></div>";
    }).join("");

    $("elsewhere").innerHTML = linkGroups(S.elsewhere || []);

    var F = S.footer || {};
    $("glyphs").textContent = F.glyphs || "";
    $("tagline").textContent = F.tagline || "";

    $("support").innerHTML = (S.support || []).map(function (s) {
      return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' +
        es("Apoyame", "Support") + " · " + esc(s.label) + "</a>";
    }).join(" ");

    renderDates();
    renderCrate();
    renderVideos();
    sweep();
  }

  /* Accepts either a flat array of links or an array of
     { group, links } — so an older flat list still renders. */
  function linkGroups(list) {
    var grouped = list.length && list[0] && list[0].links;
    if (!grouped) return list.map(linkRow).join("");
    return list.map(function (g) {
      if (!g.links || !g.links.length) return "";
      return '<div class="group"><h3 class="group__name">' + esc(t(g.group)) + "</h3>" +
             g.links.map(linkRow).join("") + "</div>";
    }).join("");
  }

  /* The hostname column restated the name in almost every row —
     soundcloud.com next to SoundCloud, nightwatcher.life next to
     Nightwatcher. Dropped it: the name is the link, and the two
     rows that genuinely need context already carry a tag. */
  /* The whole row is the anchor, not just the name: the arrow and
     the gap between them were dead pixels sitting inside something
     that already read as one target. Matches the crate rows, which
     have always been full-row links. */
  function linkRow(l) {
    return '<a class="row row--link" href="' + esc(l.url) + '" target="_blank" rel="noopener me">' +
      '<span class="row__main">' +
        '<span class="row__link">' +
          esc(l.label) + "</span>" +
        (l.note ? ' <span class="row__tag">' + esc(t(l.note)) + "</span>" : "") +
      "</span>" +
      '<span class="row__end" aria-hidden="true">\u2197</span></a>';
  }

  function spec(k, v) {
    return '<div class="spec"><dt>' + esc(k) + "</dt><dd>" + esc(v) + "</dd></div>";
  }

  /* ---------------------------------------------------------
     CONTACT FORM
     --------------------------------------------------------- */

  $("contactForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var form = e.currentTarget, msg = $("formMsg"), data = new FormData(form);

    if (data.get("company")) return;            // bot filled the honeypot

    if (!data.get("name") || !data.get("email") || !data.get("message")) {
      msg.textContent = es("Completá los tres campos.", "Fill in all three fields.");
      return;
    }

    if (!C.formEndpoint) {
      location.href = "mailto:" + C.email +
        "?subject=" + encodeURIComponent("6ummy.xyz — " + data.get("name")) +
        "&body=" + encodeURIComponent(data.get("message") + "\n\n" + data.get("email"));
      return;
    }

    msg.textContent = es("Enviando…", "Sending…");
    fetch(C.formEndpoint, { method: "POST", headers: { "Accept": "application/json" }, body: data })
      .then(function (r) {
        if (!r.ok) throw new Error();
        form.reset();
        msg.textContent = es("Enviado. Te respondo pronto.", "Sent. I'll get back to you.");
      })
      .catch(function () {
        msg.textContent = es("No se pudo enviar. Escribime a " + C.email,
                             "That didn't send. Email me at " + C.email);
      });
  });

  /* ---------------------------------------------------------
     PIXEL NUMERALS — a 5x7 dot-matrix set, the character cell
     80s terminals used. Drawn as SVG rects rather than loaded as
     a font: eleven glyphs is far less than a font file, it can't
     fail to arrive, and it scales without ever being resampled —
     which matters when the mark it sits next to is pixel art.
     --------------------------------------------------------- */

  var PIX = {
    "0": ["01110","10001","10011","10101","11001","10001","01110"],
    "1": ["00100","01100","00100","00100","00100","00100","01110"],
    "2": ["01110","10001","00001","00010","00100","01000","11111"],
    "3": ["11111","00010","00100","00010","00001","10001","01110"],
    "4": ["00010","00110","01010","10010","11111","00010","00010"],
    "5": ["11111","10000","11110","00001","00001","10001","01110"],
    "6": ["00110","01000","10000","11110","10001","10001","01110"],
    "7": ["11111","00001","00010","00100","01000","01000","01000"],
    "8": ["01110","10001","10001","01110","10001","10001","01110"],
    "9": ["01110","10001","10001","01111","00001","00010","01100"],
    "A": ["01110","10001","10001","11111","10001","10001","10001"],
    "B": ["11110","10001","10001","11110","10001","10001","11110"],
    "C": ["01110","10001","10000","10000","10000","10001","01110"],
    "D": ["11110","10001","10001","10001","10001","10001","11110"],
    "E": ["11111","10000","10000","11110","10000","10000","11111"],
    "F": ["11111","10000","10000","11110","10000","10000","10000"],
    "G": ["01110","10001","10000","10111","10001","10001","01111"],
    "H": ["10001","10001","10001","11111","10001","10001","10001"],
    "I": ["01110","00100","00100","00100","00100","00100","01110"],
    "J": ["00111","00010","00010","00010","00010","10010","01100"],
    "K": ["10001","10010","10100","11000","10100","10010","10001"],
    "L": ["10000","10000","10000","10000","10000","10000","11111"],
    "M": ["10001","11011","10101","10101","10001","10001","10001"],
    "N": ["10001","11001","11001","10101","10011","10011","10001"],
    "O": ["01110","10001","10001","10001","10001","10001","01110"],
    "P": ["11110","10001","10001","11110","10000","10000","10000"],
    "Q": ["01110","10001","10001","10001","10101","10010","01101"],
    "R": ["11110","10001","10001","11110","10100","10010","10001"],
    "S": ["01111","10000","10000","01110","00001","00001","11110"],
    "T": ["11111","00100","00100","00100","00100","00100","00100"],
    "U": ["10001","10001","10001","10001","10001","10001","01110"],
    "V": ["10001","10001","10001","10001","10001","01010","00100"],
    "W": ["10001","10001","10001","10101","10101","11011","10001"],
    "X": ["10001","10001","01010","00100","01010","10001","10001"],
    "Y": ["10001","10001","01010","00100","00100","00100","00100"],
    "Z": ["11111","00001","00010","00100","01000","10000","11111"],
    ".": ["00","00","00","00","00","11","11"],
    "-": ["00000","00000","00000","11111","00000","00000","00000"],
    " ": ["000","000","000","000","000","000","000"]
  };

  /* Returns "" if the string contains anything the set doesn't
     cover, so the caller can fall back to real text rather than
     render a wordmark with holes in it. */
  function pixelText(str, cls) {
    str = String(str || "").toUpperCase();
    var x = 0, rects = "";
    for (var i = 0; i < str.length; i++) {
      var g = PIX[str.charAt(i)];
      if (!g) return "";
      for (var y = 0; y < g.length; y++) {
        for (var c = 0; c < g[y].length; c++) {
          if (g[y].charAt(c) === "1") {
            rects += '<rect x="' + (x + c) + '" y="' + y + '" width="1" height="1"/>';
          }
        }
      }
      x += g[0].length + 1;
    }
    var w = Math.max(1, x - 1);
    return '<svg class="' + (cls || "pix") + '" viewBox="0 0 ' + w + ' 7" ' +
           'preserveAspectRatio="xMinYMid meet" fill="currentColor" ' +
           'shape-rendering="crispEdges" focusable="false" aria-hidden="true">' +
           rects + "</svg>";
  }

  function pixelNum(str) { return pixelText(str, "pix"); }

  /* ---------------------------------------------------------
     SECTION INDEX + HEAD CONTROLS

     Two behaviours were asked for on one gesture, so they get
     separate targets rather than a mode: the label jumps to the
     section's own top, the index toggles it open or shut. A single
     tap doing both would have to guess.

     All of this is added from JS. The HTML stays a plain document,
     so with JS off there are still seven readable sections, a CSS
     counter for the numbering, and no dead buttons.
     --------------------------------------------------------- */

  var sections = [], indexItems = [], enhanced = false;

  /* The status bar is fixed and its height only changes when the
     viewport does, but this was re-querying the DOM and reading a
     rect on every scroll frame — a layout read after whatever the
     frame had just written, which forces the browser to lay the
     page out again on the spot. Measured once, cached, invalidated
     on resize. */
  var barCache = null;
  function barPx() {
    if (barCache !== null) return barCache;
    var b = document.querySelector(".status");
    barCache = b ? b.getBoundingClientRect().height : 36;
    return barCache;
  }

  function goTo(sec) {
    var y = sec.getBoundingClientRect().top + window.pageYOffset - barPx();
    try {
      window.scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
    } catch (e) { window.scrollTo(0, y); }
  }

  function enhanceSections() {
    if (enhanced) return;
    sections = [].slice.call(document.querySelectorAll("main .section"));
    if (!sections.length) return;
    enhanced = true;

    var nav = document.createElement("nav");
    nav.className = "index";
    nav.setAttribute("aria-label", "Sections");
    var list = document.createElement("ol");
    list.className = "index__list";

    sections.forEach(function (sec, i) {
      var head = sec.querySelector(".section__head");
      var h2 = head && head.querySelector("h2");
      if (!head || !h2) return;

      /* Zero-based: the hero is the page's 0th beat in everything
         but the counter, and starting the list at 0 lands the last
         section on 6 — the mark. */
      var num = String(i);
      if (!sec.id) sec.id = "sec-" + i;
      var bodyId = sec.id + "-body";

      /* Everything after the head becomes one collapsible body. */
      var body = document.createElement("div");
      body.className = "section__body";
      body.id = bodyId;
      while (head.nextSibling) body.appendChild(head.nextSibling);
      sec.appendChild(body);

      /* Label -> jump. The h2's two language spans move inside the
         button, so the CSS language switch keeps working untouched. */
      var jump = document.createElement("button");
      jump.type = "button";
      jump.className = "section__jump";
      while (h2.firstChild) jump.appendChild(h2.firstChild);
      h2.appendChild(jump);
      jump.addEventListener("click", function () { goTo(sec); });

      /* Index -> collapse. */
      var tog = document.createElement("button");
      tog.type = "button";
      tog.className = "section__toggle";
      tog.textContent = num;
      tog.setAttribute("aria-controls", bodyId);
      tog.setAttribute("aria-expanded", "true");
      /* The visible label is just the number; a screen reader needs
         the section name too. Cloning the language spans keeps the
         name correct when the language switches, since the inactive
         span is display:none and drops out of the accessible name. */
      var togLab = document.createElement("span");
      togLab.className = "sr";
      [].forEach.call(jump.children, function (nn) { togLab.appendChild(nn.cloneNode(true)); });
      tog.appendChild(togLab);
      head.appendChild(tog);
      head.classList.add("is-enhanced");

      tog.addEventListener("click", function () {
        var open = sec.classList.toggle("is-shut") === false;
        tog.setAttribute("aria-expanded", open ? "true" : "false");
        body.hidden = !open;
        /* Collapsing above the viewport would yank the page out from
           under the reader, so hold this section's head in place. */
        if (!open) goTo(sec);
        spy();
      });

      /* Index entry. The label spans are cloned, so switching
         language updates the sidebar with no extra wiring. */
      var li = document.createElement("li");
      var a = document.createElement("button");
      a.type = "button";
      a.className = "index__item";
      var lab = document.createElement("span");
      lab.className = "index__label";
      [].forEach.call(jump.children, function (n) { lab.appendChild(n.cloneNode(true)); });
      var n = document.createElement("span");
      n.className = "index__num";
      n.innerHTML = pixelNum(num);
      /* No aria-label here: it would have to concatenate both
         language spans ("StreamEn vivo"). The cloned label spans
         already provide the name — only the active language's span
         is rendered, and it follows the toggle for free. */
      a.appendChild(lab);
      a.appendChild(n);
      a.addEventListener("click", function () { goTo(sec); });
      li.appendChild(a);
      list.appendChild(li);
      indexItems.push({ sec: sec, el: a });
    });

    nav.appendChild(list);
    document.body.appendChild(nav);
    spy();
  }

  /* Which section owns the top of the screen. */
  var spying = false;
  function spy() {
    if (spying) return;
    spying = true;
    requestAnimationFrame(function () {
      spying = false;
      var edge = barPx() + 4, current = null;
      indexItems.forEach(function (it) {
        if (it.sec.getBoundingClientRect().top <= edge) current = it;
      });
      indexItems.forEach(function (it) {
        var on = it === current;
        it.el.classList.toggle("is-current", on);
        if (on) it.el.setAttribute("aria-current", "true");
        else it.el.removeAttribute("aria-current");
      });
    });
  }
  window.addEventListener("scroll", spy, { passive: true });
  window.addEventListener("resize", function () { barCache = null; spy(); });

  /* ---------------------------------------------------------
     REVEALS — reveal and settle, nothing pinned or scrubbed.
     The page is short; heavy choreography would read as padding.

     The .reveal class is added from here rather than sitting in
     the HTML, so a reader with JS disabled never meets a page of
     permanently invisible sections. Same reason it bails out
     entirely under prefers-reduced-motion instead of relying on
     the stylesheet to neutralise it.
     --------------------------------------------------------- */

  var reduced = false;
  try {
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  var observer = null;

  function watch(nodes) {
    if (reduced || !observer) return;
    Array.prototype.forEach.call(nodes, function (el, i) {
      if (el.dataset.revealed) return;
      el.dataset.revealed = "1";
      /* Never hide what the reader can already see. The hero is
         prerendered in index.html and this script is deferred, so by
         the time we get here the bio has painted — and the bio is the
         page's largest paint. Putting it back to opacity 0 to fade it
         in again moved LCP from first paint to the end of the
         transition: PSI charged it 2.9s of pure element render delay.
         Anything inside the viewport right now settles where it
         stands; the reveal remains for whatever scrolls in later. */
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) return;
      el.classList.add("reveal");
      el.style.setProperty("--i", Math.min(i, 8));
      observer.observe(el);
    });
  }

  function initReveals() {
    if (reduced || !("IntersectionObserver" in window)) return;

    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add("is-in");
        observer.unobserve(en.target);       // one-way: no re-animating on scroll back
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });

    sweep();
  }

  /* Rows arrive after their fetch resolves, so this runs again
     each time a section renders. */
  function sweep() {
    watch(document.querySelectorAll(".hero .specs, .hero .bio"));
    watch(document.querySelectorAll(".row, .group, .embed, .reel"));
  }

  /* --------------------------------------------------------- */

  render();
  enhanceSections();
  initReveals();
  loadDates();
  loadCrate();
  loadVideos();

})();
