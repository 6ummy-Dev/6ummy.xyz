/* ============================================================
   6UMMY — app.js
   No dependencies, no build step. Everything degrades: if a
   key is missing the section falls back rather than breaking.
   ============================================================ */

(function () {
  "use strict";

  var S = window.SITE;
  var C = S.config;
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);

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
     LIVE STATE — the only thing that brings colour in.
     Preview it any time with ?live=1
     --------------------------------------------------------- */

  function setLive(on, title) {
    document.body.classList.toggle("is-live", !!on);
    var label = $("stateLabel");
    label.innerHTML = on
      ? '<span data-en>Live now</span><span data-es>En vivo ahora</span>'
      : '<span data-en>Off air</span><span data-es>Fuera del aire</span>';
    $("streamNote").textContent = on && title ? title : "";
  }

  function checkLive() {
    if (params.get("live") === "1") { setLive(true, "Preview"); return; }
    if (!C.liveEndpoint) { setLive(false); return; }
    fetch(C.liveEndpoint, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
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
     GOOGLE CALENDAR
     Upcoming dates. If there are none, show recent past ones
     instead — an empty section makes a live act look dead.
     --------------------------------------------------------- */

  var MONTHS = {
    en: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
    es: ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Set","Oct","Nov","Dic"]
  };

  function parseEvent(ev) {
    var raw = (ev.start && (ev.start.dateTime || ev.start.date)) || "";
    var allDay = !!(ev.start && ev.start.date && !ev.start.dateTime);
    var d = new Date(allDay ? raw + "T12:00:00" : raw);
    return {
      date: d,
      allDay: allDay,
      title: ev.summary || "TBA",
      where: ev.location || "",
      url: ev.htmlLink || ""
    };
  }

  function fmtDay(d) {
    return String(d.getDate()).padStart(2, "0") + " " + MONTHS[lang][d.getMonth()] +
           " " + String(d.getFullYear()).slice(2);
  }

  function fmtTime(e) {
    if (e.allDay) return "";
    try {
      return new Intl.DateTimeFormat(lang === "es" ? "es-UY" : "en-GB", {
        hour: "2-digit", minute: "2-digit", hour12: false
      }).format(e.date);
    } catch (err) { return ""; }
  }

  var calendarCache = null;

  function calUrl(extra) {
    return "https://www.googleapis.com/calendar/v3/calendars/" +
      encodeURIComponent(C.calendarId) + "/events?key=" + encodeURIComponent(C.calendarKey) +
      "&singleEvents=true&orderBy=startTime&maxResults=12" + extra;
  }

  function loadCalendar() {
    if (!C.calendarKey) {
      calendarCache = { mode: "nokey", items: [] };
      renderDates();
      return;
    }
    var now = new Date().toISOString();

    fetch(calUrl("&timeMin=" + now))
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (d) {
        var items = (d.items || []).map(parseEvent);
        if (items.length) {
          calendarCache = { mode: "upcoming", items: items.slice(0, 8) };
          renderDates();
          return;
        }
        // Nothing coming up — fall back to what already happened.
        return fetch(calUrl("&timeMax=" + now))
          .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
          .then(function (p) {
            var past = (p.items || []).map(parseEvent).reverse().slice(0, 6);
            calendarCache = { mode: "past", items: past };
            renderDates();
          });
      })
      .catch(function () {
        calendarCache = { mode: "error", items: [] };
        renderDates();
      });
  }

  function renderDates() {
    var box = $("dates");
    var note = $("datesNote");
    if (!calendarCache) return;

    var mode = calendarCache.mode;
    var items = calendarCache.items;

    if (mode === "nokey") {
      note.textContent = "";
      box.innerHTML = '<p class="empty">' + (lang === "es"
        ? "Agenda no conectada todavía — agregá la clave de API en content.js."
        : "Calendar not connected yet — add the API key in content.js.") + "</p>";
      return;
    }

    if (!items.length) {
      note.textContent = "";
      box.innerHTML = '<p class="empty">' + (lang === "es"
        ? "Nada anunciado por ahora. Escribime para fechas."
        : "Nothing announced yet. Get in touch for dates.") + "</p>";
      return;
    }

    note.textContent = mode === "past"
      ? (lang === "es" ? "Recientes" : "Recent")
      : (lang === "es" ? "Próximas" : "Upcoming");

    var html = '<div class="rows">';
    items.forEach(function (e) {
      var tag = e.url ? "a" : "div";
      var attrs = e.url ? ' href="' + esc(e.url) + '" target="_blank" rel="noopener"' : "";
      html += "<" + tag + ' class="row"' + attrs + ">" +
        '<span class="row__key">' + fmtDay(e.date) + "</span>" +
        '<span class="row__main">' + esc(e.title) + "</span>" +
        '<span class="row__end">' + fmtTime(e) + "</span>" +
        (e.where ? '<span class="row__sub">' + esc(e.where) + "</span>" : "") +
        "</" + tag + ">";
    });
    box.innerHTML = html + "</div>";
  }

  /* ---------------------------------------------------------
     RENDER — everything driven by content.js
     --------------------------------------------------------- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

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

    // hero image
    if (S.hero && S.hero.src) {
      var fig = $("heroImg");
      fig.hidden = false;
      fig.innerHTML = '<img src="' + esc(S.hero.src) + '" alt="' + esc(t(S.hero.alt)) +
                      '" loading="lazy" decoding="async">';
    }

    // sets
    $("sets").innerHTML = (S.sets || []).map(function (s) {
      return '<div class="embed embed--audio" style="margin-bottom:1rem">' +
        '<button class="embed__btn" type="button" data-embed="sc" data-url="' + esc(s.url) + '">' +
        esc(s.title) + "<small>" + esc(t(s.note)) + "</small></button></div>";
    }).join("");

    // crate
    $("crate").innerHTML = (S.crate || []).map(function (r) {
      return '<div class="row">' +
        '<span class="row__key">' + esc(r.year) + "</span>" +
        '<span class="row__main">' + esc(r.artist) + " — " + esc(r.title) + "</span>" +
        '<span class="row__end">' + esc(r.label) + " / " + esc(r.cat) + "</span>" +
        '<span class="row__sub">' + esc(t(r.note)) + "</span></div>";
    }).join("");

    // elsewhere
    $("elsewhere").innerHTML = (S.elsewhere || []).map(function (l) {
      return '<a class="row" href="' + esc(l.url) + '" target="_blank" rel="noopener me">' +
        '<span class="row__key">' + esc(hostOf(l.url)) + "</span>" +
        '<span class="row__main">' + esc(l.label) + "</span>" +
        '<span class="row__end">↗</span></a>';
    }).join("");

    // support
    $("support").innerHTML = (S.support || []).map(function (s) {
      return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' +
        (lang === "es" ? "Apoyame" : "Support") + " · " + esc(s.label) + "</a>";
    }).join(" ");

    renderDates();
  }

  function spec(k, v) {
    return '<div class="spec"><dt>' + esc(k) + "</dt><dd>" + esc(v) + "</dd></div>";
  }

  function hostOf(u) {
    try { return new URL(u).hostname.replace(/^www\./, ""); }
    catch (e) { return ""; }
  }

  /* ---------------------------------------------------------
     CONTACT FORM
     --------------------------------------------------------- */

  $("contactForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var form = e.currentTarget;
    var msg = $("formMsg");
    var data = new FormData(form);

    if (data.get("company")) return;            // bot filled the honeypot

    if (!data.get("name") || !data.get("email") || !data.get("message")) {
      msg.textContent = lang === "es"
        ? "Completá los tres campos."
        : "Fill in all three fields.";
      return;
    }

    if (!C.formEndpoint) {
      location.href = "mailto:" + C.email +
        "?subject=" + encodeURIComponent("6ummy.xyz — " + data.get("name")) +
        "&body=" + encodeURIComponent(data.get("message") + "\n\n" + data.get("email"));
      return;
    }

    msg.textContent = lang === "es" ? "Enviando…" : "Sending…";
    fetch(C.formEndpoint, {
      method: "POST",
      headers: { "Accept": "application/json" },
      body: data
    }).then(function (r) {
      if (!r.ok) throw new Error();
      form.reset();
      msg.textContent = lang === "es"
        ? "Enviado. Te respondo pronto."
        : "Sent. I'll get back to you.";
    }).catch(function () {
      msg.textContent = lang === "es"
        ? "No se pudo enviar. Escribime a " + C.email
        : "That didn't send. Email me at " + C.email;
    });
  });

  /* --------------------------------------------------------- */

  render();
  loadCalendar();

})();
