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
    } else {
      src = "https://w.soundcloud.com/player/?url=" +
            encodeURIComponent(btn.getAttribute("data-url")) +
            "&color=%23232323&hide_related=true&show_comments=false&show_teaser=false";
    }

    var f = document.createElement("iframe");
    f.src = src;
    f.title = btn.textContent.trim();
    f.loading = "lazy";
    f.allow = "autoplay; fullscreen; encrypted-media";
    f.setAttribute("allowfullscreen", "");
    box.innerHTML = "";
    box.appendChild(f);
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

  function fmtDay(d) {
    return String(d.getDate()).padStart(2, "0") + " " +
           MONTHS[lang][d.getMonth()] + " " + String(d.getFullYear()).slice(2);
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

    var html = '<div class="rows">';
    items.forEach(function (ev) {
      html += '<div class="row">' +
        '<span class="row__key">' + fmtDay(new Date(ev.startMs)) + "</span>" +
        '<span class="row__main">' + esc(ev.title) + "</span>" +
        '<span class="row__end">' + fmtTime(ev) + "</span>" +
        (ev.where ? '<span class="row__sub">' + esc(ev.where) + "</span>" : "") +
        "</div>";
    });
    box.innerHTML = html + "</div>";
  }

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

    box.innerHTML = recs.map(function (r) {
      var n = (S.crateNotes || {})[String(r.id)];
      var meta = [r.label, r.cat].filter(Boolean).join(" / ");
      return '<a class="row rec" href="' + esc(r.url) + '" target="_blank" rel="noopener">' +
        (r.thumb
          ? '<img src="' + esc(r.thumb) + '" alt="" loading="lazy" decoding="async" width="56" height="56">'
          : '<span class="rec__blank" aria-hidden="true"></span>') +
        '<span class="row__main">' + esc(r.artist) + " — " + esc(r.title) + "</span>" +
        '<span class="row__end">' + esc(r.year) + "</span>" +
        '<span class="row__sub">' + esc(meta) +
          (n ? '<em class="rec__note">' + esc(t(n)) + "</em>" : "") +
        "</span></a>";
    }).join("");
  }

  /* ---------------------------------------------------------
     RENDER — everything else driven by content.js
     --------------------------------------------------------- */

  function render() {
    var id = S.identity;
    $("wordmark").textContent = id.name;

    var L = lang === "es"
      ? { artist: "Artista", base: "Base", since: "Desde", format: "Formato", styles: "Estilos" }
      : { artist: "Artist", base: "Base", since: "Since", format: "Format", styles: "Styles" };

    $("specs").innerHTML =
      spec(L.artist, id.name.toLowerCase()) +
      spec(L.base, id.base + "  ·  UTC−3") +
      spec(L.since, id.since) +
      spec(L.format, id.formats) +
      spec(L.styles, id.styles);

    $("bioEn").textContent = id.bio.en;
    $("bioEs").textContent = id.bio.es;

    if (S.hero && S.hero.src) {
      var fig = $("heroImg");
      fig.hidden = false;
      fig.innerHTML = '<img src="' + esc(S.hero.src) + '" alt="' + esc(t(S.hero.alt)) +
                      '" loading="lazy" decoding="async">';
    }

    $("sets").innerHTML = (S.sets || []).map(function (s) {
      return '<div class="embed embed--audio" style="margin-bottom:1rem">' +
        '<button class="embed__btn" type="button" data-embed="sc" data-url="' + esc(s.url) + '">' +
        esc(s.title) + "<small>" + esc(t(s.note)) + "</small></button></div>";
    }).join("");

    $("elsewhere").innerHTML = (S.elsewhere || []).map(function (l) {
      return '<a class="row" href="' + esc(l.url) + '" target="_blank" rel="noopener me">' +
        '<span class="row__key">' + esc(hostOf(l.url)) + "</span>" +
        '<span class="row__main">' + esc(l.label) + "</span>" +
        '<span class="row__end">↗</span></a>';
    }).join("");

    $("support").innerHTML = (S.support || []).map(function (s) {
      return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' +
        es("Apoyame", "Support") + " · " + esc(s.label) + "</a>";
    }).join(" ");

    renderDates();
    renderCrate();
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

  /* --------------------------------------------------------- */

  render();
  loadDates();
  loadCrate();

})();
