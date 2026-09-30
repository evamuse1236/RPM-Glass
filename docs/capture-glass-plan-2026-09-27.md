# Capture: glass, motion, and reachable planning

Status: design consultation completed; implementation plan prepared. This document does not claim the app has been changed or tested with the proposed design.

Design advice: Claude Opus 5.5, medium effort, Anthropic through OpenRouter Batch. One request completed with HTTP 200 and `finish_reason: stop`; no truncation. Reported charge: USD 0.173278, approximately INR 17.33 at the saved INR 100/USD planning rate, excluding funding/FX fees. Batch: `batch-1790494257-Y4at1iUXXdZe8INaqvBW`.

[Original Opus specification](../output/capture-opus-2026-09-27/batch-review/advice.md) · [Evidence brief](../output/capture-opus-2026-09-27/brief.md) · [Local feasibility notes](../output/capture-opus-2026-09-27/implementation-notes.md)

## Intended experience

Capture should feel like a small illuminated glass surface floating above the phone. A subtle cyan/violet aurora gives it depth; the composer and proposal cards stay readable. Opening Planner should happen near the hand: hold Send or tap a visible More control at the bottom, then choose the nearest menu row, Open planner.

This follows Opus's recommended direction, “Lit glass, thumb-first.” It carries forward the user's preference for the earlier material and flowing animation while improving that design's hierarchy, reach, and accessibility. The full planner retains its current design. Capture preserves original wording, draft recovery, explicit review, and Undo.

## Material and hierarchy

- Give Capture its own scoped tokens. Reuse Jakarta and the existing theme preference; do not create a second theme setting or recolour Planner.
- Use a rounded panel, layered tinted fill, three soft radial-gradient lights, a subtle inner edge and restrained shadow. The standard appearance must work with no cross-window blur.
- Dark starting fill: `rgba(16,20,30,.86)`; light: `rgba(250,251,254,.84)`. Content-bearing surfaces use `rgba(24,29,41,.95)` / `rgba(255,255,255,.96)`. These are candidate tokens, subject to the rendered checks below.
- Primary/secondary text: dark `#F2F5FA` / `#B4BDCC`; light `#0F1420` / `#4A5466`. Focus/action accent: dark `#6FD3FF`; light `#0B6FA8`.
- Use strong backing behind body text and proposals so aurora brightness cannot compromise legibility. The ambient colour can show around these areas.
- Start control borders at white `.42` alpha in dark and `rgb(15,20,32)` `.48` alpha in light. These correct the weaker borders in the raw advice; measure them again in the actual layer stack.
- Compact panel radius 28 dp; expanded 24 dp. Header identity 13/18, greeting 22/28 (26/32 expanded), body 15/21, metadata 13/18. All actions own at least 48 × 48 dp targets.
- Retain the bright circular Send control and a visible focus edge. Keep Close and Expand in a quiet header; remove the top overflow once bottom access is working.
- Use starter pills only for an empty conversation. At normal text size they can scroll horizontally with full labels; at enlarged text they wrap vertically. They yield space before the input or conversation when the keyboard leaves little room.

Optional grain must be a bundled local asset, not Opus's proposed data URI: the current native image policy permits same-origin assets only. Do not loosen that policy for decoration. If the grain adds no visible benefit, omit it.

Native cross-window blur is a separate enhancement, not a prerequisite or a claim made by this plan. Android can disable that effect at runtime and requires a readable fallback. Keep the current transparent host and working keyboard inset handling. [Android window-blur guidance](https://source.android.com/docs/core/display/window-blurs)

## Bottom access and keyboard layout

The normal route is a visible More button near the composer. Long-press Send remains the right-thumb shortcut to the same options.

Keep the existing 380 ms hold threshold, movement cancellation beyond 12 px, and suppression of the release click. Add a subtle hold indicator from about 150 ms until activation; releasing leaves the menu open. No drag-to-select. A short tap sends only if there is nonempty text and no request is in flight. Empty/busy Send remains available for the hold gesture, while the actual submit action is guarded separately. More must remain usable while a reply is pending.

The menu rises above the composer, with an 8 dp gap, 12 dp side insets, 20 dp radius and rows at least 56 dp high. Visual and DOM order are About, Assistant settings, Context, History, Open planner. Open planner stays at the bottom, closest to the invoking controls. If height is limited, the other rows scroll while Planner remains visible. Do not duplicate the Planner action in the accessibility tree.

Preserve the draft before navigation and restore its exact text on return. Opening either menu or Planner must never send the draft. Do not display “Your draft is kept” without verifying that persistence path.

**Narrow-phone correction:** Opus's single-row width calculation is optimistic. With 24 dp outer insets, 8 dp inner padding, three 48 dp controls, three 8 dp gaps, and 16 dp text padding, a 372 dp panel leaves about 156 dp of actual text width, not 190. Start with a two-row composer below 400 dp available panel width or when text is enlarged: a full-width text field above a control row with More on the left and Mic/Send on the right. At larger widths use one row only when the measured text content width remains at least 180 dp. Render the 372 dp case first; tune spacing within this design before scaling it.

Retain native compact/expanded sizing and measured IME/system insets. The composer stays above the actual keyboard. Text input grows within available height, then scrolls internally. When space is short, first remove the empty-state support line, then starter pills. Never clip a real message or replace a usable input with decorative space. New content follows the bottom only when the user is already there; preserve their position when they scroll back.

**Focus correction:** the raw advice both traps focus and specifies conflicting return targets. Use a coherent menu-button implementation: arrow-key navigation inside, Tab/Shift+Tab close and move out, Escape closes and returns to the invoker. More opened with Enter/Space focuses the first item; Up Arrow can open at the last item, Planner. Keep this logical DOM order even though Planner is visually emphasized. Touch dismissal may restore the previously focused composer; do not force its focus on keyboard/assistive-technology dismissal. Android Back closes the menu before Capture. Verify IME behaviour on the phone. [W3C menu button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/), [menu keyboard behaviour](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/)

## Motion and truthful status

Use a small explicit presentation state model. Drive it from real request/response events, not a timer that pretends progress has occurred. The current interface provides busy then a completed reply; this plan adds a visual reveal, not network token streaming.

| State | Proposed treatment | Required behaviour |
| --- | --- | --- |
| Open / idle | 220 ms opening transition; low-intensity internal light with a slow 14–18 s drift | Retain readable content; stop animation when hidden |
| Composing | Focus edge changes over roughly 160 ms | Input/caret remain stable through unrelated updates |
| Sending | User words enter the transcript with a small 220 ms lift/fade | Keep original text and the existing recovery path; do not overwrite a newer draft |
| Waiting | Light intensifies behind a contained response slot; 4.8–7 s aurora drift with a soft flowing band | Earlier conversation stays visible; one polite waiting announcement; no fake completion percentage |
| Reply arrives | Light settles over 180 ms; reply blocks fade/reveal in 160 ms with modest stagger, total at most 400 ms | Full content is available immediately; animate once per new response, never after history/theme/menu refresh |
| Proposal / receipt | Clearly labelled Proposed content; after actual acceptance, transition to saved receipt with Undo | Preserve current Add/Edit/Dismiss/Undo semantics; animation does not change planner state |
| Error / retry | Light settles; show a precise inline failure and Retry/Edit | Retain words and reuse existing retry identity; never label a saved capture “Not sent” |
| Menu | 200 ms rise/fade, approximately 30 ms row stagger beginning near Planner | Gesture timing and focus do not depend on animation finishing |

With reduced motion, use static light and immediate updates or a short opacity fade: no drift, sweep, pulse, scale, lift or stagger. Respect the existing system preference, then verify Android Remove animations on device instead of assuming the CSS query proves it.

Animate transform/opacity on contained gradient layers. Avoid large animated blur filters. Enable `will-change` only during active motion. Optional haptics require an already available mechanism and actual device verification.

The raw advice's “Not sent” label is rejected as a blanket error state. Capture saves original words before model work, so some errors occur after a successful local save. Use “Couldn’t finish the response” for that case, with existing retry/recovery actions. Distinguish a local save failure using the actual reported outcome. Never claim a plan was added until its normal acceptance operation succeeds.

Do not add an unused future `partial`/streaming state or a new Stop action. Neither is needed for the requested visual treatment.

## Implementation sequence

| Stage | Files / responsibility | Exit check |
| --- | --- | --- |
| 1. Reachable navigation | `android-companion/index.html`, `widget-menu.mjs`, native-scoped busy controls in `chat-prototype/app.js` | More and hold open the same bottom menu, busy access works, release never sends, Planner preserves draft |
| 2. Capture material and layout | New `capture-tokens.css`, `night.css`, Capture shell; reuse root `data-appearance` | Render 372 dp compact keyboard-open dark/light first; enlarged-text version expands without clipped input or labels |
| 3. State and motion | Small Capture presentation hook in `runtime.mjs`/`widget-menu.mjs`; native-scoped conversation rendering in `chat-prototype/app.js` | Waiting keeps context, response reveal runs once, reduced motion is static, errors/retry preserve exact words |
| 4. Proposals and recovery presentation | Existing Capture proposal/receipt UI; no planner mutation redesign | Add remains explicit, corrections work, Undo restores the existing data state, visual states match operation outcomes |
| 5. Packaging and contracts | Asset-copy list in `scripts/build-companion-assets.mjs`; native `ASSETS` allowlist for added CSS/optional grain; `scripts/check-ux-tokens.mjs`; relevant DESIGN.md/PRODUCT.md sections | Assets load under existing security policy; Capture tokens are owned separately; planner token checks remain strict; docs no longer mandate opaque Capture |
| 6. Verification | Existing gesture tests, focused DOM/native checks, representative rendered evidence and physical-phone pass | Criteria below pass; report automated, emulator and physical-device verification separately |

Implementation must preserve the already dirty working tree. Do not revert whole historical files. Shared browser UI changes must sit behind the Android/Capture boundary. Generated native assets come from the normal bundler, not manual edits.

## Verification and acceptance

The consultation used three still images: historical dark glass, updated dark empty Capture, and its open menu. Light mode, proposals, errors, 200% text and motion were not seen by Opus; those parts are design proposals awaiting visual validation.

1. Retain and run existing gesture tests for tap, hold, release suppression, pointer cancellation, movement cancellation and the next deliberate tap. Add focused coverage only for newly changed behaviour: busy menu access, focus return, draft navigation and reveal-once identity.
2. Use synthetic fixtures for empty, typing, waiting, reply/proposal, receipt/Undo and error/retry states. No paid inference is needed for layout checks. Preserve and restore emulator data before fixture writes.
3. Cover dark/light, compact/expanded, keyboard open/closed, 100%/200% text and a short landscape viewport with a representative matrix. Do not test an impossible compact-200% combination when the app intentionally expands. Freeze the same animation instant for visual comparisons.
4. Check over white, black, a text-heavy app and a busy photo. Body text must reach 4.5:1, control boundaries/focus 3:1. Alpha compositing of the raw Opus border values gives only about 2.90:1 dark and 2.44:1 light; the corrected starting values give about 4.01:1 and 3.26:1 before aurora/highlight effects. These calculations are not rendered verification.
5. Check that Planner remains the nearest menu action and reachable at large text; every control is at least 48 dp; the composer clears the real IME; no visual effect covers text or an action.
6. Check the main Planner and desktop prototype for regressions. Verify meaningful appearance/interaction invariants; do not fail screenshots merely because a clock or dynamic content changed.
7. Run the relevant JavaScript suite, asset build and Android build/lint after implementation. A successful build does not establish the appearance or native touch behaviour.
8. On the physical phone, check sustained waiting/reveal smoothness, long-press feel, keyboard restoration, TalkBack navigation, Remove animations and draft return from Planner. Aim for the device's refresh cadence without visible jank; report what was actually measured.

Completion means the specified Capture behaviour is implemented and visually checked on the named surfaces. Publishing, installing a release, and external delivery remain separate stages.


## Direction contract

THESIS: Lit glass, thumb-first. Capture keeps the earlier translucent character and flowing response feedback while making planning reachable from the composer.

OWN-WORLD: Scoped cyan and violet light within a tinted glass shell, a fine highlight edge, Jakarta type, and stronger text-bearing surfaces. Planner retains its solid semantic palette.

STORY: Write freely; see that the thought is being considered; review a complete proposal before saving. Original wording stays recoverable.

FIRST VIEWPORT: A compact 372 × 460dp panel with identity and window controls above a flexible transcript. A full-width writing field sits over More, microphone and Send. The menu opens directly above it with Open planner pinned at the bottom. Large text expands the panel.

FORM: Code-led implementation of the user-approved Opus plan; an explicit design reference, so no concept seed round applies. Signature interaction: hold Send for 380ms to open the same menu as More, with no release submission. Motion uses slow ambient drift, a faster waiting band and a bounded complete-response reveal.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
