# RPM Glass UI code map (each builder updates the rows it touches before its last commit)

Paths are relative to the repo root. Drafted by a scout from grep on 2026-11-07; line numbers drift, names do not.

## Gauntlet harness
- Clock: every server and shot pins Saturday 2026-11-07 11:40 (`GAUNTLET_NOW`, default in both up scripts; `seedStore` reads it). Still on the real clock: `calendar()` and `fakeTurn` in `scripts/gauntlet/serve.mjs`.
- Phone: `.verify/gauntlet/phone-up.sh` rebuilds `app/src/main/assets/companion` and (re)starts `scripts/gauntlet/serve.mjs` on :4173 (fake bridge, seeded week; `POST /__reset`, `GET /__store`). `planner.html` = planner, `index.html` = Capture.
- Website: `.verify/gauntlet/web-up.sh` (re)starts Convex :3210/:3211 + phone stand-in + Site on :5179. No reset there, so web states must not save anything.
- Shots: `node .verify/gauntlet/shots.mjs <outDir> <unit>`. Units: today, nav, blocks, projects, life, task-sheet, sheets, habits, settings, review, capture, website. Phone 384x832 @2x, desktop 1440x900 (website also 1080x800). Each state writes `NN-<state>.png` + `NN-<state>.small.png` (<=800 px). A state's `{clock}` overrides the page time (now-pill uses 21:30); `D` adds a `-desktop` twin on the website.
- All-or-nothing: shots go to `<outDir>.tmp` and are renamed only when every state passes; a failure names the state, leaves the `.tmp`, exits 1.
- No website twin (the Site lacks the surface): projects card-expanded, settings appearance.
- One unit per run: `.verify/gauntlet/current` holds its name; shots land in `.verify/gauntlet/<unit>/current/`, contact sheet in `.verify/gauntlet/contact.png`. `checks.txt` = tests, phone-up, web-up, shots, contact.

Size scale (enforced by `scripts/rules/size-scale.test.mjs`): spacing 0,4,8,12,16,20,24,32,48 + 40,56,72,120; strokes 1,2; sizes ×4; icons 20/24; radii 2,4,8,12,16,20,28,36,full. Type from theme.css ramp only.

## Checks
- Everything: `~/.claude/skills/gauntlet/scripts/round-check.sh .verify/gauntlet`
- Fast JS only: `node --import ./scripts/test-tz.mjs --test android-companion/<name>.test.mjs`

## Do not touch
- Voice agent logic (another thread): `capture-voice*.mjs`, `voice-*.mjs`, `voice-mic-worklet.js`, `web/app/voice-capture.mjs`, `web/app/voice-rows.mjs`, `web/app/live-words.mjs`, and voice/Gemini code paths in `capture-composer.mjs`, `capture-app.mjs`, `runtime.mjs`, `settings-pages.mjs` (Voice and AI keys rows), `web/app/client.mjs`. CSS styling of the Capture panel is allowed.
- Native Java (`app/src/main/java`), notch and widgets: out of scope for this run.
- Data model and save logic (`planner-state.mjs` ops, `retryOnChange`).

## today
- Timeline data: `android-companion/spine-model.mjs` (`buildSpine`; `fitOverlaps` keeps the gutter running forward and stops an item's pill where a later row starts inside it; `planMinutes` (gaps that offer +) is `PLAN_MINUTES` on phone and website alike; `foldDeadlines` puts a deadline at its task's start on the task as "Due · <Result>"). Tests: `spine-model.test.mjs`.
- Timeline view: `android-companion/planner/spine-view.mjs` (`gutter`, `taskCard` clash chip `.spine-resolve` reads "Clash with <event>", `gapBody` words only with the +). Tests: `spine-view.test.mjs`. Styles: `android-companion/day.css` (`.spine-*`); wide overrides in `web/app/web.css` (pinned by `web/app/agenda.test.mjs`).
- Day inputs (tasks with `result`/`resultId`, deadlines, events): `android-companion/planner/today-day.mjs` (`dayTask`, `spineModel`). Band/date/strip: `planner/today-header.mjs`.
- Round button beside the tab bar: `planner/shell.mjs` `dock()`; a tap goes back to Capture with `close_fullscreen` (user 2026-11-01, pinned by `floating-layout.test.mjs`), a hold adds.
- Floating layout mask (what shows around the tab bar, dock and Now pill): `android-companion/planner.css` `#planner` vars `--bar-top/--bar-end/--dock-top/--page-end/--now-clear` and the `#planner-scroll` mask layers; pinned by `floating-layout.test.mjs` ("nothing shows in the strip..."). Glass bar: `:root[data-bar-glass=true]` sets `--bar-fade` (page fades in across the bar's height) and `--bar-ends` (alpha of the two round-end discs), so no words read under the labels. Now pill state: `data-now-off` (`planner/today-day.mjs` `watchNow`), `data-now-aside` (`planner.mjs` scroll listener), `#now-host` built in `planner/shell.mjs` `nowPill`.
- Row alignment: `.spine-row.tall` (set in `spine-view.mjs` `shell` when height > 48) and rows with a Clash chip (`:has(.spine-resolve)`) put ring and time at the title's top; `.spine-meta` is one line with an ellipsis.
- Spec: `docs/design/today.md`.
