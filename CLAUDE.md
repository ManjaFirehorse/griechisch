# Greek word book

A website for a friend (German native speaker, A1/A2 Modern Greek, not technical, no Claude). She adds words to a Google Sheet; once a week the user runs `/add-greek-words` and the new boards go live on GitHub Pages. Built after the user's German word book (`Documents\German Vocabulary`), with the same Model 1 board idea.

## Layout

- `index.html`, `style.css`, `app.js`: the website (no build step). Pages: Start, Wortkarte (`#/wort/<id>`), Karteikarten, Wörter. All UI text is German.
- `config.js`: site title, her sheet's published CSV link and edit link. JSON inside, the Python tool reads it too.
- `words/<id>.json`: one file per word. `full: true` is a board, `full: false` a stub (only shown on other boards). Ids come from the Greek automatically.
- `pictures/<id>.(jpg|png|webp|gif|svg)`: one picture per word; without one the board shows its `emoji`.
- `words.js`, `status.csv`: **generated**, never edit. `python tools/greek.py build` after changing words or pictures.
- `status.csv`: read by the IMPORTDATA formula in column D of her sheet ("Fertig" / "Rechtschreibung prüfen").
- `tools/greek.py`: inbox, exists, apply, build, check, stats (see its docstring). `tools/sheet-marks.json` keeps rows marked "Rechtschreibung prüfen".
- `Griechisch-Vorlage.xlsx`: the sheet template (tabs "Wörter" and "Anleitung"). `SETUP.md`: one-time GitHub + Sheet setup.
- Her progress (flashcard boxes, due dates) lives in her browser's localStorage only.

## Adding words

Use the `/add-greek-words` skill. It holds the full rules.

## Rules from the user

- Greek and German only, no English on the site. Explanations in German.
- ο / η / το colours: blue / red / green (same as der / die / das in the German tool).
- Every board: 3 synonyms, 3 A1/A2 sentences, a word-specific picture (Wikipedia photo, her link, or emoji). No hand-drawn SVGs.
- Related boards one level deep, like the German tool.
- Keep the friend's side simple: she only ever touches the Google Sheet and the website link.
