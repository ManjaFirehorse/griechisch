// The Greek word book website. Data comes from words.js (built by tools/greek.py)
// and, live, from her open "Neues Wort" form entries on GitHub (words not built yet).
(function () {
  "use strict";

  var CFG = window.CONFIG || {};
  var WORDS = window.WORDS || [];
  var byId = {};
  WORDS.forEach(function (w) { byId[w.id] = w; });
  var boards = WORDS.filter(function (w) { return w.full; });

  var INTERVALS = [0, 1, 3, 7, 16, 35, 90]; // days until the next review, per box
  var NEW_PER_DAY = 10;
  var KNOWN_BOX = 3;                        // from this box on a word "sitzt"
  var STORE = "griechisch-fortschritt-v1";

  var app = document.getElementById("app");
  var pending = [];   // words from her open form entries, not in the book yet
  var NEW_WORD_URL = CFG.github_repo ? "https://github.com/" + CFG.github_repo + "/issues/new?template=neues-wort.yml" : "";
  var session = null; // the running flashcard round

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // **word** in a sentence becomes bold
  function rich(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }
  function plain(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ς/g, "σ").trim();
  }
  function day(offset) {
    var d = new Date();
    d.setDate(d.getDate() + (offset || 0));
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function inDays(n) { return n <= 0 ? "gleich wieder" : n === 1 ? "morgen wieder" : "in " + n + " Tagen wieder"; }

  var ART_CLASS = { "ο": "m", "η": "f", "το": "n", "οι": "p", "τα": "p" };
  var ART_NAME = { "ο": "männlich", "η": "weiblich", "το": "sächlich", "οι": "Plural", "τα": "Plural" };
  function art(w) {
    return w.article ? '<span class="art art-' + ART_CLASS[w.article] + '">' + esc(w.article) + "</span> " : "";
  }
  function word(w) { return '<span class="greek">' + art(w) + esc(w.greek) + "</span>"; }
  function picture(w) {
    if (w.picture) return '<img class="pic" src="' + esc(w.picture) + '" alt="' + esc(w.german) + '">';
    return '<div class="pic emoji" role="img" aria-label="' + esc(w.german) + '">' + esc(w.emoji || "") + "</div>";
  }

  // ---------- progress (stays in this browser) ----------
  function loadProgress() {
    try {
      var p = JSON.parse(localStorage.getItem(STORE));
      if (p && p.cards) return p;
    } catch (e) { /* private window or blocked storage: start fresh */ }
    return { cards: {}, newToday: { date: "", n: 0 } };
  }
  var progress = loadProgress();
  function saveProgress() {
    try { localStorage.setItem(STORE, JSON.stringify(progress)); } catch (e) { /* nothing to do */ }
  }
  function stateOf(w) {
    var c = progress.cards[w.id];
    if (!c) return "new";
    return c.box >= KNOWN_BOX ? "ok" : "learn";
  }
  function dueCards() {
    var today = day();
    return boards.filter(function (w) { var c = progress.cards[w.id]; return c && c.due <= today; });
  }
  function newCards() {
    var left = NEW_PER_DAY - (progress.newToday.date === day() ? progress.newToday.n : 0);
    if (left <= 0) return [];
    return boards
      .filter(function (w) { return !progress.cards[w.id]; })
      .sort(function (a, b) {
        return (a.source === "sie" ? 0 : 1) - (b.source === "sie" ? 0 : 1) || String(a.added).localeCompare(String(b.added));
      })
      .slice(0, left);
  }

  // ---------- her form entries (live, open GitHub issues) ----------
  function formWord(body) {
    var m = /###\s*Griechisches Wort\s*\n+([\s\S]*?)(?=\n###\s|$)/.exec(body || "");
    var s = m ? m[1].trim() : "";
    return s === "_No response_" ? "" : s;
  }
  function loadEntries() {
    if (!CFG.github_repo) return;
    fetch("https://api.github.com/repos/" + CFG.github_repo + "/issues?state=open&per_page=100", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (issues) {
        pending = issues.filter(function (i) { return !i.pull_request; })
          .map(function (i) { return formWord(i.body); })
          .filter(Boolean);
        var view = route().view;
        if (view === "start" || view === "woerter") render();
      })
      .catch(function () { /* offline or GitHub busy: just show the built words */ });
  }

  // ---------- pages ----------
  function startPage() {
    var hour = new Date().getHours();
    var hello = hour < 12 ? "Καλημέρα!" : hour < 20 ? "Καλησπέρα!" : "Καληνύχτα!";
    var date = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
    var due = dueCards().length + newCards().length;
    var mine = boards.filter(function (w) { return w.source === "sie"; });
    var week = day(-7);
    var recent = mine.filter(function (w) { return w.added >= week; });
    var recentTitle = "Neu diese Woche";
    if (!recent.length) { recent = mine.slice(); recentTitle = "Zuletzt eingetragen"; }
    recent.sort(function (a, b) { return String(b.added).localeCompare(String(a.added)); });
    recent = recent.slice(0, 5);
    var known = boards.filter(function (w) { return stateOf(w) === "ok"; }).length;

    var html = '<div class="start-head"><div><div class="date">' + esc(date) + '</div><h1>' + hello + "</h1></div>";
    if (NEW_WORD_URL) {
      html += '<a class="btn-outline" href="' + esc(NEW_WORD_URL) + '" target="_blank" rel="noopener">+ Neues Wort eintragen</a>';
    }
    html += '</div><div class="start-grid"><section class="today"><div class="label">Heute wiederholen</div>';
    if (due) {
      html += '<div class="big"><b>' + due + "</b><span>Karten · ca. " + Math.max(1, Math.round(due / 2.5)) + " Minuten</span></div>" +
        "<p>Jedes Wort kommt genau dann wieder, wenn du es fast vergessen hättest.</p>" +
        '<div class="spacer"></div><a class="btn-sun" href="#/karten">Los geht\'s</a>';
    } else {
      html += '<div class="big"><b>0</b><span>Karten</span></div><p>' +
        (boards.length ? "Für heute ist alles wiederholt. Μπράβο!" : "Noch keine Wörter. Trag dein erstes Wort ein.") +
        '</p><div class="spacer"></div>';
    }
    html += '</section><section class="col">';
    if (recent.length) {
      html += '<div class="label">' + recentTitle + "</div>";
      recent.forEach(function (w) {
        html += '<a class="row-word" href="#/wort/' + esc(w.id) + '">' + word(w) + '<span class="de">' + esc(w.german) + "</span></a>";
      });
    }
    if (pending.length) {
      html += '<div class="pending-box"><b>' + pending.length + " in Vorbereitung:</b> <span class=\"greek\">" +
        esc(pending.slice(0, 6).join(", ")) + (pending.length > 6 ? " …" : "") + "</span>. Kommen beim nächsten Update.</div>";
    }
    html += '<div class="stats">' +
      '<div class="stat mine"><b>' + mine.length + "</b><span>von dir eingetragen</span></div>" +
      "<div class=\"stat\"><b>" + boards.length + "</b><span>Wörter im Buch (mit verwandten)</span></div>" +
      "<div class=\"stat\"><b>" + known + "</b><span>sitzen schon</span></div></div>";
    return html + "</section></div>";
  }

  function refCard(ref) {
    var w = byId[ref.id];
    if (!w) return "";
    var inner = word(w) + '<span class="de">' + esc(w.german) + (ref.note ? " · " + esc(ref.note) : "") + "</span>";
    return w.full
      ? '<a class="ref" href="#/wort/' + esc(w.id) + '">' + inner + "</a>"
      : '<div class="ref stub" title="Noch keine eigene Wortkarte">' + inner + "</div>";
  }

  function boardPage(id) {
    var w = byId[id];
    if (!w) return '<div class="empty">Dieses Wort gibt es (noch) nicht. <a href="#/woerter">Zur Wortliste</a></div>';
    if (!w.full) {
      return '<div class="board"><a class="back" href="javascript:history.back()">‹ Zurück</a><div class="headword"><h1>' +
        art(w) + esc(w.greek) + '</h1><div class="de">' + esc(w.german) +
        '</div><p class="note">Für dieses Wort gibt es noch keine Wortkarte. Trag es als neues Wort ein, dann kommt sie beim nächsten Update.</p></div></div>';
    }
    var html = '<div class="board"><a class="back" href="javascript:history.back()">‹ Zurück</a>';
    if (w.parts && w.parts.length) {
      html += '<section class="parts"><span class="label">Zusammengesetzt aus</span>' +
        w.parts.map(refCard).join('<span class="plus">+</span>') + "</section>";
    }
    var chips = "";
    if (w.article) chips += '<span class="chip chip-' + ART_CLASS[w.article] + '">' + esc(w.article) + " · " + ART_NAME[w.article] + "</span>";
    if (w.pos) chips += '<span class="chip">' + esc(w.pos) + "</span>";
    html += '<div class="board-main"><div class="pic-wrap">' + picture(w) + "</div>" +
      '<div class="headword"><h1>' + art(w) + esc(w.greek) + '</h1><div class="de">' + esc(w.german) + "</div>" +
      '<div class="chips">' + chips + "</div>" + (w.gender_note ? '<div class="note">' + esc(w.gender_note) + "</div>" : "") + "</div>" +
      '<aside class="syns"><div class="label">3 Synonyme &amp; Ähnliche</div>' + (w.synonyms || []).map(refCard).join("") + "</aside></div>";
    html += '<div class="board-bottom"><section class="panel"><div class="label">Beispielsätze</div>' +
      (w.sentences || []).map(function (s) {
        return '<div class="sentence"><span class="greek">' + rich(s.el) + '</span><span class="de">' + rich(s.de) + "</span></div>";
      }).join("") + "</section>";
    if (w.memory_tip) {
      html += '<section class="tip"><div class="label">Merkhilfe · ' + esc(w.memory_tip.kind) + "</div><div>" + rich(w.memory_tip.text) + "</div></section>";
    }
    html += "</div>";
    var when = w.added ? new Date(w.added + "T12:00:00").toLocaleDateString("de-DE") : "";
    html += '<div class="foot">' + (w.source === "sie" ? "Von dir eingetragen" : "Verwandtes Wort") + (when ? " · seit " + esc(when) : "") + "</div>";
    return html + "</div>";
  }

  function startSession() {
    session = { queue: dueCards().concat(newCards()), idx: 0, flipped: false, total: 0 };
    session.total = session.queue.length;
  }

  function cardsPage() {
    if (!session || session.idx >= session.queue.length) startSession();
    if (!session.queue.length) {
      return '<div class="empty"><h2>Fertig für heute! Μπράβο!</h2><p>Morgen gibt es neue Karten.</p><a href="#/">Zur Startseite</a></div>';
    }
    var w = session.queue[session.idx];
    var done = Math.min(session.idx, session.total);
    var html = '<div class="progress"><span>Karte ' + (session.idx + 1) + " von " + session.queue.length + '</span><div class="bar"><i style="width:' +
      Math.round(100 * done / session.queue.length) + '%"></i></div></div><div class="flash">';
    if (!session.flipped) {
      html += '<button class="flashcard" data-act="flip"><div class="front">' + art(w) + esc(w.greek) +
        '</div><div class="hint">Was heißt das? Klick auf die Karte zum Umdrehen.</div></button>';
    } else {
      var s = (w.sentences || [])[0];
      var chip = w.article ? '<span class="chip chip-' + ART_CLASS[w.article] + '">' + esc(w.article) + " · " + ART_NAME[w.article] + "</span>" : "";
      html += '<div class="flashcard" style="cursor:default">' + picture(w) +
        '<div class="front" style="font-size:40px">' + art(w) + esc(w.greek) + '</div><div class="answer">' + esc(w.german) + "</div>" + chip +
        (s ? '<div class="sentence"><span class="greek">' + rich(s.el) + '</span><span class="de">' + rich(s.de) + "</span></div>" : "") +
        '<a href="#/wort/' + esc(w.id) + '">Ganze Wortkarte ansehen</a></div>';
      var c = progress.cards[w.id];
      var next = INTERVALS[nextBox(c)];
      html += '<div class="grades">' +
        '<button class="g0" data-act="grade" data-g="0"><b>Nochmal</b><span>gleich wieder</span></button>' +
        '<button class="g1" data-act="grade" data-g="1"><b>Fast</b><span>morgen wieder</span></button>' +
        '<button class="g2" data-act="grade" data-g="2"><b>Gewusst</b><span>' + inDays(next) + "</span></button></div>";
    }
    return html + '<div class="keys">Tastatur: Leertaste = umdrehen · 1 / 2 / 3 = Nochmal / Fast / Gewusst</div></div>';
  }

  // "Gewusst" on a card never seen before skips straight to 3 days
  function nextBox(c) { return c ? Math.min(c.box + 1, INTERVALS.length - 1) : 2; }

  function grade(g) {
    var w = session.queue[session.idx];
    var isNew = !progress.cards[w.id];
    var c = progress.cards[w.id] || { box: 0 };
    if (g === 0) { c.box = 0; c.due = day(); session.queue.push(w); }
    else if (g === 1) { c.box = Math.max(1, c.box); c.due = day(1); }
    else { c.box = nextBox(progress.cards[w.id]); c.due = day(INTERVALS[c.box]); }
    progress.cards[w.id] = c;
    if (isNew) {
      if (progress.newToday.date !== day()) progress.newToday = { date: day(), n: 0 };
      progress.newToday.n++;
    }
    saveProgress();
    session.idx++;
    session.flipped = false;
    render();
  }

  var FILTERS = [
    ["alle", "Alle"], ["sie", "Von mir eingetragen"], ["m", "ο"], ["f", "η"], ["n", "το"], ["ueben", "Übt noch"]
  ];
  function listPage(params) {
    var f = params.f || "alle";
    var q = plain(params.q || "");
    var match = function (w) { return !q || plain(w.greek).indexOf(q) >= 0 || plain(w.german).indexOf(q) >= 0; };
    var list = boards.filter(match).filter(function (w) {
      if (f === "sie") return w.source === "sie";
      if (f === "m" || f === "f" || f === "n") return ART_CLASS[w.article] === f;
      if (f === "ueben") return stateOf(w) === "learn";
      return true;
    });
    var waiting = (f === "alle" || f === "sie") ? pending.filter(function (s) { return !q || plain(s).indexOf(q) >= 0; }) : [];
    var count = function (key) {
      if (key === "alle") return boards.length;
      if (key === "sie") return boards.filter(function (w) { return w.source === "sie"; }).length;
      return null;
    };
    var html = '<div class="list-layout"><div class="list-main"><div class="filters">' +
      FILTERS.map(function (x) {
        var n = count(x[0]);
        var href = "#/woerter?f=" + x[0] + (params.q ? "&q=" + encodeURIComponent(params.q) : "");
        var cls = (x[0] === f ? "on" : "") + (x[0] === "sie" ? " mine" : "");
        var label = x[0].length === 1 ? '<span class="art art-' + x[0] + '">' + x[1] + "</span>" : esc(x[1]);
        return '<a class="' + cls + '" href="' + href + '">' + label + (n != null ? " · " + n : "") + "</a>";
      }).join("") + "</div>";
    if (params.q) html += '<div class="query">Suche: „' + esc(params.q) + '" · <a href="#/woerter?f=' + f + '">Suche löschen</a></div>';
    if (!list.length && !waiting.length) {
      html += '<div class="empty">Keine Wörter gefunden.</div>';
    } else {
      var label = { ok: '<span class="s-ok">Sitzt</span>', learn: '<span class="s-learn">Übt noch</span>', "new": '<span class="s-new">Neu</span>' };
      html += '<div class="table-box"><table><tr><th>GRIECHISCH</th><th>DEUTSCH</th><th>STAND</th></tr>' +
        list.map(function (w) {
          var href = "#/wort/" + esc(w.id);
          return '<tr class="link"><td><a href="' + href + '">' + word(w) + '</a></td><td><a href="' + href + '">' + esc(w.german) +
            "</a></td><td>" + label[stateOf(w)] + "</td></tr>";
        }).join("") +
        waiting.map(function (s) {
          return '<tr class="waiting"><td><span class="greek">' + esc(s) + '</span></td><td>…</td><td><span class="s-wait">In Vorbereitung</span></td></tr>';
        }).join("") + "</table></div>";
    }
    html += '</div><aside class="legend"><div class="label">Die Farben</div>' +
      '<div class="g"><b class="art-m">ο · männlich</b><span>meist auf -ος, -ας, -ης</span></div>' +
      '<div class="g"><b class="art-f">η · weiblich</b><span>meist auf -α, -η</span></div>' +
      '<div class="g"><b class="art-n">το · sächlich</b><span>meist auf -ο, -ι, -μα</span></div>' +
      '<p>Wie im Deutschen: blau, rot, grün. Aber oft ein anderes Genus: <b class="art-f">η</b> θάλασσα, aber <b>das</b> Meer.</p></aside></div>';
    return html;
  }

  // ---------- routing ----------
  function route() {
    var h = location.hash.replace(/^#\/?/, "");
    var parts = h.split("?");
    var path = parts[0].split("/");
    var params = {};
    (parts[1] || "").split("&").forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf("=");
      params[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, " "));
    });
    if (path[0] === "wort" && path[1]) return { view: "wort", id: decodeURIComponent(path[1]), params: params };
    if (path[0] === "karten") return { view: "karten", params: params };
    if (path[0] === "woerter") return { view: "woerter", params: params };
    return { view: "start", params: params };
  }

  function render() {
    var r = route();
    var html = r.view === "wort" ? boardPage(r.id)
      : r.view === "karten" ? cardsPage()
      : r.view === "woerter" ? listPage(r.params)
      : startPage();
    app.innerHTML = html;
    document.querySelectorAll("[data-nav]").forEach(function (a) {
      a.classList.toggle("on", a.getAttribute("data-nav") === (r.view === "wort" ? "woerter" : r.view));
    });
  }

  app.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]");
    if (!t) return;
    if (t.getAttribute("data-act") === "flip") { session.flipped = true; render(); }
    if (t.getAttribute("data-act") === "grade") grade(Number(t.getAttribute("data-g")));
  });

  document.addEventListener("keydown", function (e) {
    if (route().view !== "karten" || !session || e.target.tagName === "INPUT") return;
    if (e.key === " " && !session.flipped && session.queue.length) { e.preventDefault(); session.flipped = true; render(); }
    else if (session.flipped && (e.key === "1" || e.key === "2" || e.key === "3")) grade(Number(e.key) - 1);
  });

  window.addEventListener("hashchange", function () {
    if (route().view !== "karten") session = session && session.idx < session.queue.length ? session : null;
    render();
    window.scrollTo(0, 0);
  });

  // ---------- search ----------
  var search = document.getElementById("search");
  var results = document.getElementById("search-results");
  function find(q) {
    q = plain(q);
    if (!q) return [];
    return boards.filter(function (w) { return plain(w.greek).indexOf(q) >= 0 || plain(w.german).indexOf(q) >= 0; })
      .sort(function (a, b) { return (plain(a.greek).indexOf(q) === 0 ? 0 : 1) - (plain(b.greek).indexOf(q) === 0 ? 0 : 1); });
  }
  function closeSearch() { results.hidden = true; }
  search.addEventListener("input", function () {
    var q = search.value.trim();
    if (!q) return closeSearch();
    var hits = find(q);
    results.innerHTML = (hits.length
      ? hits.slice(0, 8).map(function (w) {
        return '<a href="#/wort/' + esc(w.id) + '">' + word(w) + '<span class="de">' + esc(w.german) + "</span></a>";
      }).join("") + (hits.length > 8 ? '<a class="all" href="#/woerter?q=' + encodeURIComponent(q) + '">Alle ' + hits.length + " Treffer</a>" : "")
      : '<div class="none">Nichts gefunden. Vielleicht noch nicht im Buch?</div>');
    results.hidden = false;
  });
  search.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && search.value.trim()) {
      location.hash = "#/woerter?q=" + encodeURIComponent(search.value.trim());
      closeSearch();
    } else if (e.key === "Escape") { search.value = ""; closeSearch(); }
  });
  results.addEventListener("click", function () { search.value = ""; closeSearch(); });
  document.addEventListener("click", function (e) { if (!e.target.closest(".search")) closeSearch(); });

  if (CFG.title) {
    document.getElementById("brand").textContent = CFG.title;
    document.title = CFG.title;
  }
  render();
  loadEntries();
})();
