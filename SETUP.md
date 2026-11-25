# How it is set up

- **Website:** https://manjafirehorse.github.io/griechisch/ (GitHub Pages, from the `main` branch of ManjaFirehorse/griechisch).
- **Adding words:** the "+ Neues Wort eintragen" button on the start page opens a form on GitHub:
  https://github.com/ManjaFirehorse/griechisch/issues/new?template=neues-wort.yml
  She must be signed in to GitHub (the ManjaFirehorse account) to send it.
- **Every week:** open Claude Code in this folder and type `/add-greek-words`. It reads her open form entries, builds the boards, closes each entry with a short German note, and pushes. The site updates about a minute later.

## Message for her (German, ready to paste)

> Hallo! Hier ist dein griechisches Wörterbuch: https://manjafirehorse.github.io/griechisch/ (am besten als Lesezeichen speichern).
> Neue Wörter trägst du über den Knopf „+ Neues Wort eintragen“ auf der Startseite ein: Wort schreiben, optional einen Hinweis oder ein Foto dazu, dann auf „Create“ klicken. Dafür musst du bei GitHub angemeldet sein.
> Neue Wörter erscheinen sofort als „In Vorbereitung“, und einmal pro Woche werden daraus fertige Wortkarten mit Bild, Sätzen und Synonymen. Viel Spaß!

## Good to know

- Her flashcard progress is saved in her browser. On a new laptop or another browser she starts the flashcards from zero; the words themselves are always there.
- To preview the site locally: `python -m http.server 8765` in this folder, then open http://localhost:8765.

## If git asks to sign in

Git's sign-in window shows up blank on this laptop. Instead, run this in a terminal in this folder:

```powershell
$env:GCM_GUI_PROMPT = 'false'; git -c credential.gitHubAuthModes=device push
```

It prints a code. Open https://github.com/login/device, sign in as ManjaFirehorse, enter the code and click Authorize.
