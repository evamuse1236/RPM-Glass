# App redesign plan: Apple style for the planner and Capture

Design plan by fable-designer, 2026-10-19. User ask: "do apple style redeign for the whole app as well and planner". Sources: `DESIGN.md`, `docs/planner-surface-contract.md`, `CONTEXT.md`, `docs/notch-design-study.md`, `docs/notch-redesign-plan.md` §0, `theme.css`, `motion-core.mjs`, `docs/design/components.md`, `docs/design/capture-panel.md`, HIG JSON pages. The HIG `navigation-bars` page returned 404, so large-title numbers are inferred from the typography table (Large Title 34/41, Headline 17/22).

Surface wireframes: `docs/app-redesign-surfaces.md`.

## Decisions on the plan's open questions (taken with the recommended default)

- Blur ("thin material") on the top bar and tab bar only, with a solid fallback under `@supports`. This overturns DESIGN.md's "no blur" line for those two bars. Measure scroll jank on the S24 FE before release.
- Dark page is true black, to match the notch and OLED. Cards carry the depth.
- Switches are green when on (`--success`).
- Rows stay 48dp tall (AGENTS rule), not Apple's 44.

## 1. Direction

The design is paper-flat, layered and quiet. A dimmer page carries brighter inset-grouped cards, with one blue tint and one bold title that shrinks into the bar as you scroll. RPM's own mark is the Today spine: one vertical rail with a Now line, where every card still carries its Result and Purpose. Every corner follows the notch's rule (inner radius = outer − inset, even margins), so the notch, sheets, cards and chips are one family.

## 2. Tokens

**Colour** (`light-dark()` with a `color-scheme` switch; keep `data-appearance` on `<html>`):

| Role | Light | Dark |
|---|---|---|
| `--bg` page | `oklch(96% 0.005 285)` | `oklch(0% 0 none)` |
| `--bg-elevated` sheets, menus | `oklch(100% 0 none)` | `oklch(22% 0.003 285)` |
| `--cell` grouped row/card | `oklch(100% 0 none)` | `oklch(22% 0.003 285)`; on elevated `oklch(30% 0.003 285)` |
| `--fill` gray buttons, chips, fields | `oklch(0% 0 none / .08)` | `oklch(100% 0 none / .12)` |
| `--label` | `oklch(0% 0 none)` | `oklch(100% 0 none)` |
| `--label-2` | `oklch(35% 0.01 285 / .6)` | `oklch(100% 0 none / .6)` |
| `--label-3` placeholder | `… / .3` | `… / .3` |
| `--separator` | `oklch(35% 0.01 285 / .29)` | `oklch(60% 0.01 285 / .65)` |
| `--tint` | `oklch(47% 0.19 262)` (#0B57D0) | `oklch(82% 0.08 262)` (#A8C7FA) |
| `--tint-soft` | `color-mix(in oklch, var(--tint) 15%, transparent)` | same |
| `--success` | `oklch(45% 0.13 150)` | `oklch(80% 0.15 150)` |
| `--must` | `oklch(55% 0.14 60)` | `oklch(88% 0.14 90)` |
| `--danger` | `oklch(50% 0.18 27)` | `oklch(82% 0.07 20)` |

Keep `--area-0…7` and the Capture `--bar*` palette. Every label pair must reach 4.5:1 on its surface (the builder checks `--label-2` on dark `--cell`).

**Type** (Google Sans Flex 400/500/600, sp so it scales with Android text zoom):

| Token | sp/lh | weight | Replaces |
|---|---|---|---|
| `--large-title` | 34/41 | 600 | headline-medium |
| `--title-1` | 28/34 | 600 | headline-small |
| `--title-2` | 22/28 | 600 | title-large |
| `--title-3` | 20/25 | 500 | new (sheet titles) |
| `--headline` | 17/22 | 600 | title-medium |
| `--body` | 17/22 | 400 | body-large |
| `--callout` | 16/21 | 400 | new |
| `--subhead` | 15/20 | 400 | body-medium |
| `--footnote` | 13/18 | 400 | body-small, label-medium |
| `--caption` | 12/16 | 400 | label-small (nothing under 12) |

Old names stay as aliases for one release. `.tnum` stays for times.

**Spacing:** 4, 8, 12, 16, 20, 24, 32. Page inset 16. Row padding-inline 16, min height 48. Icon column 28 + 12 gap. Max content width 720.

**Radius (concentric):** `--r-sheet` 36 (= notch island), `--r-group` 20 (36 − 16), `--r-control` 12 (20 − 8), `--r-tile` 8 (12 − 4), pills 999. A rectangle inside a padded rectangle takes parent radius − padding. A pill may be the innermost shape anywhere.

**Materials:** top bar and tab bar: `background: color-mix(in oklch, var(--bg) 80%, transparent); backdrop-filter: blur(20px) saturate(1.4)` under `@supports`, solid `--bg` otherwise. Sheets, menus and the snackbar are opaque `--bg-elevated`. The Capture panel is opaque `--bar`.

**Shadows:** none on cards or rows. Sheets, Capture panel, menus, snackbar: `0 8px 24px oklch(0% 0 none / .16)` light, `/ .4` dark.

**Motion:** tokens unchanged (`--ease-*`, `--dur-*` must match `motion-core.mjs`). Press `scale(.97)` 100ms; sheets 350 in / 200 out; rows 250; screens 300 shared-axis. The large-title collapse is scroll-driven (`animation-timeline: scroll()`). No CSS springs; `--ease-spring` only for the ring pop. The reduced-motion rule stays.

## 3. Components

- **Navigation bar:** 56dp pinned bar (status-bar padding from `env()`), inline title `--headline` centred, opacity 0 → 1 over the last 24dp of the large title's travel. Large title `--large-title` sits in the content, 16 inset, 8 below the bar, and scrolls away. Back is a tint chevron + the previous page's word. Capture (mic) and More stay trailing.
- **Tab bar:** 64dp + safe area, thin material, 1dp top separator. Four items: 24dp icon (filled when selected) over a `--caption` label; tint when selected, `--label-2` otherwise. No pill indicator. Search (40) and Add (56) stay in the right-thumb column, 16 from the edge and 16 above the bar.
- **Grouped list:** section header `--footnote` secondary, 16 inset, 8 above the group. Group: `--cell`, radius 20, rows separated by a 1dp `--separator` starting at the text edge (56dp). Row: leading icon column, title `--body`, value `--subhead` secondary trailing, chevron for drill-in. Swipes stay (right Done = success fill, left Schedule/Move = tint fill), clipped to the group's corners.
- **Today timeline row:** rail at 64dp, time gutter `--subhead tnum`. Item = a radius-20 `--cell` card 16 from the rail to the page edge, min 56 tall (+24 per half hour, cap 160): ring, title `--body`, one line `--footnote` (Area dot + Result, or Now · until, or Clash + Resolve). Events: 1dp separator outline, no fill. Free time: dashed rail segment, `--footnote` secondary, with a `+`. Now: a 2dp tint line across the rail with the time in tint; the in-progress card gets `--tint-soft`. Water and meal rows: 40dp, in a gray fill pill.
- **Card vs row:** a card (radius 20, fill) is for one thing with inner structure. Lists are groups of rows. Never a card in a card.
- **Sheets:** detents medium (50%) and large (top 16dp under the status bar). Grabber 36×5, radius 2.5, `--label-3`, 8 from the top. Top corners 36, padding 16, inner groups 20. Header: title `--title-3`; Cancel / Done only when there is something to save (the task sheet keeps "no Save button"). Scrim `oklch(0% 0 none / .4)`.
- **Buttons:** 48dp pills, `--body` 500. Filled: `--tint` bg, white label (dark: `oklch(10% 0.05 262)`). Tinted: `--tint-soft` bg, tint label. Gray: `--fill`. Plain: tint text. Hover only under `(hover:hover)`; active scale .97; focus-visible 2dp `--tint` outline offset 2; disabled 38% opacity; loading shows a 20dp ring at a fixed width.
- **Chips:** 40dp pills, `--subhead` 500, `--fill`; selected `--tint-soft` + tint label + leading check; dashed outline for "Suggested". They wrap and are never truncated.
- **Text fields:** in a group they are a row (label leading, value trailing). Standalone: `--fill`, radius 12, 48dp, placeholder `--label-3`, a clear button when not empty; `:user-invalid` adds a `--danger` footnote line, never colour alone.
- **Composer:** one `--bar-high` pill, `field-sizing: content`, 1–6 lines, `--body`; `+` leading, mic trailing, which becomes a filled Send when there is text.
- **Capture card / receipt / question:** cards on `--bar-high`, radius 20, padding 16. Card: `--headline` title, `--subhead` lines, fact chips (icon + text, 32dp `--bar-highest` pills). Receipt: `--headline` summary, one `--subhead` line per item, Undo as a plain trailing button. Question: `--subhead` prompt, then 2–4 choice chips (40dp pills, wrap). A failed tap shows its `withProblem` line under the chip. Errors are a `--footnote` line in `--danger` with words from `userMessage`.
- **Toggles:** 51×31 switch, knob 27, on = `--success`, off = `--fill`; 48dp target.
- **Steppers (water):** gray pill 96×48 with −/+ 48dp halves split by 1dp; the number in `--title-1 tnum` beside it. Hold repeats every 150ms.
- **Empty states:** centred 44dp icon `--label-3`, one `--title-3` line, one `--subhead` sentence, one tinted button that does the next thing.

## 4. Text size: One UI default only

User, 2026-10-19: "no need for 200 percent text size adjustments ... I use the default font size for galaxy one ui, optimize for that". Design and verify at 384dp wide, 100% text. The list below is kept as history and is not built.

### Retired: large text (200%)

sp scales; dp does not.
- Large title wraps whole words up to 2 lines.
- Tab labels wrap to 2 lines and the bar grows; they are never hidden.
- Rows: the value drops under the title; the chevron stays.
- Timeline cards: the time gutter stays one line; the 160 cap is removed at 150% and above.
- Chips stay one line each; their rows scroll sideways with an edge fade.
- Two buttons in a row stack when they overflow.
- Sheets scroll between header and footer.
- The composer grows to 6 lines, then scrolls, always above the keyboard. Capture choice chips wrap to a column.
- `hyphens: none` everywhere.

## 5. Build order (each step verifiable alone)

1. `theme.css` tokens (colour, type, radius, material) with aliases. Checks: `motion-tokens.test.mjs`, `companion-assets.test.mjs`, `rpmctl sync` + a Today screenshot in light and dark.
2. Navigation bar + large title, tab bar, right-thumb column. Checks: `default-text-fit` (nav labels visible), `selectors.test.mjs`.
3. Grouped list, buttons, chips, fields, switches, stepper. Checks: `task-swipe.test.mjs`, `habits.test.mjs`, `focused-field-visible`.
4. Today spine. Checks: `scenario --all`, `plan-add-in-place`, `default-text-fit` Today, `logs --errors`.
5. Blocks, Block detail, Inbox, Settings, Habits, Weekly review. Checks: `block-add.test.mjs`, `surface-refresh.test.mjs`, `default-text-fit` Blocks and Block detail.
6. Task sheet and attach sheet. Checks: `default-text-fit` task sheet, `focused-field-visible` quick add.
7. Capture cards, receipt, question, composer. Checks: `capture-keeps-words`, `capture-lines.test.mjs`, `capture-presentation.test.mjs`, the `raw-error-text` rule, `default-text-fit` Capture.
8. New AGENTS rule: "Inner radius = outer − inset; sheets 36, groups 20, controls 12", enforced by a token test that reads the radius and padding tokens.

## Mock

`docs/mocks/app-redesign.html`: Today, Block, Task sheet and Capture in light and dark.
