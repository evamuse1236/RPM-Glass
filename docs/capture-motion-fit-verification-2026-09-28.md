# Capture motion and keyboard fit — 28 September 2026

**Implemented, tested, installed and visually checked on the physical Galaxy S24 FE.** The final build is `com.rpm.prototype`, versionCode **23**, versionName **0.23-readable-capture**. Its installed APK bytes match `output/RPM-0.23-readable-capture.apk`. No commit, push, external publication, model change or integration activation was performed. Existing shared work remains included.

## What failed

The v21 native viewport was stable, but its CSS panel and keyboard height transitions still laid out content every frame. Capture's three oversized gradient layers changed size with the panel. A physical trace found GPU synchronization waits up to 172ms. The first transform-only candidate reduced layout work but retained a large first-frame stall. Making the gradient texture stable in viewport coordinates removed most of that stall while retaining the glass effect.

The user's later live frame showed a second failure: a short task update was clipped behind More below with the keyboard open. At 360dp width and about 452dp usable height, its natural panel height was 462dp. An empty starter wrapper still occupied footer space. A repeated Update task label and separate estimate label/value added height. Once the card overflowed, the 48dp More below row reduced its viewport further. The translucent card also left launcher graphics visibly behind the text.

## Final behavior

- Layout changes once. The separate glass shell scales while header, content, actions and composer translate without scaling text. Capture movement takes 180ms; keyboard movement takes 240ms. Interruptions begin at the current visual pose. Reduced motion cancels these effects.
- The native WebView frame remains fixed. The gradient texture has stable viewport height and bounded layers, avoiding repeated large raster work. The inspected final emulator keyboard recording no longer showed the earlier missing-card frames. Phone disclosure recordings retain text throughout movement.
- A single pending update says Review task changes once. Numeric estimates use a clock and one line such as 5 min estimate. Empty starter wrappers take no space. Native editing guidance stays in the composer placeholder instead of a duplicate status row.
- Response cards use the existing Strong material in both themes. The shell remains glass. The actual phone's full update card, Details, actions and exact typed words were visible above its keyboard after installation.
- Menu placement reads final layout offsets rather than temporary animation positions. Existing review, original words, Details, Save changes, Undo, More, dictation and recovery behavior remain.

The floating waveform button in the user's frame belongs to **Wispr Flow**, confirmed by Android's visible overlay window ownership (`com.wispr.flowapp`). It is outside RPM's layout; its settings were not changed.

## Verification

| Check | Result |
| --- | --- |
| Current JavaScript suites | **428 passed** |
| Current Android build, test APK and lint | Passed |
| Current native Capture fixture matrix | **272 assertions, 31 layouts**, light/dark, normal/200% text, native keyboard, errors, retry, Save/Undo, History and menu |
| Focused keyboard-fit journey | **22 passed**, including the 360 × 452dp boundary, whole card visible, Strong backing, exact composer text, Details, update save and Undo in both themes |
| Current native motion journey | **28 passed**, including a single layout change, intermediate visual frames, stable native viewport, silent refresh identity, keyboard, navigation, sheets and reduced motion |
| Additional motion implementation checks | **6 passed** on v22: separate glass scaling, unchanged glyph scale, no layout properties in effects, rapid reversals, mid-animation reduced motion and progress proportions |
| Planner keyboard / process recovery | **8 + 10 passed** on v22; those paths were not changed by the subsequent card fit correction |
| Physical motion candidate | **24 checks passed**, plus six repeated expansion/collapse timing samples and inspected recordings |
| Final physical build | Installed version/signing/UID, exact APK bytes, canonical data and typed draft verified; actual keyboard-open screenshot visually inspected |
| Design hook | No findings in the two flagged CSS files; token/contrast and diff checks passed |

The six-repeat phone timing comparison used the same stored draft for v21 and the motion repair candidate. In the first 250ms of each resize, p95 frame intervals improved from **59ms to 17ms**, maximum interval from **133ms to 58ms**, and intervals above 33ms from **20 to 2**. Layout passes per sampled resize fell from **22–34 to 6–9**; panel dimensions changed once rather than at each intermediate frame. These are bounded rAF samples, not a guarantee of sustained frame rate. The final v23 card has different content geometry; do not label those comparison numbers as a separate v23 benchmark. A further v23 live sampling attempt was interrupted when RPM left the foreground; its incomplete run is not counted as passing.

The first synthetic update fixture correctly failed the target-change guard because its in-memory fingerprint included undefined fields that native JSON serialization removes. The fixture was corrected to round-trip its seed through JSON, matching actual persisted input. The production guard was not weakened. Its expected prior estimate is the existing 30-minute default; Undo was checked against that value.

## Preservation and release

Immediately before installation, the exact **34-character** composer draft was committed through the existing ordered native draft writer. A fresh restricted backup then captured the phone's current private files. The user had added records during this session; the release used that fresh state, not the earlier v21 snapshot.

The **213,024-byte** canonical store stayed byte-identical across the final install, launch and checks: version **112**, **17 entries**, **1 conversation**, **10 captures**, **6 drafts**. UID **10338**, compatible signing and existing credentials/settings were retained. Of 56 private files, 55 were identical immediately after the update; the diagnostic database only gained an informational app.start success event, with its old rows and stats unchanged. Native storage contains the exact original composer text after the update. Phone font scale, animation scale and 600000ms screen timeout were retained.

- APK SHA-256: `ff8c8432041e0ddcdfd8736cc5303bafe79476f1cedc7f4ad5390ce8bf5dde47`
- Signing certificate SHA-256: `525fee39663b1984f55e3f7367eb783968166009a0210293bc4b0b4e8fb00bf1`
- Canonical store SHA-256: `9aed786173aa58b2cc0dbd7b354392b88e844dd59b89d9468ebbc4fa9470846d`

Machine-readable evidence is in `output/motion-audit-2026-09-28/` and `output/capture-fit-2026-09-28/`. Personal backups, screenshots, trace and recordings stay in their restricted phone-private directories. Synthetic records and update/Undo actions were confined to the owned emulator; no model request or synthetic record was created on the phone by these tests.

## Hook triage

All four original findings were real motion problems and are fixed: Capture height, Planner keyboard height, progress width, and FAB max-width/padding. Progress uses scaleX; the FAB makes one layout change and fades its label. **Suppressed: none. Original findings left standing: none.** PRODUCT.md's existing platform field was normalized to android. The separate Impeccable design sidecar is still stale; a requested `/impeccable document` pass can refresh it without treating old sidecar recommendations as current product requirements.
