# App redesign: surfaces at 412dp

Part of `docs/app-redesign-plan.md`. Each wireframe is followed by what changes from today.

## Today

```
┌────────────────────────────────────────┐
│ [thin bar: "Today" fades in]   mic  ⋯  │
│ Today                        (34/600)  │
│ Mon 19 Oct · week line →     (subhead) │
│ ( 19 20 21 22 23 24 25 )  ring on 19   │
│ 1 PM ●─┬ ┌────────────────────────┐    │
│        │ │○ Lunch        Log it   │    │
│        │ └────────────────────────┘    │
│        ╎   3 h free              +     │
│ 4 PM ○─┤ ┌────────────────────────┐    │
│ 45 min │ │○ Group call: merge…    │    │
│        │ │  ● Studies · RM review │    │
│        │ └────────────────────────┘    │
│ 5:26 ━━┿━━━━━━━━━━━━━━━━━━━━━ now     │
│                        [Search] [ + ]  │
│ Today   Blocks   Projects   Life       │
└────────────────────────────────────────┘
```
Changes: the large title is in the content, not the bar. Cards on the rail become radius-20 cells 16 from the rail. "Not done" reads as a `--danger` footnote with the word. The Now line is a 2dp tint line. The layout icon moves into More.

## Blocks

```
│ Blocks                      mic  ⋯    │
│ (Project ▾) (Active ▾)      chips     │
│ ● Studies · Term 1 coursework (fn)    │
│ ┌──────────────────────────────────┐  │
│ │ RM critical review drafted…  hl  │  │
│ │ So Sunday's submission is calm   │  │
│ │ Due tomorrow 11 PM · ★ 3 h 50    │  │
│ │ 2 of 7 done ───────── ring 16dp  │  │
│ │ ○ Next: Run the plagiarism…      │  │
│ └──────────────────────────────────┘  │
```
Changes: the Area/Project line becomes a section header. The card gets a 16dp progress ring. Purpose is never cut off; it wraps to at most 3 lines.

## Block detail

```
│ ‹ Blocks                       ⋯      │
│ RM critical review drafted…  title-1  │
│ ● Studies · Term 1 ▾            fn    │
│ ┌ Purpose ─────────────────────────┐  │
│ │ So Sunday's submission is calm…  │  │
│ ├──────────────────────────────────┤  │
│ │ ◔ Due tomorrow 11 PM · 29 h left │  │
│ │   2 of 7 done · ★ 3 h 50 of Musts│  │
│ ├──────────────────────────────────┤  │
│ │ Is this Result achieved?         │  │
│ │ Ticked tasks don't decide it  (Mark achieved) │
│ └──────────────────────────────────┘  │
│ Plan                     Sort by time │
│ ┌──────────────────────────────────┐  │
│ │ ○ Run the plagiarism report  20m │  │
│ │ ○ Submit the PDF…   ★  Tmrw 11PM │  │
│ │ + Add or find a task             │  │
│ └──────────────────────────────────┘  │
│ Completed (2)                      ˅  │
```
Changes: Purpose, standing and "achieved" become one grouped card with separators. The Plan is one group with the add field as its last row. In-place editing keeps its 2dp tint indicator, now on radius 12.

## Inbox

Large title "Inbox", one group of task rows (ring, title, when captured as a footnote). Swipe left = Move. Empty state per the plan. Changes: a group container, and the count in the section header.

## Task sheet

```
│ ════ grabber                          │
│ ○  Finish my section of the…  ★   ✕   │
│ ┌──────────────────────────────────┐  │
│ │ ▦ (✓Today)(Tomorrow)(Wed)…  ›    │  │
│ │ ◷ (9:30)(✓10:00 AM)(10:30)…      │  │
│ │ ⏱ (1 h)(✓1 h 30 min)(2 h)…       │  │
│ │ 🔔 (✓No alert)(Reminder)(Alarm)   │  │
│ │ ⟳ (✓Doesn't repeat)(Daily)…      │  │
│ └──────────────────────────────────┘  │
│ ┌ ▌RM critical review drafted…   › ┐  │
│ │   So Sunday's submission is calm │  │
│ └──────────────────────────────────┘  │
│ ┌ Notes ………  / Who could help ……  ┐  │
│ Ask Capture  Duplicate  Archive  Delete│
```
Changes: 36dp top corners. The fact rows sit in one group, and chips become pills. The Block row is its own group, with the Area bar on radius 20.

## Habits and body

Grouped sections "Water", "Meals", "Routines". The water row is a stepper + "3 of 8 glasses". Meal rows have a switch. Each row is 56dp.

## Weekly review

Full-height route. The bar has ✕ and a 4-segment progress line (tint fill). The body is groups. A pinned footer holds Back (plain) and Next (filled). The flow is unchanged.

## Settings

Grouped sections: Appearance, Sounds & alerts, Widgets, Account & backup, About. Values are `--subhead` secondary on the trailing side, with switches and chevrons. "Permission needed" stays `--danger` with its words. Slider: 4dp track, 28dp knob.

## Capture

```
│ ┌──────────────────────────────────┐  │
│ │ ○ Your words are saved  headline │  │
│ │   Reading them now.     subhead  │  │
│ │   "Call Amma about Sunday's…"    │  │
│ └──────────────────────────────────┘  │
│ ┌──────────────────────────────────┐  │
│ │ Which one?                       │  │
│ │ (Call Amma) (Buy marigolds) (Both)│  │
│ └──────────────────────────────────┘  │
│ ┌ ════ ─────────────────────────── ┐  │
│ │ ( Capture a thought         🎤 ) │  │
│ │  +                               │  │
│ └──────────────────────────────────┘  │
```
Changes: the panel radius is 36 (was 28), with radius-20 cards inside its 16 padding. One pill composer. A 28dp ring on the card's leading edge. Choice chips are pills.

## Attach sheet

A 36-radius sheet at the medium detent. A row of four 96×96 tiles (radius 20, `--bar-high`, icon + `--footnote` label) that scrolls, then one group of four rows (icon, `--body` title, `--footnote` line).
