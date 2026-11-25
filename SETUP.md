# One-time setup (about 20 minutes)

You do this once. Afterwards your friend only uses two links, and you run `/add-greek-words` once a week.

## 1. Put the site on GitHub Pages

1. On github.com, create a new **public** repository called `griechisch` (no README). Pages is free for public repos; the repo only holds words and pictures.
2. In this folder, run:

   ```bash
   git init -b main
   ```

   ```bash
   git add -A
   ```

   ```bash
   git commit -m "Griechisches Wörterbuch"
   ```

   ```bash
   git remote add origin https://github.com/<your-username>/griechisch.git
   ```

   ```bash
   git push -u origin main
   ```

3. On GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save**.
4. After about a minute the site is live at `https://<your-username>.github.io/griechisch/`.

## 2. Make her Google Sheet

1. Upload `Griechisch-Vorlage.xlsx` to Google Drive, open it, then **File → Save as Google Sheets**. Delete the uploaded .xlsx afterwards so she only sees the Google one.
2. In the tab **Wörter**, click cell **D2** and paste this formula. Use your GitHub username, and leave the rest of the address as it is:

   ```
   =ARRAYFORMULA(IF(A2:A="","",IFERROR(VLOOKUP(TRIM(A2:A),IMPORTDATA("https://<your-username>.github.io/griechisch/status.csv"),2,FALSE),"In Vorbereitung")))
   ```

   If Google asks to allow access to external data, click **Allow**. Column D then shows "Fertig" for built words and "In Vorbereitung" for the rest. It refreshes within about an hour of each push.
3. **File → Share → Publish to web**: choose the tab **Wörter** and the format **Comma-separated values (.csv)**, then click **Publish**. Copy the link.
4. Open `config.js` and fill in:
   - `sheet_csv_url`: the link from step 3
   - `sheet_edit_url`: the sheet's normal address from the browser bar (the "+ Neues Wort eintragen" button opens it)
5. **Share** the sheet with her as **Editor**.
6. Push the config change:

   ```bash
   git commit -am "Sheet verbunden"
   ```

   ```bash
   git push
   ```

## 3. Send her the two links

Message you can paste (German):

> Hallo! Hier ist dein griechisches Wörterbuch: https://<your-username>.github.io/griechisch/ (am besten als Lesezeichen speichern).
> Neue Wörter trägst du hier ein: <link to the sheet>. Einfach das griechische Wort in Spalte A schreiben, mehr nicht. Bild-Link und Hinweis sind optional.
> Neue Wörter erscheinen sofort als „In Vorbereitung“, und einmal pro Woche werden daraus fertige Wortkarten mit Bild, Sätzen und Synonymen. Viel Spaß!

## 4. Every week

Open Claude Code in this folder and type `/add-greek-words`. It reads her sheet, builds the boards and pushes. The site updates about a minute later.

## Good to know

- Her flashcard progress is saved in her browser. On a new laptop or another browser she starts the flashcards from zero; the words themselves are always there.
- The example word καλημέρα (row 2 of the template) is already built, so the site isn't empty on day one.
- To preview the site locally: `python -m http.server 8765` in this folder, then open http://localhost:8765.
