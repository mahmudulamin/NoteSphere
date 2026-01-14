# NoteSphere (Vanilla JS)

A clean, responsive notes site (NoteSphere) that loads subjects/notes from a local JSON file.

## Folder structure

- `index.html` – Home (subject cards + global search)
- `subject.html` – Subject view (notes + per-subject search)
- `assets/css/styles.css` – Styling + light/dark theme
- `assets/js/app.js` – Home page logic
- `assets/js/subject.js` – Subject page logic
- `data/notes.json` – Notes data (add subjects/notes here)

## Run locally (recommended)

Because modern browsers often block `fetch()` when opening files via `file://`, use a local server.

## Run with the built-in backend (recommended for saving to disk)

This project includes a minimal Node.js server that:

- Serves the website
- Saves **subjects + notes you add/edit/delete from the UI** into [data/notes.json](data/notes.json)

Run:

```bash
npm start
```

or:

```bash
node server.js
```

Then open:

- http://localhost:5500/

If port `5500` is already in use (common if VS Code Live Server is running), use a different port:

```bash
set PORT=5510 && node server.js
```

When the backend is running, the frontend will automatically use `/api/*` endpoints instead of `localStorage`.

## Run locally (no server) — easiest fallback

This project also ships a fallback data file so you can open it without any terminal commands.

1. Open [index.html](index.html) by double-clicking it.
2. The app will use [data/notes-data.js](data/notes-data.js) instead of fetching JSON.

### Option A: Python (easy)

1. Open a terminal in this folder.
2. Run:

```bash
python -m http.server 5500
```

3. Open:

- http://localhost:5500/

### Option B: Node (if you have Node.js)

```bash
npx serve .
```

## Add a new subject

Edit `data/notes.json`:

- Add a new entry under `subjects` with a unique key (your slug).
- Set `slug`, `title`, and a `notes` array.

The home page automatically lists it.

## Add notes from the website (no coding)

You can add notes directly from the subject page:

1. Open a subject.
2. Use the **Add a note** form.
3. Click **Save Note**.

These notes are saved in your browser using `localStorage` (so they stay after refresh).

Limitations of a static site:

- The browser cannot automatically write into `data/notes.json` on your disk.
- If you want a backup, use **Download Notes** and save the exported JSON.

## Add / delete subjects from the website (no coding)

On the home page:

- **Add subject**: type a subject name in the “Add subject” box and click **Add**.
- **Delete subject**: click the **✕** button on a subject card.

These changes are saved in your browser using `localStorage` (device + browser). They do not edit `data/notes.json` automatically.

## Notes format (blocks)

Each note is an object:

- `id`: unique string (used for deep links)
- `title`: note title
- `blocks`: array of blocks, e.g.

- `{ "type": "heading", "text": "..." }`
- `{ "type": "paragraph", "text": "..." }`
- `{ "type": "list", "ordered": false, "items": ["...", "..."] }`
- `{ "type": "code", "language": "cpp", "code": "..." }`

No frameworks, no build steps.
