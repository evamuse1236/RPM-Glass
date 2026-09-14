# RPM 0.9 scoped design conformance

Fresh post-build documenter pass, 12 September 2026. This is an ordinary Android extension of the user-pinned Frosted Night surface. This report records source evidence; it does not establish new global design rules or replace the independent finish review.

Authority: `PRODUCT.md`, `docs/planner-v09-surface.md`, and `.impeccable/surfaces/android-companion-planner-html.md`. Inspected all of `planner.css`, `night.css`, `planner.html`, and `widget-menu.mjs`; sampled navigation, timeline fitting, task controls, entity views, and editing in `planner.mjs`, plus native sizing, insets, font scaling, and Back in `CompanionActivity.java`. No browser, emulator, private store, credential, or pairing file was accessed in this pass.

## Observed system

- Palette: navy canvas (`#0e141d`), solid surfaces (`#182331`, `#213246`), pale text (`#f4f7fa`), muted text (`#b4c0ce`), cyan selection (`#7dd3fc`); `android-companion/planner.css:4–5`.
- Type: bundled Jakarta body (15px/1.5), Space outcome titles (22px/1.25–1.3), 13px field labels, and 10px navigation labels; native WebView text zoom follows system font scale. These are observed CSS sizes, not native sp tokens.
- Shape: 12px planner controls and time cards, 10px fields, 48px minimum button geometry and 56px bottom destinations; capture retains its 32px assistant card and rounded composer.
- Existing material commitment: “Glass remains specific to capture.” The planner uses solid tonal layers; `night.css:18–29` retains the separate translucent assistant card, choices, and composer.
- Existing composition commitment: content begins at the top inset and date → RPM → Proj → Life → Settings anchors the bottom; no new named system rule is introduced.

## Contract evidence

| Requested behavior | Evidence in the final source |
| --- | --- |
| Remove both upper headers; retain five bottom destinations | `planner.html:3` contains workspace, actions, and bottom navigation, with no app/date header nodes. `planner.mjs:33–36` constructs the selected-date button, RPM, Proj, Life, and native Settings; date and display options live in the date editor. |
| Independent RPM level | `planner.mjs:106–115` renders all RPM blocks plus Unsorted independently of the project filter. Projects shows block summaries that open the corresponding RPM section; project/goal links connect the scales. |
| Visible completion, cross-block movement, and deletion | `planner.mjs:78–97` supplies labeled checkbox roles and checked state, numbered drag handles, destination drop zones with auto-scroll, a Move picker, priority buttons, and confirmed deletion to Trash with Undo/Restore. `planner.css:49–63` supplies the visible control and drop states. |
| Contextual capture and AI parity | `planner.mjs:32` passes active view/date/entity context; `widget-menu.mjs:15,46` displays and clears that context. `docs/planner-v09-verification.md` separately records successful live create, compound edit, hierarchy, navigation, and settings journeys. Those runtime results were read, not independently repeated by this documenter. |
| Readable short time cards | Final `planner.mjs:42–50` measures available height, hides metadata and block labels unless their complete lines fit, and allocates one to three whole title lines; fitting also runs during resizing (`:57`). Full task content remains in details/editor (`:70–76`). This supersedes the review packet's earlier clipped block-label candidate at the source level; final rendered confirmation belongs to the finish review. |
| Preserve Android operation | `planner.css:65–75` adapts narrow, large-text, landscape, and reduced-motion states. `planner.mjs:17,37–38,127` preserves scroll positions and handles Back. `CompanionActivity.java:28,39–45,52` applies system text zoom, system/IME insets, compact/expanded dimensions, and native Back dispatch. Source inspection alone is not device acceptance. |

## Drift and limits

`DESIGN.md:3,108–112,178–196` and `.impeccable/design.json:71` still describe the earlier Android pixel-garden, lavender/cream, monospace, and header/tab composition; the browser ivory world remains separately scoped. This is pre-existing drift against `PRODUCT.md` and the pinned Frosted Night contract. Both global files were left unchanged because this extension did not authorize a design-system refresh.

Obsolete upper-header selectors remain in `planner.css:6–24` but have no matching planner-shell nodes; they are not documented as active composition. The old clipping observation is not promoted into a rule. This pass establishes no additional rendered defect and makes no new tablet, contrast-measurement, hardware, or full AI-parity acceptance claim.
