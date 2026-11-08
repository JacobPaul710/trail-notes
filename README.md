# Trail Notes (Project 3), version 0.2

Offline field notes for trail mapping. Replaces Google Keep.

## Try it on your Mac
1. In this folder: `npm start`
2. Open http://localhost:8090 in Chrome or Safari.
3. Tip: in Chrome, View > Developer > Developer Tools, then the phone icon, to see it at iPhone size.

## Put it on your iPhone (needs an https link)
The microphone and offline mode only work from an https address.
1. Go to https://app.netlify.com/drop (free; make an account so the link doesn't expire).
2. Drag this whole folder onto the page. It gives you an https link.
3. Open that link in Safari on the iPhone, tap Share, then Add to Home Screen.
4. Open it from the Home Screen once with signal. After that it works with no signal.

## Speech-to-text
- Runs on the phone (Whisper, "base.en"). The model downloads once (about 80 MB) with signal:
  from the side menu (Speech model > Download now), or automatically the first time you record.
- After that it works with no signal. Processing can take a few minutes for a long recording; Cancel any time.

## Bringing in trails
- **Paste** (works offline): copy the rows in Google Sheets, then tap "Paste from clipboard".
  If the phone blocks that button, the box opens: long-press it and tap Paste.
- **Read the sheet** (needs signal): paste the sheet's link. The area remembers it, so later
  "Check the sheet for new trails" on the area screen adds new rows with one tap.
- Either way you see a preview first; nothing is saved until you tap Create area (or Add).
- The sheet must be shared as "Anyone with the link can view" (Share > General access).
- The app looks for a header row with a number column (#) and a name column; a Date column is optional.

## Show marker
- On each trail card. Hold the phone sideways to the GoPro at the trailhead, take the photo, tap to close.
- Images in `img/` come from `markers/make_screen_assets.py`, so the on-screen marker matches the printed pages.

## Tests
`npm test`

## What's in here
- `index.html`, `styles.css`, `topo-mask.css`: the screens and themes
- `js/parse.js`: reads a pasted trail list
- `js/criteria.js`: the criteria (draft) and the engine that finds answers in what you said
- `js/db.js`: saving on the phone
- `js/stt.js`, `js/stt-worker.js`: speech-to-text on the phone
- `js/app.js`: everything on screen
- `sw.js`, `manifest.webmanifest`, `icons/`: offline and Home Screen install
- `serve.js`: the little server for trying it on your Mac
- `PLAN.md`: every decision so far
