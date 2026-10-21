# Capture result card with editable chips (2026-10-21)

The card is a receipt that is also the editor. Nothing opens over it: a chip tap unfolds one row of choices under that item, a choice saves and folds it back. Capture stays dark in both themes (DESIGN.md), so every token below is a `--bar-*` token.

Width at 384dp: card 352 outer, 310 inner (`padding 16px 20px`, 1px border). The 32dp glyph circle (`.line-glyph`) is dropped on this card; the kind icon moves into the title row.

## 1. Layout

One item (`"remind me 8:30 to call the bank"`):

```
┌ card: --bar, 1px --bar-outline, --r-group 20, pad 16 20, gap 12 ─┐
│ ✓ Added                              kicker: title-medium       │
│ [add_task] Call the bank              title row: 40dp, body-large│
│ [event Today] [schedule 8:30 AM] [notifications Reminder ·lit]  │
│ [repeat Add repeat] [stacks Add Block]        chips: wrap, gap 8 │
│ ── change row (only after a chip save) ──────────────────────── │
│ Closing in 5s                 [undo Undo]  [Open planner]        │
└──────────────────────────────────────────────────────────────────┘
```

Four mixed items (Area, Project, Block, task): spoken order, except a new parent sits before its new child. Items 1 to 3 show chips; item 4 onward is compact.

```
│ ✓ 4 added                                                        │
│ [category] Health                                                │
│ [favorite Add purpose]                                           │
│ [folder] Run a 10k                                               │
│ [category Health]                                                │
│ [stacks] Week 1 base                                             │
│ [favorite Add purpose] [folder Run a 10k] [category Health]      │
│ [add_task] Buy shoes            [expand_more]  ← compact, 40dp   │
│                               [undo Undo]  [Open planner]        │
```

Spacing: card gap `--s3` 12 between items; title row to chips `--s2` 8; chips gap `--s2`; actions row keeps `margin-block-start:-4px`. The `.cards` list scrolls with its existing 24px edge fades.

## 2. Chip anatomy

Base (replaces `.fact`): `min-block-size var(--chip-block)` 40; `padding-inline 12px 16px`; `border-radius var(--r-tile)` 8; `font var(--label-large)`; `gap 4px`; 20px icon; `white-space:nowrap; max-inline-size:100%; overflow:clip; text-overflow:ellipsis` (no word splits; long names clip). `::after{inset:-4px 0}` makes the 48dp target.

| State | Background | Border | Text | Icon |
|---|---|---|---|---|
| Filled | `--bar-highest` | none | `--bar-on` | `--bar-primary`, outlined |
| Empty ("Add time") | transparent | 1px dashed `color-mix(in oklch,var(--bar-on-variant) 60%,transparent)` | `--bar-on-variant` | `--bar-on-variant` |
| Lit (Reminder/Alarm on) | `--bar-accent` | none | `--bar-on-accent` | `.ms.fill`, `--bar-on-accent` |
| Must | as filled | | | `--bar-warn` star |
| Open (tray showing) | `--bar-highest` | 1px solid `--bar-primary` | | |
| Pressed | existing `:active` 12% overlay, scale .97 | | | |
| Focus | `outline 2px --bar-primary, offset 2` | | | |

| Chip | Icon | Filled | Empty |
|---|---|---|---|
| Day | `event` | Today, Tomorrow, Tue 28 Oct | Add day |
| Time | `schedule` | 8:30 AM | Add time |
| Alert | `notifications` / `alarm` (lit) | Reminder, Alarm | Add alert (only when a time exists) |
| Repeat | `repeat` | Daily, Weekdays, Weekly | Add repeat |
| Block | `stacks` / `inbox` | Block title, Inbox | Add Block |
| Length | `timer` | 30 min, 2 h | never shown empty |
| Purpose | the planner's Purpose icon, else `favorite` | first 14 chars… | Add purpose |
| Project | `folder` | title | Add Project |
| Area | `category` | title | Add Area |

Labels ≤ 14 characters; values use `.tnum`. Order: Must, Day, Time, Alert, Repeat, Block, Length. A task shows at most 2 empty chips (Time, then Block). Title row: 24px kind icon (`add_task`, `stacks`, `folder`, `category`) in `--bar-primary`, title in `--body-large`, a 40dp button.

## 3. Edit interaction

Every chip opens a tray: a row inserted under that item's chips, inside the card, full inner width, `background --bar-high`, radius `--r-control` 12, `padding 8px 12px`, `gap 8`. One tray open at a time. The first chip tap stops the "Closing in 5s" countdown for good.

| Chip | Tray content | Saves when |
|---|---|---|
| Day | horizontal row (`.tiles` pattern): Today, Tomorrow, five weekdays, No day; 40dp pick chips | tap |
| Time | presets 9 AM, 12 PM, 3 PM, 7 PM, No time, then `input type=range` 6:00 to 23:00 in 15 min steps; the chip label updates while dragging | preset tap, or slider release |
| Alert | segments Off, Reminder, Alarm; selected = `--bar-accent` | tap |
| Repeat | Never, Daily, Weekdays, Weekly, Monthly | tap |
| Block / Project / Area | pick chips from what exists, Inbox or None first, current in `--bar-accent`; past 8 the tray scrolls (`max-block-size 200px`) | tap |
| Length | 15, 30, 45 min, 1 h, 2 h, None | tap |
| Title / Purpose | a textarea in place of the title (or in the tray for Purpose): same font, `--bar-highest`, radius 8, `padding 8px 12px` | Enter / blur |

Save is optimistic: the chip shows the new value at once with the `.fact-reading` shimmer until the phone confirms, then `fact-pop`. On confirm a change row appears above the actions row: 40dp, `--bar-high`, radius 8, `undo` icon + "Time set to 9 AM" (`--body-medium`) + a text `Undo` button (aria-label "Undo time change"). A later change replaces the row's words. Its Undo reverts only that chip. The footer Undo still undoes the whole capture, chip edits included.

Close: on save, on tapping the open chip, on Android Back, or on a tap in the card outside the tray. No scrim.

## 4. Long results

Items 1 to 3 full. From item 4: a 40dp compact row, title + `expand_more`; a tap expands it in place and it stays expanded. Beyond 6 items, one "+N more" compact row expands them all. The kicker stays `tally()` ("4 added").

## 5. Motion

1. Tray open/close: `display:grid; grid-template-rows 0fr → 1fr` with `overflow:clip` on the inner cell; open 200ms `--ease-emphasized-decelerate`, close 150ms `--ease-emphasized-accelerate`.
2. Value saved: existing `fact-pop`.
Both inside `@media (prefers-reduced-motion:no-preference)`.

## 6. States

- Saving: shimmer on the chip; the item's chips stay tappable (a second tap queues).
- Saved: pop plus the change row.
- Failed: chip reverts with a 1px `--bar-error` border, and `withProblem(node, userMessage(error))` under the kicker; a new tap retries.
- Offline / no key: items are already created locally; chip edits need no model.
