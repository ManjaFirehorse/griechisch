"""Helper for the Greek word book.

    python tools/greek.py inbox                 new rows from her Google Sheet (not handled yet), as JSON
    python tools/greek.py exists <greek>...     board / stub / missing for each word, in one call
    python tools/greek.py apply <batch.json>    write all words + pictures from one batch, then build
    python tools/greek.py build                 check every word, then write words.js and status.csv
    python tools/greek.py check                 only check
    python tools/greek.py stats                 how many words are in the book

Batch file (see the add-greek-words skill for the full rules):
    {"words":   [ <full board entry> ],
     "updates": [ {"greek": "σπίτι", "source": "sie", "sheet_input": "spiti", "picture": {...}} ],
     "marks":   [ {"input": "xyzw", "status": "Rechtschreibung prüfen"} ]}
    full board = {"greek", "article", "pos", "german", "gender_note"?, "parts": [ref], "synonyms": [ref x3],
                  "sentences": [{"el", "de"} x3], "memory_tip"?: {"kind", "text"}, "picture"?: picture,
                  "source": "sie" | "verwandt", "sheet_input"?: what she typed in column A}
    ref = {"greek", "article"?, "german", "note"?}   (missing refs become stubs automatically)
    picture = {"url": "..."} | {"wiki": "<English Wikipedia article>", "emoji": "🌅"} | {"emoji": "🌅"}
    url/wiki are tried first; emoji is the fallback.

Ids are made from the Greek automatically (καλημέρα -> kalimera); you never pick them.
"""
import csv
import datetime as dt
import io
import json
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORDS = ROOT / "words"
PICS = ROOT / "pictures"
CONFIG = ROOT / "config.js"
MARKS = ROOT / "tools" / "sheet-marks.json"
LAST_BATCH = ROOT / "tools" / "last-batch.json"
OUT_JS = ROOT / "words.js"
OUT_STATUS = ROOT / "status.csv"

ARTICLES = {"", "ο", "η", "το", "οι", "τα"}
NOUN_POS = {"Nomen"}
POS = {"Nomen", "Verb", "Adjektiv", "Adverb", "Ausdruck", "Pronomen", "Präposition", "Konjunktion", "Zahl"}
SOURCES = {"sie", "verwandt"}
TIP_KINDS = {"gleiche Wurzel", "klingt wie", "falscher Freund", "Eselsbrücke"}
IMAGE_EXT = (".jpg", ".png", ".webp", ".gif", ".svg")
UA = {"User-Agent": "GreekWordBook/1.0 (personal learning tool; Python urllib)"}
BROWSER_UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}

sys.stdout.reconfigure(encoding="utf-8")


# ---------- text ----------
def plain(text):
    """Lowercase, no accents, final ς -> σ: the form used for matching."""
    t = unicodedata.normalize("NFD", text.strip().lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return t.replace("ς", "σ")


LEADING_ARTICLE = re.compile(r"^(ο|η|το|οι|τα|ένας|μια|μία|ένα|ενας|ενα)\s+", re.I)


def key(text):
    """Matching key for a Greek word: no article, no accents, single spaces."""
    t = plain(text)
    t = LEADING_ARTICLE.sub("", plain(t))
    return re.sub(r"\s+", " ", t)


def input_key(text):
    return re.sub(r"\s+", " ", text.strip().lower())


TRANSLIT = [("ου", "ou"), ("αυ", "av"), ("ευ", "ev"), ("γγ", "ng"), ("θ", "th"), ("χ", "ch"), ("ψ", "ps"),
            ("α", "a"), ("β", "v"), ("γ", "g"), ("δ", "d"), ("ε", "e"), ("ζ", "z"), ("η", "i"), ("ι", "i"),
            ("κ", "k"), ("λ", "l"), ("μ", "m"), ("ν", "n"), ("ξ", "x"), ("ο", "o"), ("π", "p"), ("ρ", "r"),
            ("σ", "s"), ("τ", "t"), ("υ", "y"), ("φ", "f"), ("ω", "o")]


def base_id(greek):
    t = key(greek)
    for a, b in TRANSLIT:
        t = t.replace(a, b)
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t or "wort"


# ---------- words ----------
def load():
    return {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(WORDS.glob("*.json"))}


def save_word(w):
    WORDS.mkdir(exist_ok=True)
    (WORDS / f"{w['id']}.json").write_text(json.dumps(w, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def by_key(words):
    return {key(w["greek"]): wid for wid, w in words.items()}


def resolve_id(words, greek):
    """Existing id for this Greek word, or a new unused one."""
    found = by_key(words).get(key(greek))
    if found:
        return found
    wid, n = base_id(greek), 2
    while wid in words:
        wid, n = f"{base_id(greek)}-{n}", n + 1
    return wid


def picture_file(wid):
    for ext in IMAGE_EXT:
        if (PICS / f"{wid}{ext}").exists():
            return f"pictures/{wid}{ext}"
    return None


def load_marks():
    return json.loads(MARKS.read_text(encoding="utf-8")) if MARKS.exists() else {}


def check(words):
    errors = []
    keys = {}
    for wid, w in words.items():
        where = f"{wid}:"
        if w.get("id") != wid:
            errors.append(f"{where} id field does not match the file name")
        if not w.get("greek") or not w.get("german"):
            errors.append(f"{where} needs greek and german")
        k = key(w.get("greek", ""))
        if k in keys:
            errors.append(f"{where} same word as {keys[k]}")
        keys[k] = wid
        if w.get("article", "") not in ARTICLES:
            errors.append(f"{where} article must be one of ο, η, το, οι, τα or empty")
        if not w.get("full"):
            continue
        if w.get("pos") not in POS:
            errors.append(f"{where} pos must be one of {sorted(POS)}")
        if w.get("pos") in NOUN_POS and not w.get("article"):
            errors.append(f"{where} a noun needs its article (ο / η / το)")
        if w.get("source") not in SOURCES:
            errors.append(f"{where} source must be 'sie' or 'verwandt'")
        sents = w.get("sentences", [])
        if len(sents) != 3 or not all(s.get("el") and s.get("de") for s in sents):
            errors.append(f"{where} needs exactly 3 sentences, each with el and de")
        syns = w.get("synonyms", [])
        if len(syns) != 3:
            errors.append(f"{where} needs exactly 3 synonyms (close words are fine when no true synonym exists)")
        for ref in w.get("parts", []) + syns:
            if ref.get("id") not in words:
                errors.append(f"{where} links to missing word {ref.get('id')}")
            elif ref["id"] == wid:
                errors.append(f"{where} links to itself")
        tip = w.get("memory_tip")
        if tip and (tip.get("kind") not in TIP_KINDS or not tip.get("text")):
            errors.append(f"{where} memory_tip kind must be one of {sorted(TIP_KINDS)}")
        if not picture_file(wid) and not w.get("emoji"):
            errors.append(f"{where} has no picture and no emoji")
    return errors


def public(w):
    """What the website gets for one word."""
    out = {k: w[k] for k in ("id", "greek", "article", "german", "full") if k in w}
    if w.get("full"):
        for k in ("pos", "gender_note", "parts", "synonyms", "sentences", "memory_tip", "source", "added", "emoji"):
            if w.get(k):
                out[k] = w[k]
        pic = picture_file(w["id"])
        if pic:
            out["picture"] = pic
    if w.get("sheet_inputs"):
        out["sheet_inputs"] = w["sheet_inputs"]
    return out


def build(words):
    errors = check(words)
    if errors:
        print("Not built, fix these first:")
        print("\n".join("  " + e for e in errors))
        return False
    marks = load_marks()
    data = [public(w) for w in sorted(words.values(), key=lambda w: plain(w["greek"]))]
    OUT_JS.write_text(
        "// Generated by tools/greek.py build. Do not edit.\n"
        f"window.WORDS = {json.dumps(data, ensure_ascii=False, indent=1)};\n"
        f"window.SHEET_MARKS = {json.dumps(marks, ensure_ascii=False)};\n",
        encoding="utf-8")
    # status.csv: read by the formula in column D of her sheet.
    buf = io.StringIO()
    out = csv.writer(buf, lineterminator="\n")
    for w in words.values():
        for raw in w.get("sheet_inputs", []):
            done = "Fertig" if key(raw) == key(w["greek"]) else f"Fertig → {w['greek']}"
            out.writerow([raw.strip(), done])
    for raw, status in marks.items():
        out.writerow([raw, status])
    OUT_STATUS.write_text(buf.getvalue(), encoding="utf-8")
    full = sum(1 for w in words.values() if w.get("full"))
    print(f"Built words.js: {full} boards, {len(words) - full} stubs.")
    return True


def stats(words):
    full = [w for w in words.values() if w.get("full")]
    sie = sum(1 for w in full if w.get("source") == "sie")
    print(f"{len(full)} boards ({sie} added by her, {len(full) - sie} related), {len(words) - len(full)} stubs")


# ---------- sheet ----------
def config():
    text = CONFIG.read_text(encoding="utf-8")
    return json.loads(text[text.index("{"):text.rindex("}") + 1])


def fetch(url, headers=UA, limit=8_000_000):
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=25) as r:
        ctype = r.headers.get("Content-Type", "").split(";")[0].strip().lower()
        return r.read(limit + 1), ctype


def sheet_rows():
    url = config().get("sheet_csv_url")
    if not url:
        sys.exit("config.js has no sheet_csv_url yet. See SETUP.md, step 2.")
    body, _ = fetch(url)
    rows = list(csv.reader(io.StringIO(body.decode("utf-8-sig"))))
    out = []
    for n, r in enumerate(rows[1:], start=2):
        r = (r + ["", "", ""])[:3]
        if r[0].strip():
            out.append({"row": n, "word": r[0].strip(), "hint": r[1].strip(), "picture_link": r[2].strip()})
    return out


def inbox():
    words = load()
    handled = {input_key(raw) for w in words.values() for raw in w.get("sheet_inputs", [])}
    handled |= {input_key(raw) for raw in load_marks()}
    keys = by_key(words)
    new = []
    for r in sheet_rows():
        if input_key(r["word"]) in handled:
            continue
        wid = keys.get(key(r["word"]))
        if not wid:
            r["in_book"] = "no"
        else:
            w = words[wid]
            r["in_book"] = f"{wid}: " + (("board, added by her" if w.get("source") == "sie" else "board, built as a related word")
                                         if w.get("full") else "stub only")
        new.append(r)
    print(json.dumps(new, ensure_ascii=False, indent=1) if new else "[]  (nothing new in the sheet)")


def exists(greeks):
    words = load()
    keys = by_key(words)
    for g in greeks:
        wid = keys.get(key(g))
        print(f"{g}: " + ("missing" if not wid else ("board" if words[wid].get("full") else "stub") + f" ({wid})"))


# ---------- pictures ----------
def wiki_thumbs(titles):
    """Main photo of each English Wikipedia article: {requested title: thumbnail url}."""
    found = {}
    titles = list(dict.fromkeys(titles))
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        url = "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode({
            "action": "query", "format": "json", "redirects": 1, "titles": "|".join(chunk),
            "prop": "pageimages", "piprop": "thumbnail", "pithumbsize": 640})
        data = json.loads(fetch(url)[0])["query"]
        back = {t: t for t in chunk}
        for step in ("normalized", "redirects"):
            for m in data.get(step, []):
                for orig, cur in back.items():
                    if cur == m["from"]:
                        back[orig] = m["to"]
        thumbs = {p["title"]: p["thumbnail"]["source"] for p in data.get("pages", {}).values() if "thumbnail" in p}
        for orig, final in back.items():
            if final in thumbs:
                found[orig] = thumbs[final]
    return found


def direct_link(url):
    """Google Drive share links -> a direct download link."""
    m = re.search(r"drive\.google\.com/(?:file/d/|open\?id=|uc\?(?:.*&)?id=)([\w-]+)", url)
    return f"https://drive.google.com/uc?export=download&id={m.group(1)}" if m else url


EXT_BY_TYPE = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/svg+xml": ".svg"}


def save_image(wid, url, headers):
    body, ctype = fetch(direct_link(url), headers)
    ext = EXT_BY_TYPE.get(ctype)
    if not ext:
        raise ValueError(f"not an image ({ctype or 'unknown type'}); a Drive file must be shared 'anyone with the link'")
    if len(body) > 8_000_000:
        raise ValueError("image is larger than 8 MB")
    for old in IMAGE_EXT:
        (PICS / f"{wid}{old}").unlink(missing_ok=True)
    PICS.mkdir(exist_ok=True)
    (PICS / f"{wid}{ext}").write_bytes(body)


def apply_pictures(requests, words):
    report = []
    wiki = {wid: p["wiki"] for wid, p in requests.items() if p.get("wiki")}
    try:
        thumbs = wiki_thumbs(wiki.values()) if wiki else {}
    except Exception as e:
        thumbs = {}
        report.append(f"Wikipedia lookup failed ({e}), using emoji fallbacks")
    for wid, p in requests.items():
        w = words[wid]
        done = None
        try:
            if p.get("url"):
                save_image(wid, p["url"], BROWSER_UA)
                done = "her link"
            elif p.get("wiki") in thumbs:
                save_image(wid, thumbs[p["wiki"]], UA)
                done = f"Wikipedia photo ({p['wiki']})"
        except Exception as e:
            report.append(f"{w['greek']}: picture download failed ({e})")
        if p.get("emoji"):
            w["emoji"] = p["emoji"]  # fallback if no photo, backup otherwise
        if not done:
            done = "kept the old picture" if picture_file(wid) else (f"emoji {p['emoji']}" if p.get("emoji") else None)
        save_word(w)
        report.append(f"{w['greek']}: {done or 'NO PICTURE, add an emoji'}")
    return report


# ---------- batch ----------
def ref_entry(words, ref, new_stubs):
    wid = resolve_id(words, ref["greek"])
    if wid not in words:
        stub = {"id": wid, "greek": LEADING_ARTICLE.sub("", ref["greek"].strip()), "article": ref.get("article", ""),
                "german": ref.get("german", ""), "full": False}
        words[wid] = stub
        new_stubs.append(stub)
    out = {"id": wid}
    if ref.get("note"):
        out["note"] = ref["note"]
    return out


def add_input(w, raw):
    if raw and input_key(raw) not in {input_key(x) for x in w.get("sheet_inputs", [])}:
        w.setdefault("sheet_inputs", []).append(raw.strip())


def apply_batch(path):
    batch = json.loads(Path(path).read_text(encoding="utf-8"))
    words = load()
    today = dt.date.today().isoformat()
    pictures, new_stubs, report = {}, [], []

    for e in batch.get("words", []):
        greek = LEADING_ARTICLE.sub("", e["greek"].strip())
        wid = resolve_id(words, greek)
        old = words.get(wid, {})
        w = {"id": wid, "greek": greek, "article": e.get("article", ""), "full": True,
             "pos": e.get("pos"), "german": e["german"]}
        if e.get("gender_note"):
            w["gender_note"] = e["gender_note"]
        words[wid] = w  # register before refs so a ref back to this word resolves here
        w["parts"] = [ref_entry(words, r, new_stubs) for r in e.get("parts", [])]
        w["synonyms"] = [ref_entry(words, r, new_stubs) for r in e.get("synonyms", [])]
        w["sentences"] = e.get("sentences", [])
        if e.get("memory_tip"):
            w["memory_tip"] = e["memory_tip"]
        w["source"] = "sie" if "sie" in (e.get("source"), old.get("source")) else "verwandt"
        w["added"] = old.get("added") or today
        for k in ("sheet_inputs", "emoji"):
            if old.get(k):
                w[k] = old[k]
        add_input(w, e.get("sheet_input"))
        save_word(w)
        if e.get("picture"):
            pictures[wid] = e["picture"]
        report.append(f"{'updated' if old.get('full') else 'new'} board: {greek} ({wid}, {w['source']})")

    for u in batch.get("updates", []):
        wid = by_key(words).get(key(u["greek"]))
        if not wid:
            report.append(f"update skipped, not in book: {u['greek']}")
            continue
        w = words[wid]
        if u.get("source") == "sie":
            w["source"] = "sie"
            if w.get("full"):
                w.setdefault("added", today)
        add_input(w, u.get("sheet_input"))
        save_word(w)
        if u.get("picture"):
            pictures[wid] = u["picture"]
        report.append(f"updated: {w['greek']}")

    new_stubs = [s for s in new_stubs if words[s["id"]] is s]  # drop stubs a full board in this batch replaced
    for s in new_stubs:
        save_word(s)
    if new_stubs:
        report.append("stubs: " + ", ".join(s["greek"] for s in new_stubs))

    marks = load_marks()
    for m in batch.get("marks", []):
        marks[m["input"].strip()] = m["status"]
    if batch.get("marks"):
        MARKS.write_text(json.dumps(marks, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    report += apply_pictures(pictures, words)
    LAST_BATCH.write_text(Path(path).read_text(encoding="utf-8"), encoding="utf-8")
    print("\n".join(report))
    ok = build(load())
    if ok:
        Path(path).unlink(missing_ok=True)
    return ok


def main(argv):
    cmd = argv[1] if len(argv) > 1 else ""
    if cmd == "inbox":
        inbox()
    elif cmd == "exists":
        exists(argv[2:])
    elif cmd == "apply" and len(argv) == 3:
        sys.exit(0 if apply_batch(argv[2]) else 1)
    elif cmd == "build":
        sys.exit(0 if build(load()) else 1)
    elif cmd == "check":
        errors = check(load())
        print("\n".join(errors) if errors else "All words OK.")
    elif cmd == "stats":
        stats(load())
    else:
        print(__doc__)


if __name__ == "__main__":
    main(sys.argv)
