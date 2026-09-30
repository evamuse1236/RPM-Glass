# Purpose-first RPM verification

This record separates implementation, automated checks, emulator evidence, packaging, restoration, and unverified live-device behavior for version **15 / 0.15-purpose-first**.

## Verified implementation checks

- **JavaScript:** 313/313 tests passed. The final suite includes rejection of retired transparency requests, lossless migration behavior, proposal safety, atomic planner operations, Undo, Area identity, ordering, and current planner/Capture interactions.
- **Planner token and contrast check:** semantic surface rules passed. Text contrast on Surface 1 measured 15.00:1 primary and 7.91:1 secondary in dark mode, and 15.55:1 primary and 6.88:1 secondary in light mode.
- **Android companion checks:** 63/63 offline native companion checks passed after the transparency path was retired.
- **Existing native/offline checks:** 38 on-device persistence, revision, export, parser, widget, and reminder checks passed.
- **Parser/correction checks:** 23 passed.
- **Android packaging:** debug build, lint, and test-APK assembly passed. Bundled `planner-tokens.css`, planner/Capture HTML, CSS, and runtime assets byte-match the generated source assets.

## Emulator interaction and layout evidence

An owned Android emulator produced **58 passing UI assertions**:

- 39 main planner assertions covering completion and Undo, drag ordering without schedule changes, inline and Quick add, Task context and footer behavior, main-screen horizontal overflow and last-row clearance, removal of the solid-navigation workaround, and half-step Area rating with Undo;
- 6 focused detail assertions covering the unsaved-draft prompt and Keep/Discard paths, component-gallery states, removal of a stacked-sheet scrim, and landscape overflow. The four named detail screens were assessed through visual captures rather than counted as six interactive detail journeys;
- 8 Capture assertions covering horizontal overflow and the Open planner menu route across four theme/font-scale combinations. A resumed native Planner activity was verified separately;
- 5 Timeline edge assertions using overlapping 15- and 30-minute tasks with synthetic time 58 minutes past the hour. These verify title-first compact cards, selective metadata removal, a single-line Now label, nearest-hour-label suppression, and the marker behind task text.

Sixteen layout reports separately measured visible control targets and width at normal and 200% text across the four main screens in both themes; no sub-48dp visible targets or document-wide horizontal overflow were reported.

The evidence set contains **51 named native screenshots** under `output/ux-2026-09-26/`: the original 49-screen set plus `timeline-edge-cases-dark.png` and `settings-widgets-dark.png`. It covers Today, Blocks, Projects, Life, Settings, Block detail, Project detail, Area detail, Task detail, Capture, and Capture menu in dark/light at 1×/2×; Quick add with the actual keyboard; Timeline, Timeline top, and final Timeline edge cases; the final Widgets settings section; a labelled component gallery; and Today landscape. Portrait captures are 1080 × 2340; landscape is 2340 × 1080. The component gallery uses synthetic examples and is labelled accordingly. Keyboard clearance in Quick add is screenshot evidence, not one of the eight Capture assertions.

The visual matrix establishes emulator rendering for the named states. It does not establish TalkBack traversal, physical touch feel, hardware animation smoothness, or Samsung keyboard behavior.

## Migration and data restoration

Migration was run idempotently against a read-only copy of a preexisting emulator store with two entries. Raw wording and schedules were preserved. This was not a copy of the user's physical-phone dataset.

Before QA, 61 private files under `files`, `shared_prefs`, and `app_webview` were archived. After testing, all 61 canonical files were restored and SHA-256 matched the pre-QA archive. No app launch occurred after restoration, and the test emulator was shut down. The restoration receipt is `output/ux-2026-09-26/restoration-check.json`.

## Independent visual review

The full finish review examined the native matrix and current Planner, Capture, token, settings, and native appearance sources. Its initial disposition was **fix** for three material items:

1. preserve task identity and repair the Now label in compact Timeline cards;
2. remove the ineffective transparency setting and success claim;
3. reconcile root product/design contracts with the purpose-first implementation.

Items 1 and 2 were fixed and reverified by the final 5-check Timeline run, 313-test JavaScript suite, 63-check native suite, final Timeline/Widgets screenshots, and build. Item 3 is resolved by the current `DESIGN.md`, `PRODUCT.md`, `.impeccable/design.json`, planner surface contract, and this implementation/verification record. A final reviewer verdict is reported separately; this record does not label the build “ship” on the reviewer's behalf.

## APK artifact

- Path: `output/RPM-0.15-purpose-first.apk`
- Version code: `15`
- Version name: `0.15-purpose-first`
- SHA-256: `fdc320579f9d3cb709aa29ce47efc2e1a8f298656e37d231f8e37059bbaebe61`
- APK signing verification: passed.

The APK was packaged and verified locally. It was not committed, pushed, published, delivered, installed on the personal phone, or used to activate an external integration.

## Not verified in this implementation pass

- Physical-phone installation, upgrade with the user's current data, Samsung/One UI layout, and real-device performance.
- TalkBack interaction and full accessibility traversal.
- Live OpenRouter model calls, proposal quality, or live Jev grouping decisions.
- Live speech recognition quality, microphone routing, or Samsung keyboard dictation.
- Audible notification/alarm delivery, DND, locked-screen presentation, OEM battery restrictions, or hardware haptics.
- Tablet layout; no tablet target was supplied.
- Personal-phone migration. The migration fixture was an emulator copy with two entries.
- Optional typed shortcuts such as “tomorrow 9am”, “30m”, or `#block`; these remain deferred.
- Calendar writes, Samsung Clock writes, or any newly activated external integration; those remain unchanged or deferred.

## Evidence files

- `output/ux-2026-09-26/javascript-tests.txt`
- `output/ux-2026-09-26/token-checks.json`
- `output/ux-2026-09-26/ui-checks.json`
- `output/ux-2026-09-26/detail-checks.json`
- `output/ux-2026-09-26/capture-checks.json`
- `output/ux-2026-09-26/timeline-checks.json`
- `output/ux-2026-09-26/migration-check.json`
- `output/ux-2026-09-26/restoration-check.json`
- `output/ux-2026-09-26/screenshots.json`
- `output/ux-2026-09-26/apk-signature.txt`
- [finish-review.md](finish-review.md)
