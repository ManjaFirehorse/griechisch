---
name: add-greek-words
description: Add the new words from the friend's Google Sheet to the Greek word book. Reads the sheet, builds a word board for each new word (German meaning, breakdown, 3 synonyms, 3 sentences, picture), saves everything in ONE batch, rebuilds the site files and pushes to GitHub. Use when the user says /add-greek-words, "add her words", "update the Greek book", or "add <Greek word>".
---

# Add words to the Greek word book

Run every command from the project root (`Documents\Greek Vocab Building`).

**Keep it cheap: about 5 tool calls.** `inbox`, `exists`, write `tools/batch.json` once, `apply`, then git. Don't read word files or reference files; everything you need is on this page.

## 1. Collect the words

`python tools/greek.py inbox` prints the sheet rows that are not handled yet: `word` (what she typed), `hint` (German, optional), `picture_link` (optional), `in_book`.

If the user named words (`/add-greek-words θάλασσα`), use those instead (no `sheet_input` then).
If the list is empty, say there's nothing new and stop.

## 2. Decide each row

| `in_book` | What to do |
|---|---|
| `no` | Full board, `"source": "sie"`, `"sheet_input"` = her text exactly, plus the related boards (below) |
| `stub only` | Same as `no` (the stub gets replaced) |
| `board, built as a related word` | An update `{"greek", "source": "sie", "sheet_input"}` |
| `board, added by her` | An update `{"greek", "sheet_input"}` (she typed it twice) |
| Not a real Greek word, can't tell what she meant | A mark `{"input": <her text>, "status": "Rechtschreibung prüfen"}` |

She may type in Latin letters (`kalimera`), with typos, with or without an article or accents: work out the real word. Use her `hint` to pick the meaning she wants. A cell with several words (`ψωμί, τυρί`) means separate boards; give each one the same `sheet_input`.

If she gave a `picture_link`, the picture is `{"url": <link>, "emoji": ...}`.

**Dictionary form (Modern Greek, monotonic accents).** Nouns: nominative singular, the article goes in `article` (ο / η / το), not in `greek`. Verbs: 1st person singular present (`φεύγω`). Adjectives: masculine form, with the three forms in `german` ("gut, schön (καλός, καλή, καλό)"). Fixed phrases (`γεια σου`) are `"pos": "Ausdruck"`.

**Related boards (one level deep).** Every part and synonym of a word she added gets its own full board with `"source": "verwandt"`, unless it already has a board. The parts and synonyms of those related boards only become stubs: `apply` makes stubs automatically from refs, so never go deeper.

**Before writing the batch, check in one call:** `python tools/greek.py exists <greek> <greek> ...` with every part and synonym you plan to use. Don't rebuild anything that says `board`.

## 3. Write `tools/batch.json` once

```json
{"words": [
  {"greek": "καλημέρα", "article": "η", "pos": "Ausdruck", "german": "Guten Morgen",
   "gender_note": "Achtung: im Deutschen „der Morgen“.",
   "parts": [{"greek": "καλός", "german": "gut, schön", "note": "hier: καλή"},
             {"greek": "μέρα", "article": "η", "german": "der Tag"}],
   "synonyms": [{"greek": "γεια σου", "german": "Hallo, Tschüss (locker)"},
                {"greek": "χαίρετε", "german": "Guten Tag (höflich)"},
                {"greek": "καλησπέρα", "article": "η", "german": "Guten Abend"}],
   "sentences": [{"el": "**Καλημέρα!** Τι κάνεις;", "de": "**Guten Morgen!** Wie geht's dir?"}, {...}, {...}],
   "memory_tip": {"kind": "gleiche Wurzel", "text": "καλός steckt im **Kaleidoskop** ..."},
   "picture": {"wiki": "Sunrise", "emoji": "🌅"},
   "source": "sie", "sheet_input": "kalimera"}
 ],
 "updates": [{"greek": "σπίτι", "source": "sie", "sheet_input": "spiti"}],
 "marks": [{"input": "xqwz", "status": "Rechtschreibung prüfen"}]}
```

Rules for every full board (`apply` rejects boards that break the counted ones):
- **German only** for meanings, notes and tips. Greek only for the words being learned. She is a German native speaker at A1/A2.
- `pos`: Nomen, Verb, Adjektiv, Adverb, Ausdruck, Pronomen, Präposition, Konjunktion or Zahl. A noun needs its article.
- `parts`: only when the breakdown really helps (compound, clear prefix like ξανα- or suffix like -άκι). Otherwise `[]`. Never force one.
- `synonyms`: **exactly 3**. True synonyms first; if there aren't 3, use close words, and an opposite with `"note": "Gegenteil"`. Each with its `german` (and `article` for nouns).
- `sentences`: **exactly 3**, short (max ~8 words), everyday A1/A2, natural Modern Greek. Bold the word with `**…**` in both the Greek and the German.
- `gender_note`: only when the Greek gender differs from the German word's gender ("Achtung: im Deutschen „das Meer“."). The site shows ο blue, η red, το green, like der/die/das.
- `memory_tip`: optional and **rare**. Only a real "oh!" link: a German or international word with the same Greek root (Kaleidoskop, Hygiene, Thermometer, ephemer), a true false friend, or a genuinely funny sound-alike for a German speaker. `kind`: gleiche Wurzel, klingt wie, falscher Freund or Eselsbrücke. Never invent an etymology, never a plain translation. No tip beats a forced one.
- `picture`: her link if she gave one. Otherwise a concrete thing gets `{"wiki": "<English Wikipedia article>", "emoji": "…"}`; an abstract word gets `{"emoji": "…"}`. Always include an emoji as the fallback. Pick something specific to this word, not a generic one.

## 4. Apply

`python tools/greek.py apply tools/batch.json`. It writes the word files and stubs, downloads pictures, and rebuilds `words.js` and `status.csv`. If it prints errors, fix `tools/batch.json` and run it again (the batch is only deleted after a clean build).

## 5. Publish

`git add -A`, `git commit -m "Neue Wörter: <the Greek words>"`, `git push`. If there is no remote yet, say so and point to SETUP.md.

Then tell the user in a few lines: the boards added (hers vs related), any picture that fell back to an emoji, and any "Rechtschreibung prüfen" rows. The site updates about a minute after the push; her sheet's Status column follows within an hour.
