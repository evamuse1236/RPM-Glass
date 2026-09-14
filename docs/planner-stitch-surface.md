# Stitch planning replacement

Mode: Operate. Android's offline WebView, existing private planner store and native bridge.

## Direction contract

THESIS: Bring Dara's four finished Stitch screens into the working planner. The visual authority is projects/17499041167931044549, with the four visible screens recorded in references/stitch-planner/sources.json.

OWN-WORLD: Midnight violet canvas, translucent optical glass, Jakarta type, cyan active controls, purple secondary accents and amber musts. Persisting components use the earliest source in Daily → RPM → Projects → Life: Daily owns navigation, Add, Search and shared surface treatment; RPM owns action rows and compact task sheets.

STORY: Read the day, complete or prioritize actions, expand projects into RPM blocks, and explore life areas and goal horizons. Existing data supplies all names, schedules and progress. Life ratings are optional user input, never generated scores.

FIRST VIEWPORT: Daily begins with a sticky seven-day strip over the hourly timeline. A five-icon glass navigation pill floats at the bottom, with Search and cyan Add above at the right. RPM begins with project filters and result/purpose/action cards. Projects shows an overview and expandable project cards; Life shows horizon tabs, a rating wheel and collapsible life areas.

FORM: User-pinned Stitch source HTML and renders. No new concept selection is needed. Preserve source composition and interactions while keeping 48dp actions, keyboard-safe editors, native Back, persistent drafts, calendar checks, Undo, capture context and data durability.

FINISH: The bounded visual review and device checks are recorded in `.impeccable/review/stitch/finish-review.md`. Planning's token-bearing contract and sidecar live in `docs/planner-stitch/DESIGN.md` and `docs/planner-stitch/.impeccable/design.json`; the existing root browser/capture contracts are preserved. No new raster ships in the planner.

Source screenshots are development references. Projects' exported screenshot has hidden entrance-animation content; its HTML is authoritative after motion settles. Shipping UI is local HTML/CSS/JS with bundled fonts and SVG icons, without remote scripts or sample personal data.

## Implementation and handoff

`planner-stitch.css` replaces the packaged planning stylesheet. The original source `planner.css` remains available, but is neither packaged nor loaded. Shared controls have one renderer rather than four screen-specific copies. Existing native storage, calendar checks, recurrence, capture, draft recovery and Undo remain connected.

Optional, backwards-compatible planner fields support the source's Life interactions: `areas[].rating`, `goals[].horizon`/`period`, and `context.coreValues`. Old goals remain yearly; old sparse updates preserve the new fields. Ratings accept 0–10, monthly periods 1–12, and quarterly periods 1–4. Validation runs before committing a copy of the store.

The downloadable update is `releases/rpm-0.10-stitch.apk`, package `com.rpm.prototype`, version code 10. It is debug-signed with the same certificate as `rpm-0.9-unified.apk`, allowing an in-place update. APK SHA-256: `a1cb97c21d8db968e162fbd1fde1f9fdf8a3adfb88653a89d3c39c86cda8926f`.

Verification: 89 Node tests pass, 20 emulator UI assertions pass, Android assemble and lint pass. Touch completion, must swipes and drag reordering were exercised; portrait, landscape, a 360px viewport at 200% text, and an actual keyboard-open form were inspected. Final large-text weekday corrections were rebuilt and recaptured. The APK contains local fonts, SVG icons and no QA fixture or downloaded Stitch mock page. Physical-phone testing, TalkBack and live account-dependent AI/calendar integration were not repeated for this visual replacement.

Development-only fixtures and checks are in `testing/planner/stitch-fixture.js` and `testing/planner/stitch-flow.js`. Use only against a backed-up owned emulator. Its original private data and localStorage must be restored after running them; no production sample data is seeded.
