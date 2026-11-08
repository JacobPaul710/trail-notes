# Project 3: In-field data app (replaces Google Keep)

Everything agreed so far. Don't drop any of it.

## What it is
- An app installed to the Home Screen from a shared link (iPhone, iPad; Android works too). No App Store.
- Works completely offline after the first open. Data lives on the device until synced.
- Same look as Trail Engine (themes, topo background) so the two apps feel like a set.
- Shared with the team by link. Free hosting, picked when we're ready.

## Step 1: the fork
- **Paste the trail list** (works offline): copy the rows from the Google Sheet and paste. The app reads number, name and date if present.
- **Import from the sheet** (needs signal + Google sign-in).
- Either way: one card per trail, numbered and named, in list order.

## Update (Nov 7): one mic per card, checklist on top
- Inside each card: the list of criteria at the top with status lights (memory aid while driving).
- One big mic: talk through the whole trail, like Keep. Tap again to stop.
- Then a processing spinner while the app turns speech into text (on the phone, offline, once the model is
  downloaded) and finds the answers. It may take a few minutes; that's OK. Cancel lets you add more and run it again.
- Lights: green = answered (bubble picked), yellow = mentioned but unclear (tap to pick), grey = not mentioned.
- Talk again to fill in what's missing; it adds to what you already said. Your words are saved for review.
- The speech model downloads once, the first time the app is opened on Wi-Fi.
- Sync = upload to Google Drive for Trail Engine (Project 2) to import. Project 2 only imports synced data.

## Answering the criteria: the big mic (first idea, replaced by the update above)
- Tap a question, then tap the big mic button and talk. The recording is saved on the phone.
- The question turns green right away (recorded, waiting to sync), even though nothing has been transcribed yet.
- Bubbles are there too: tap one instead of talking if it's quicker.
- Guided one-question-per-screen flow: big mic, bubbles, Next and Skip, progress dots, jump back to any question.
- Keyboard dictation (the keyboard's mic key) still works in any text box.

## Sync (home screen button + status)
- Back in signal, tap **Sync**:
  1. The app transcribes every recording on the phone with a speech model it downloaded once (Whisper). No cloud service.
  2. It picks the matching bubble from what you said, and saves the text next to the answer.
  3. It uploads everything to Google Drive, where Project 2 imports it.
- Project 2 can only import what has been synced.
- Status on the home screen: "All synced, last at 4:12 PM" or "38 answers waiting to sync", plus offline/online.
- Test the on-phone model early on a real iPhone and iPad (speed, battery, accuracy with engine noise).

## Colors
- Grey: not answered yet.
- Green with a small cloud mark: recorded, waiting to sync.
- Solid green: synced, bubble picked.
- Yellow: synced, but the app couldn't confidently pick a bubble. Tap to choose.
- Each card shows a progress ring ("9 of 12") and turns green when everything is answered.

## Review
- Every answer keeps the recording, the text and the bubble picked.
- Tap to play it back, re-record it, or pick a different bubble.

## The trail card
- Header: `#12 Rubicon` (number matches the sheet).
- Criteria (the guided questions above).
- **Trail summary**: built from a template we write together once the criteria are answered. Editable; rebuilds when answers change.
- **POIs**: a "+" button. Type bubbles (viewpoint, water crossing, obstacle, camp, gate, ...; use onX's list if there is one), a spoken note, and an optional "use my location" (GPS works offline).
- **Area description**: free text. How to make this less tedious: decide later.

## Draft criteria (from the Google Keep notes; to be confirmed)
- Trail type: out-and-back / point-to-point / loop
- Surface: dirt / gravel / paved / rocky
- Width: single track / double track / shelf road
- Grade: a % and whether it climbs or descends
- Difficulty level: 1 / 2 / 3
- Brush rub / foliage drag: none / minimal / heavy
- Exposure: none / minimal / high
- Forest: green / diverse / burn scar / regrowth
- Obstacles: down trees, rocks, creek crossings
- How it ends: dispersed campsite / turnaround / gate or property / campground / connects to another road
- Where it starts: from pavement / highway / a fork

## Still needed from Jacob
- The final criteria list (questions, and for each: set choices or spoken answer).
- One or two real finished trail summaries, to build the template.
- onX's POI types, if there's a set list.

## Built in v0.1 (Nov 7)
- Paste the list (Area + rows from the sheet) -> numbered cards in list order. Import from the sheet: button shown, comes later.
- Home: cards with progress rings, online/offline, sync bar (sync itself comes later).
- Card: 12-criteria checklist with lights; tap one to set it by hand or resolve a yellow one.
- Big mic records and saves on the phone (speech-to-text model comes next).
- "Find the answers": reads text (typed, or dictated with the keyboard mic) and lights up criteria, with a processing spinner and Cancel.
- POIs: + with type bubbles, a note, and Use my location (GPS).
- Area description (autosaves).
- Side menu (swipe from the left edge or the menu button): themes Forest Green, Black & White, Desert Dusk; change trail list.
- Works offline once opened; installs to the Home Screen.

## Built in v0.2 (Nov 7)
- Areas are the top level (like folders): Home lists areas; each area has its own trail list and cards.
  Later, Trail Engine uses the area to pick the Drive folder.
- + New area (name it, then paste or import). Inside an area: + Add trails merges new numbers in;
  trails already there keep their notes (and pick up a newly filled-in date).
- Import from the sheet: paste the link; reads the sheet if it's shared "Anyone with the link can view". No sign-in.
- Speech-to-text on the phone: after you stop recording, it turns the recording into text and lights up the answers.
  Progress, a timer, and Cancel (recording stays saved; "Turn into text" to retry). Transcript shown under the recording.
- Speech model status and "Download now" in the side menu.
- Data saved by v0.1 moves into an area called by its old name (or "My trails").
- Updates install themselves: the app reloads once when a new version is ready (never mid-recording).

## Built in v0.3 (Nov 7)
- Import stays a pasted link (no Google sign-in). Each area saves its link; "Check the sheet for new trails"
  on the area screen re-reads it and adds new trails (and fills in dates) without touching notes.
- "Paste from clipboard" button (offline). Falls back to the paste box if the phone blocks it.
- Labels: Paste = "Works offline" (green); Read the sheet = "Needs signal" (amber). With no signal the
  sheet option dims and its button says "No signal right now".
- Both fill a preview (count, number range, first 6 trails, where it came from, new vs already here).
  One button at the bottom: Create area, or Add N trails.
- Reading a Trail Tracker sheet fills in the area name from the sheet's Area box.

## Built in v0.4 (Nov 7)
- **Show marker** on each trail card: the marker fills the screen (turned sideways on a portrait phone),
  identical to the printed pages (light topo lines, big number, orange square) plus the area and trail name
  in small grey print. Tap to close. Keeps the screen awake; works offline. The card notes when it was shown.
- **Trail summary** from Jacob's draft template (to refine):
  "<Name> forks/spurs/travels <direction> from <road> through <environment>. It runs as a <surface> <width>
  trail and crosses <terrain> at a <grade> grade variation." / point-to-point or out-and-back sentence (with
  how it ends) / "This trail provides access to <X> hiking trail and <Y> developed campground." (from POIs) /
  foliage contact / obstacles / "This trail is a level 1 rating and is suitable for all vehicles."
  Missing pieces are highlighted. Copy button. "Starts from (road or trail name)" box, guessed from speech.
- New criteria: Direction, Crosses (hillsides, gulches, creeks, forest, meadows, ridgelines); Surface: Mixed;
  How it ends: end of official development, downed tree, overgrowth. Checklist now in summary order (14).
- New POI types: Hiking trail, Campground (the note is the name).
- Still to confirm with Jacob: level 2 and 3 wording, the loop sentence, wording when there's no foliage contact,
  forks vs spurs vs travels rule (now: fork = forks, pavement/highway = spurs, else travels).

## Built in v0.5 (Nov 7)
- One Trail Template sheet, one tab per area (Areas tab lists them; adding a name there makes the tab, via
  the sheet's script). Link the sheet once in Trail Notes; New area shows the areas to pick from.
  Picking one reads that tab; the area is named after the tab. Check the sheet / Add trails read that tab.
- No Copy button on the summary (Trail Engine will submit it later).

## Built in v0.6 (Nov 7)
- Home: link the trail sheet once; Home lists the sheet's areas ("+ Mt. Hood"); one tap adds an area with all
  its trails. Pasting a list is now the no-signal backup ("Paste a trail list").
- Delete an area (trash icon on the area screen) or a trail (bottom of its card), each with a confirm pop-up.
  Only this phone's copy is deleted; the Google Sheet isn't touched.
- Upright marker: the number big across the top, a bigger orange square centered below (Trail Engine reads both
  layouts). Hold the phone close: filling 100-160% of the GoPro frame height, 197 of 200 read in the photo test;
  at 62-100%, 165 of 200. 0 wrong either way (misses are flagged).
- Summary: level 2 and 3 are earned by the obstacles ("Ruts and whoops earn this trail a level 2 rating.").
  New obstacles: Ruts, Whoops (full list coming from Jacob).

## Built in v0.7 (Nov 7)
- Home: "Locations" heading; tapping an area on your sheet adds it and stays on Home (tap in when you want).
  "On your sheet" sits above the sync bar (now last), with a linked light (green = read fine, red = can't be
  read, with why), "Last checked" time, and Refresh (also checks automatically on open and when signal returns).
  "Use a different sheet" is in the side menu. Paste is labeled "(offline option)".
- Jacob's lists: Surface (dirt, grass, gravel, mud, paved, rock, sand, slick-rock, mixed); Width (single or double
  track); Obstacles (19, incl. "no significant obstacles", which only goes with level 1); Landscape (hillsides,
  ridges, canyons, gulches) for the "crosses..." sentence; POI types on + (creek crossing, lake or river,
  viewpoint, campsite, hiking trail, developed campground, lookout tower, historic landmark, parking/staging area,
  restroom/pit toilet, waterfall, swimming hole, hot spring, water source, road closure barrier, other).
- Summary uses every POI: "Along the way it crosses Pine Creek and passes Loon Lake, a viewpoint, and a waterfall.",
  "This trail provides access to Ellis Peak hiking trail, a developed campground, and a restroom.",
  "Boulders or logs across the road mark a closure." The POI's note is its name.
- v0.7.1: Home only offers sheet areas that have trails ("+ Gifford · 12 trails"); empty tabs wait until trails
  are added. Nothing to add: "All locations synced · checked 11:09 PM". Fixed: the app now checks the sheet
  each time it opens (in v0.6-0.7 it only checked on Refresh, linking, or signal coming back).

## Build order
1. Screen designs (approve first).
2. Paste/import the list and build the cards.
3. Guided questions with the big mic (record offline).
4. Sync: on-phone transcription, bubble picking, upload to Drive.
5. Summary template.
6. POIs and area description.
7. Offline install and test on iPhone and iPad.
8. Project 2 imports from Drive.
- v0.8.0: New criteria (13): starts = Paved/Unpaved + road name; direction second; forest Green/Fire-scarred/Mosaic; grade slider 5-40%; elevation change (gains/loses/flat/both); multi-select surface, landscape (+creeks), obstacles reordered, how it ends (connects to another path asks for its name); exposure removed; level 1-10. Area description sits under the starts-from box. Summary verb: names ending in a letter (96N98A) "spurs"; others rotate forks/travels/runs/branches off/wanders.
- v0.9.0: Speech engine loads its library with fallbacks and shows the real error. "Where it starts" question removed (road name + Paved/Unpaved tap under Show marker). Area description is set once per area (bottom of the trail list) and read into "through the ___"; per-trail "Custom area description". POIs sit above the summary, multi-select, no location. "No POIs" box. Completed (warns if anything is missing), Abandon trail (fallen tree / private gate / overgrown too early), Reopen. Trail list: green = completed, yellow = abandoned with reason; a pending recording keeps a trail from counting complete. Sticky progress bar under the header; Home shows a % circle per area. Home no longer shows the recordings reminder.
- v0.10.0: Google Drive sync. Sign in once with Google (redirect flow, works in a home-screen app); each trail you touch is saved as "<Area> - 0002.json" in a "Trail Notes" folder in your Drive (answers, summary, POIs, status, abandon reason). Home sync bar shows "N trails waiting to sync" / "All synced · time". Syncs by itself when you're online and the sign-in is still fresh; otherwise tap Sync (Google remembers you, so it's one quick bounce). Menu: Google Drive section with Sign out. Also in this build, inert until get-model.js is run: speech model bundled with the app (held for a later update).
- v0.10.1: "Paste a trail list (offline option)" moved under the sheet link panel. How it ends: paved/unpaved question when "Connects to another path" is picked ("...terminates at the paved 10N50 junction"). "Note for the data curating team" (ticked: a box; the note ends the summary as *note, bold blue; also sent to Drive as curatorNote). Sign-in request trimmed (dropped include_granted_scopes) after a Google 400; menu shows the sign-in address in use.
- v0.10.2: Sync bar shows a status light (green = synced, amber = waiting, red = problem, grey = not signed in) and the Google account you signed in with; "Signed in · nothing to sync yet" when there was nothing to send; "Try again" after a problem.
- v0.11.0: Area description has a Save button ("Saved" once stored; saves on leaving the area too). The progress bar lives on the area page only (it was wrongly on Home); removed from Home and the trail page. "Home" button on the area page and "Trails" button on the trail page. Sync result is a pop-up that stays until OK (with "Open in Drive"); "View in Drive" link in the sync bar. Menu: Switch Google account.
- v0.11.1: Topo loader (contour rings with a trail dot circling): shown in the sync bar while syncing, in the "turning your words into text" pop-up, and in front of any button that says Checking…/Reading…/Downloading….
