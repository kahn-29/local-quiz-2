# Kahn Quiz Local — React Vite Standalone

A local-first quiz creator/player converted from the original static HTML files into a real React + Vite frontend.

## What this version supports

- No backend, no database, no account.
- Quiz library saved in `localStorage`.
- Draft auto-save while editing.
- Import legacy JSON quiz files from the old HTML version.
- Export/download quiz JSON files locally.
- Embedded local images via Data URL, so a downloaded JSON can carry the images with it.
- Single-choice, multiple-choice, and text-input questions.
- Optional shuffle questions/answers.
- Optional instant check and re-select after checking.
- Optional timer.
- Result download as JSON.
- KaTeX rendering for `$...$`, `$$...$$`, `\(...\)`, and `\[...\]`.
- Service worker app-shell caching for offline reuse after the first load.

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

The built app is in `dist/`.

## Important local-first notes

- `localStorage` has browser quota limits. Large images can exceed it. If saving fails, use **Download JSON** as the reliable local backup.
- The app does not upload files anywhere. Import/export happen in the browser.
- To fully reset data, clear the browser localStorage for this site.
