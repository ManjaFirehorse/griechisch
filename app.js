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
  function bare(s) { return String(s || "").replace(/\*\*/g, ""); }
  function plain(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ς/g, "σ").trim();
  }
  function day(offset) {
    var d = new Date();
    d.setDate(d.getDate() + (offset || 0));
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function inDays(n) { return n <= 0 ? "kommt gleich wieder" : n === 1 ? "kommt morgen wieder" : "kommt in " + n + " Tagen wieder"; }

  var ART_CLASS = { "ο": "m", "η": "f", "το": "n", "οι": "p", "τα": "p" };
  var ART_NAME = { "ο": "männlich (wie „der“)", "η": "weiblich (wie „die“)", "το": "sächlich (wie „das“)", "οι": "Mehrzahl", "τα": "Mehrzahl" };
  function art(w) {
    return w.article ? '<span class="art art-' + ART_CLASS[w.article] + '">' + esc(w.article) + "</span> " : "";
  }
  function word(w) { return '<span class="greek">' + art(w) + esc(w.greek) + "</span>"; }
  function full(w) { return (w.article ? w.article + " " : "") + w.greek; }
  function picture(w, cls) {
    cls = "pic" + (cls ? " " + cls : "");
    if (w.picture) return '<img class="' + cls + '" src="' + esc(w.picture) + '" alt="' + esc(w.german) + '" loading="lazy">';
    return '<div class="' + cls + ' emoji" role="img" aria-label="' + esc(w.german) + '"><span>' + esc(w.emoji || "📖") + "</span></div>";
  }
  // Big picture that shows the whole photo: the blurred copy fills the frame behind it.
  function bigPicture(w) {
    if (!w.picture) return picture(w, "big");
    return '<div class="pic big framed" style="--photo:url(\'' + esc(w.picture) + '\')"><img src="' + esc(w.picture) + '" alt="' + esc(w.german) + '"></div>';
  }

  // ---------- pronunciation in Latin letters, for German readers ----------
  // An aid, not phonetics: γ before e/i = j, χ = ch, β = w, δ = dh (englisches „th“ in „this“), θ = th.
  var VOWEL = { "α": "a", "ε": "e", "η": "i", "ι": "i", "ο": "o", "υ": "i", "ω": "o" };
  var CONS = { "β": "w", "δ": "dh", "ζ": "s", "θ": "th", "κ": "k", "λ": "l", "μ": "m", "ν": "n", "ξ": "x",
    "π": "p", "ρ": "r", "σ": "s", "τ": "t", "φ": "f", "χ": "ch", "ψ": "ps" };
  var STRESS = { a: "á", e: "é", i: "í", o: "ó", u: "ú" };
  function translit(text) {
    var src = String(text || "").normalize("NFD"), ch = [], k;
    for (k = 0; k < src.length; k++) {
      var c = src[k];
      if (c === "́") { if (ch.length) ch[ch.length - 1].acc = true; continue; }
      if (c === "̈") { if (ch.length) ch[ch.length - 1].dia = true; continue; }
      if (/[̀-ͯ]/.test(c)) continue;
      var lo = c.toLowerCase();
      ch.push({ c: lo === "ς" ? "σ" : lo, o: c, up: lo !== c, acc: false, dia: false });
    }
    function at(i) { return ch[i] ? ch[i].c : ""; }
    function isV(i) { return VOWEL.hasOwnProperty(at(i)); }
    function isG(i) { return /[α-ω]/.test(at(i)); }
    function pair(i) { return ch[i + 1] && !ch[i + 1].dia ? at(i) + at(i + 1) : ""; }
    function st(v, acc) { return acc ? STRESS[v] : v; }
    // vowel group at i -> [latin, length, sound]
    function vowel(i) {
      var p = pair(i), acc2 = ch[i].acc || (ch[i + 1] && ch[i + 1].acc);
      if (p === "ου") return [st("u", acc2), 2, "u"];
      if (p === "ει" || p === "οι" || p === "υι") return [st("i", acc2), 2, "i"];
      if (p === "αι") return [st("e", acc2), 2, "e"];
      if (p === "αυ" || p === "ευ") {
        var n = at(i + 2), voiceless = !isG(i + 2) || "θκξπστφχψ".indexOf(n) >= 0;
        var v = p[0] === "α" ? "a" : "e";
        return [st(v, acc2) + (voiceless ? "f" : "w"), 2, v];
      }
      var b = VOWEL[at(i)];
      return [st(b, ch[i].acc), 1, b];
    }
    var out = "", i = 0;
    while (i < ch.length) {
      var c0 = at(i), start = !isG(i - 1), piece, len = 1;
      if (isV(i)) {
        var g = vowel(i); piece = g[0]; len = g[1];
      } else if (c0 === "γ") {
        var nx = at(i + 1);
        if (nx === "γ") { piece = "ng"; len = 2; }
        else if (nx === "κ") { piece = start ? "g" : "ng"; len = 2; }
        else if (nx === "χ" || nx === "ξ") piece = "n";
        else if (isV(i + 1) && "eiι".indexOf(vowel(i + 1)[2]) >= 0) {
          var gv = vowel(i + 1);
          // γεια, γιαγιά: the i-sound before another vowel melts into the j
          if (gv[2] === "i" && !/[íÍ]/.test(gv[0]) && isV(i + 1 + gv[1])) { piece = "j"; len = 1 + gv[1]; }
          else piece = "j";
        } else piece = "gh";
      } else if (c0 === "μ" && at(i + 1) === "π") { piece = start ? "b" : "mb"; len = 2; }
      else if (c0 === "ν" && at(i + 1) === "τ") { piece = start ? "d" : "nd"; len = 2; }
      else if (c0 === "τ" && at(i + 1) === "σ") { piece = "ts"; len = 2; }
      else if (c0 === "τ" && at(i + 1) === "ζ") { piece = "ds"; len = 2; }
      else if (CONS[c0]) piece = CONS[c0];
      else piece = ch[i].o; // not Greek: keep as is
      if (ch[i].up && isG(i) && piece) piece = piece.charAt(0).toUpperCase() + piece.slice(1);
      out += piece;
      i += len;
    }
    return out;
  }
  // stressed vowel in bold, for the big headword
  function sayHtml(s) { return esc(translit(s)).replace(/([áéíóúÁÉÍÓÚ])/g, "<b>$1</b>"); }

  // ---------- read aloud (uses the Greek voice of the device, if it has one) ----------
  var greekVoice = null;
  function pickVoice() {
    if (!window.speechSynthesis) return;
    var vs = speechSynthesis.getVoices().filter(function (v) { return /^el/i.test(v.lang); });
    greekVoice = vs[0] || null;
    document.body.classList.toggle("can-speak", !!greekVoice);
  }
  if (window.speechSynthesis) {
    pickVoice();
    speechSynthesis.addEventListener ? speechSynthesis.addEventListener("voiceschanged", pickVoice) : (speechSynthesis.onvoiceschanged = pickVoice);
  }
  function speak(text) {
    if (!greekVoice) return;
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.voice = greekVoice; u.lang = greekVoice.lang; u.rate = 0.8;
    speechSynthesis.speak(u);
  }
  function sayBtn(text, big) {
    return '<button class="say' + (big ? " say-big" : "") + '" data-act="say" data-say="' + esc(bare(text)) + '" aria-label="Anhören" title="Anhören">' +
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>' +
      (big ? "<span>Anhören</span>" : "") + "</button>";
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

  // ---------- building blocks ----------
  var STATE_BADGE = { ok: '<span class="badge b-ok">✓ Sitzt</span>', learn: '<span class="badge b-learn">Übt noch</span>', "new": "" };
  function tile(w, extra) {
    return '<a class="tile" href="#/wort/' + esc(w.id) + '">' + picture(w, "thumb") +
      '<span class="tile-text">' + word(w) + '<span class="say-line">' + esc(translit(w.greek)) + "</span>" +
      '<span class="de">' + esc(w.german) + "</span>" + (extra || "") + "</span></a>";
  }
  function newWordButton(cls) {
    return NEW_WORD_URL ? '<a class="btn ' + (cls || "btn-light") + '" href="' + esc(NEW_WORD_URL) + '" target="_blank" rel="noopener">＋ Neues Wort eintragen</a>' : "";
  }

  // ---------- pages ----------
  function startPage() {
    var hour = new Date().getHours();
    var hello = hour < 12 ? ["Καλημέρα!", "Guten Morgen!"] : hour < 20 ? ["Καλησπέρα!", "Guten Abend!"] : ["Καληνύχτα!", "Gute Nacht!"];
    var date = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
    var due = dueCards().length + newCards().length;
    var mine = boards.filter(function (w) { return w.source === "sie"; });
    var week = day(-7);
    var recent = mine.filter(function (w) { return w.added >= week; });
    var recentTitle = "Neu diese Woche";
    if (!recent.length) { recent = mine.slice(); recentTitle = "Zuletzt eingetragen"; }
    recent.sort(function (a, b) { return String(b.added).localeCompare(String(a.added)); });
    recent = recent.slice(0, 6);
    var known = boards.filter(function (w) { return stateOf(w) === "ok"; }).length;

    var html = '<section class="hello"><div class="date">' + esc(date) + "</div>" +
      '<h1><span class="greek">' + hello[0] + '</span> <span class="hello-de">' + hello[1] + "</span></h1>" +
      '<div class="hello-say">Gesprochen: <b>' + esc(translit(hello[0])) + "</b> " + sayBtn(hello[0]) + "</div></section>";

    html += '<div class="start-grid"><section class="today">';
    if (due) {
      html += '<h2>Heute üben</h2><p class="today-big"><b>' + due + "</b> Karten · ca. " + Math.max(1, Math.round(due / 2.5)) + " Minuten</p>" +
        "<p>Du siehst ein griechisches Wort und überlegst, was es heißt. Dann drehst du die Karte um.</p>" +
        '<a class="btn btn-sun" href="#/karten">Jetzt üben ›</a>';
    } else {
      html += "<h2>Heute üben</h2><p class=\"today-big\"><b>✓</b> Alles geschafft</p><p>" +
        (boards.length ? "Für heute ist alles wiederholt. Μπράβο! (Bravo!) Morgen gibt es neue Karten." : "Noch keine Wörter. Trag dein erstes Wort ein.") + "</p>";
    }
    html += '</section><section class="howto"><h2>So geht’s</h2><ol>' +
      "<li><b>Wort antippen</b>: Du siehst ein Bild, die Aussprache und Beispielsätze.</li>" +
      "<li><b>Jeden Tag üben</b>: ein paar Karten, nur wenige Minuten.</li>" +
      "<li><b>Neues Wort?</b> Einfach eintragen. Es kommt beim nächsten Update dazu.</li></ol>" +
      newWordButton("btn-outline") + "</section></div>";

    if (recent.length) {
      html += '<section class="block"><div class="block-head"><h2>' + recentTitle + '</h2><a class="more" href="#/woerter">Alle Wörter ansehen ›</a></div>' +
        '<div class="tiles">' + recent.map(function (w) { return tile(w); }).join("") + "</div></section>";
    }
    if (pending.length) {
      html += '<div class="pending-box"><b>' + pending.length + " Wörter in Vorbereitung:</b> <span class=\"greek\">" +
        esc(pending.slice(0, 6).join(", ")) + (pending.length > 6 ? " …" : "") + "</span>. Sie kommen beim nächsten Update.</div>";
    }
    html += '<div class="stats">' +
      '<div class="stat"><b>' + mine.length + "</b><span>von dir eingetragen</span></div>" +
      "<div class=\"stat\"><b>" + boards.length + "</b><span>Wörter im Buch</span></div>" +
      "<div class=\"stat\"><b>" + known + "</b><span>sitzen schon</span></div></div>";
    return html;
  }

  function refCard(ref) {
    var w = byId[ref.id];
    if (!w) return "";
    var note = ref.note ? '<span class="note-chip">' + esc(ref.note) + "</span>" : "";
    if (w.full) return tile(w, note);
    return '<div class="tile stub" title="Noch keine eigene Wortkarte"><span class="tile-text">' + word(w) +
      '<span class="say-line">' + esc(translit(w.greek)) + '</span><span class="de">' + esc(w.german) + "</span>" + note + "</span></div>";
  }

  function boardOrder() {
    return boards.slice().sort(function (a, b) { return plain(a.greek).localeCompare(plain(b.greek), "el"); });
  }

  function boardPage(id) {
    var w = byId[id];
    var back = '<button class="btn btn-light back" data-act="back">‹ Zurück</button>';
    if (!w) return '<div class="empty">Dieses Wort gibt es (noch) nicht.<br><a class="btn btn-light" href="#/woerter">Zu allen Wörtern</a></div>';
    if (!w.full) {
      return '<div class="board">' + back + '<div class="headword"><h1>' +
        art(w) + esc(w.greek) + '</h1><div class="say-big-line">' + sayHtml(w.greek) + " " + sayBtn(full(w)) + '</div><div class="de">' + esc(w.german) +
        '</div><p class="note">Für dieses Wort gibt es noch keine eigene Wortkarte. Trag es als neues Wort ein, dann kommt sie beim nächsten Update.</p>' +
        newWordButton("btn-outline") + "</div></div>";
    }
    var order = boardOrder(), pos = order.indexOf(w);
    var prev = order[(pos - 1 + order.length) % order.length], next = order[(pos + 1) % order.length];
    var html = '<div class="board"><div class="board-nav">' + back +
      (order.length > 1 ? '<span class="step"><a class="btn btn-light" href="#/wort/' + esc(prev.id) + '" aria-label="Voriges Wort">‹</a>' +
        '<span class="count">' + (pos + 1) + " / " + order.length + '</span><a class="btn btn-light" href="#/wort/' + esc(next.id) + '">Weiter ›</a></span>' : "") +
      "</div>";

    var chips = "";
    if (w.article) chips += '<span class="chip chip-' + ART_CLASS[w.article] + '">' + esc(w.article) + " = " + ART_NAME[w.article] + "</span>";
    if (w.pos) chips += '<span class="chip">' + esc(w.pos) + "</span>";
    html += '<section class="board-main">' + bigPicture(w) +
      '<div class="headword"><h1>' + art(w) + esc(w.greek) + "</h1>" +
      '<div class="say-big-line"><span class="say-label">So spricht man es:</span> <span class="say-word">' + sayHtml(full(w)) + "</span></div>" +
      sayBtn(full(w), true) +
      '<div class="de">' + esc(w.german) + "</div>" +
      '<div class="chips">' + chips + "</div>" + (w.gender_note ? '<div class="note">' + esc(w.gender_note) + "</div>" : "") + "</div></section>";

    html += '<section class="panel"><h2>Beispielsätze</h2>' +
      (w.sentences || []).map(function (s) {
        return '<div class="sentence"><div class="sentence-el"><span class="greek">' + rich(s.el) + "</span>" + sayBtn(s.el) + "</div>" +
          '<span class="say-line">' + rich(translit(s.el)) + '</span><span class="de">' + rich(s.de) + "</span></div>";
      }).join("") + "</section>";
    if (w.memory_tip) {
      html += '<section class="tip"><h2>💡 Merkhilfe</h2><div>' + rich(w.memory_tip.text) + "</div></section>";
    }
    if (w.synonyms && w.synonyms.length) {
      html += '<section class="block"><h2>Ähnliche Wörter</h2><div class="tiles">' + w.synonyms.map(refCard).join("") + "</div></section>";
    }
    if (w.parts && w.parts.length) {
      html += '<section class="block"><h2>Das Wort besteht aus</h2><div class="tiles parts">' +
        w.parts.map(refCard).join('<span class="plus" aria-hidden="true">+</span>') + "</div></section>";
    }
    var when = w.added ? new Date(w.added + "T12:00:00").toLocaleDateString("de-DE") : "";
    html += '<div class="foot">' + (w.source === "sie" ? "Von dir eingetragen" : "Verwandtes Wort") + (when ? " am " + esc(when) : "") + "</div>";
    return html + "</div>";
  }

  function startSession() {
    session = { queue: dueCards().concat(newCards()), idx: 0, flipped: false, total: 0 };
    session.total = session.queue.length;
  }

  function cardsPage() {
    if (!session || session.idx >= session.queue.length) startSession();
    if (!session.queue.length) {
      return '<div class="empty"><div class="empty-icon">🎉</div><h2>Fertig für heute! Μπράβο!</h2><p>Morgen gibt es neue Karten.</p>' +
        '<a class="btn btn-sun" href="#/">Zur Startseite</a> <a class="btn btn-light" href="#/woerter">Wörter ansehen</a></div>';
    }
    var w = session.queue[session.idx];
    var done = Math.min(session.idx, session.total);
    var html = '<div class="progress"><span>Karte ' + (session.idx + 1) + " von " + session.queue.length + '</span><div class="bar"><i style="width:' +
      Math.round(100 * done / session.queue.length) + '%"></i></div></div><div class="flash">';
    if (!session.flipped) {
      html += '<button class="flashcard" data-act="flip"><span class="front">' + art(w) + esc(w.greek) + "</span>" +
        '<span class="say-big-line">' + sayHtml(full(w)) + "</span>" +
        '<span class="hint">Was heißt das auf Deutsch?</span><span class="btn btn-sun">Karte umdrehen</span></button>';
    } else {
      var s = (w.sentences || [])[0];
      var chip = w.article ? '<span class="chip chip-' + ART_CLASS[w.article] + '">' + esc(w.article) + " = " + ART_NAME[w.article] + "</span>" : "";
      html += '<div class="flashcard back-side">' + bigPicture(w) +
        '<div class="answer">' + esc(w.german) + "</div>" +
        '<div class="front small">' + art(w) + esc(w.greek) + "</div>" +
        '<div class="say-big-line"><span>' + sayHtml(full(w)) + "</span>" + sayBtn(full(w)) + "</div>" + chip +
        (s ? '<div class="sentence"><span class="greek">' + rich(s.el) + '</span><span class="de">' + rich(s.de) + "</span></div>" : "") +
        '<a href="#/wort/' + esc(w.id) + '">Ganze Wortkarte ansehen ›</a></div>';
      var c = progress.cards[w.id];
      var next = INTERVALS[nextBox(c)];
      html += '<p class="grade-q">Hast du es gewusst?</p><div class="grades">' +
        '<button class="g0" data-act="grade" data-g="0"><b>Nein</b><span>kommt gleich nochmal</span></button>' +
        '<button class="g1" data-act="grade" data-g="1"><b>Ein bisschen</b><span>kommt morgen wieder</span></button>' +
        '<button class="g2" data-act="grade" data-g="2"><b>Ja!</b><span>' + inDays(next) + "</span></button></div>";
    }
    return html + "</div>";
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
    window.scrollTo(0, 0);
  }

  var FILTERS = [
    ["alle", "Alle"], ["sie", "Meine Wörter"], ["ueben", "Übe ich noch"], ["m", "ο"], ["f", "η"], ["n", "το"]
  ];
  function listPage(params) {
    var f = params.f || "alle";
    var q = plain(params.q || "");
    var match = function (w) { return !q || plain(w.greek).indexOf(q) >= 0 || plain(w.german).indexOf(q) >= 0; };
    var list = boardOrder().filter(match).filter(function (w) {
      if (f === "sie") return w.source === "sie";
      if (f === "m" || f === "f" || f === "n") return ART_CLASS[w.article] === f;
      if (f === "ueben") return stateOf(w) === "learn";
      return true;
    });
    var waiting = (f === "alle" || f === "sie") ? pending.filter(function (s) { return !q || plain(s).indexOf(q) >= 0; }) : [];
    var html = '<h1 class="page-title">Alle Wörter</h1>' +
      '<form class="big-search" data-act="search"><input id="list-search" type="search" value="' + esc(params.q || "") +
      '" placeholder="Wort suchen, z. B. Meer oder θάλασσα" aria-label="Wort suchen"><button class="btn btn-sun" type="submit">Suchen</button></form>' +
      '<div class="filters">' +
      FILTERS.map(function (x) {
        var href = "#/woerter?f=" + x[0] + (params.q ? "&q=" + encodeURIComponent(params.q) : "");
        var label = x[0].length === 1 ? '<span class="art art-' + x[0] + '">' + x[1] + "</span> " + ART_NAME[x[1]].split(" ")[0] : esc(x[1]);
        return '<a class="' + (x[0] === f ? "on" : "") + '" href="' + href + '">' + label + "</a>";
      }).join("") + "</div>";
    if (params.q) html += '<div class="query">Suche: „' + esc(params.q) + '“ · <a href="#/woerter?f=' + f + '">Suche löschen</a></div>';
    if (!list.length && !waiting.length) {
      html += '<div class="empty">Keine Wörter gefunden.' + (params.q ? " Vielleicht ist es noch nicht im Buch?" : "") + "<br>" + newWordButton("btn-outline") + "</div>";
    } else {
      html += '<div class="tiles">' + list.map(function (w) { return tile(w, STATE_BADGE[stateOf(w)]); }).join("") +
        waiting.map(function (s) {
          return '<div class="tile stub"><span class="tile-text"><span class="greek">' + esc(s) + '</span><span class="say-line">' + esc(translit(s)) +
            '</span><span class="badge b-wait">In Vorbereitung</span></span></div>';
        }).join("") + "</div>";
    }
    html += '<aside class="legend"><h2>Was bedeuten die Farben?</h2><div class="legend-row">' +
      '<div class="g"><b class="art-m">ο</b><span><b>männlich</b>, wie „der“<br>meist auf -ος, -ας, -ης</span></div>' +
      '<div class="g"><b class="art-f">η</b><span><b>weiblich</b>, wie „die“<br>meist auf -α, -η</span></div>' +
      '<div class="g"><b class="art-n">το</b><span><b>sächlich</b>, wie „das“<br>meist auf -ο, -ι, -μα</span></div></div>' +
      '<p>Wie im Deutschen: blau, rot, grün. Aber oft anders als im Deutschen: <b class="art-f">η</b> θάλασσα, aber <b>das</b> Meer.</p></aside>';
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

  var visited = 0; // pages seen in this visit, so "Zurück" never leaves the site
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
    var act = t.getAttribute("data-act");
    if (act === "flip") { session.flipped = true; render(); }
    if (act === "grade") grade(Number(t.getAttribute("data-g")));
    if (act === "say") { e.preventDefault(); e.stopPropagation(); speak(t.getAttribute("data-say")); }
    if (act === "back") { if (visited > 1) history.back(); else location.hash = "#/woerter"; }
  });
  app.addEventListener("submit", function (e) {
    if (!e.target.matches("[data-act=search]")) return;
    e.preventDefault();
    var q = document.getElementById("list-search").value.trim();
    location.hash = "#/woerter" + (q ? "?q=" + encodeURIComponent(q) : "");
  });

  document.addEventListener("keydown", function (e) {
    if (route().view !== "karten" || !session || e.target.tagName === "INPUT") return;
    if (e.key === " " && !session.flipped && session.queue.length) { e.preventDefault(); session.flipped = true; render(); }
    else if (session.flipped && (e.key === "1" || e.key === "2" || e.key === "3")) grade(Number(e.key) - 1);
  });

  window.addEventListener("hashchange", function () {
    visited++;
    if (route().view !== "karten") session = session && session.idx < session.queue.length ? session : null;
    render();
    window.scrollTo(0, 0);
  });

  // ---------- search in the header ----------
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
        return '<a href="#/wort/' + esc(w.id) + '">' + picture(w, "mini") + word(w) + '<span class="de">' + esc(w.german) + "</span></a>";
      }).join("") + (hits.length > 8 ? '<a class="all" href="#/woerter?q=' + encodeURIComponent(q) + '">Alle ' + hits.length + " Treffer</a>" : "")
      : '<div class="none">Nichts gefunden. Vielleicht noch nicht im Buch?</div>');
    results.hidden = false;
  });
  search.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && search.value.trim()) {
      location.hash = "#/woerter?q=" + encodeURIComponent(search.value.trim());
      search.value = "";
      closeSearch();
    } else if (e.key === "Escape") { search.value = ""; closeSearch(); }
  });
  results.addEventListener("click", function () { search.value = ""; closeSearch(); });
  document.addEventListener("click", function (e) { if (!e.target.closest(".search")) closeSearch(); });

  if (CFG.title) {
    document.getElementById("brand-name").textContent = CFG.title;
    document.title = CFG.title;
  }
  visited = 1;
  render();
  loadEntries();
})();
