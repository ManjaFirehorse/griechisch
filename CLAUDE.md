# Greek word book

A website for a friend (German native speaker, A1/A2 Modern Greek, not technical, no Claude). She adds words with a "Neues Wort" form on GitHub; once a week the user runs `/add-greek-words` and the new boards go live on GitHub Pages. Built after the user's German word book (`Documents\German Vocabulary`), with the same Model 1 board idea.

Live at https://manjafirehorse.github.io/griechisch/ (repo ManjaFirehorse/griechisch, public; she uses that same GitHub account).

## Layout

- `index.html`, `style.css`, `app.js`: the website (no build step). Pages: Start, Wortkarte (`#/wort/<id>`), Karteikarten, Wörter. All UI text is German.
- `config.js`: site title, `github_repo`, `site_url`. JSON inside, the Python tool reads it too.
- `.github/ISSUE_TEMPLATE/neues-wort.yml`: her form (Griechisches Wort, Hinweis, Bild). Each entry is a GitHub issue; open issues show on the site as "In Vorbereitung", and `apply` closes them with a comment when their boards are built.
- `words/<id>.json`: one file per word. `full: true` is a board, `full: false` a stub (only shown on other boards). Ids come from the Greek automatically.
- `pictures/<id>.(jpg|png|webp|gif|svg)`: one picture per word; without one the board shows its `emoji`.
- `words.js`: **generated**, never edit. `python tools/greek.py build` after changing words or pictures.
- `tools/greek.py`: inbox, exists, apply, build, check, stats (see its docstring). It uses git's stored GitHub sign-in to close issues.
- Her progress (flashcard boxes, due dates) lives in her browser's localStorage only.

## Adding words

Use the `/add-greek-words` skill. It holds the full rules.

## Rules from the user

- Greek and German only, no English on the site. Explanations in German.
- ο / η / το colours: blue / red / green (same as der / die / das in the German tool).
- Every board: 3 synonyms, 3 A1/A2 sentences, a word-specific picture (Wikipedia photo, her photo, or emoji). No hand-drawn SVGs.
- Related boards one level deep, like the German tool.
- No Google Sheet or Drive: the user chose GitHub only. Keep the friend's side simple: the website link and the form.
- Git's sign-in popup shows up blank on this laptop. If a push needs a sign-in, run it in a terminal tab with `$env:GCM_GUI_PROMPT = 'false'` and `-c credential.gitHubAuthModes=device`, and let the user type the code at github.com/login/device.
