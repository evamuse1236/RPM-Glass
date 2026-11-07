# Settings redesign (2026-11-01)

User: "the settings in planner is hard to navigate, poorly designed and absolutely atrocious to look at, fully redesign".

## What was wrong (measured on the emulator, 0.43)

- One scroll of about 30 rows across 6 screens. Every row has the same weight.
- Walls of small print (5 notes of 2-4 lines). They repeat facts.
- Unrelated things share a section: three AI keys sit with voice, persona, import, export, restore and old screens.
- Coloured section titles and hairlines are the only structure. Nothing to scan.
- Appearance is injected by a MutationObserver into whatever Settings page renders.

## Shape

Settings becomes a short home page of grouped cards. Each row opens one page. The planner's own stack pushes each page (`app.push('settings', page)`), so Back, the top-bar title and the slide motion come free.

Home (resting state). It answers "where is the thing I want?" Focus: the row list.

```
 ←  Settings
 ┌──────────────────────────────────┐   only when something is off
 │ (!) Alarms may not ring       ›  │   one row per problem, error tone
 └──────────────────────────────────┘
 ┌──────────────────────────────────┐
 │ [◐] Appearance     System     ›  │
 │ [▣] Notch & widgets   Off     ›  │
 └──────────────────────────────────┘
 ┌──────────────────────────────────┐
 │ [⏰] Alarms & reminders        ›  │
 │ [🎙] Voice           Kore      ›  │
 │ [🔑] AI keys     1 of 3        ›  │
 └──────────────────────────────────┘
 ┌──────────────────────────────────┐
 │ [☁] Sync & backup             ›  │
 │ [🐞] Diagnostics      Off      ›  │
 │ [i] About                     ›  │
 └──────────────────────────────────┘
```

Pages (each: grouped cards, a one-line caption under a card only when it changes a decision):

| Page | Cards |
|---|---|
| Appearance | Theme: a 3-way segmented control (System, Light, Dark). Tab bar see-through: slider plus a live sample. Widget text size: slider plus a sample. |
| Notch & widgets | Notch switch (plus Allow rows while Android blocks it). Floating butterfly switch. |
| Alarms & reminders | Permissions first: Notifications, Exact alarms, each "Allowed" or a tonal "Allow"; Check saved alerts. Then Sounds: Alarm sound, Play alarm sound, Reminder sound. No captions. A blocked permission shows once on home, as a red "N off" value on the row (no banner, no dot). |
| Voice | Gemini key. Voice. Persona. Remove Gemini key in its own card, error text. |
| AI keys | Claude, OpenRouter (each: what it does, Connected or Not connected). Remove rows in their own card, error text. |
| Sync & backup | Link a web browser. Export, Import, Restore a backup. Caption: what leaves the phone. |
| Diagnostics | Status, actions, recent captures. One caption. |
| About | Name and tagline, Earlier RPM screens, Automation previews. |

## Rules applied (apple-design)

1. Content first: titles in body-large on-surface; values quiet (on-surface-variant); chevrons outline colour.
2. One focus: home has no buttons, only rows. Destructive rows sit last, in their own card, never prominent.
3. Say it once: a value shows on the home row or on its page row, not twice on one screen.
4. Grouping by card and space: inset cards (`--surface-container-low`, `--r-group`) with 1px inset dividers that start at the title edge.
5. Harmony: icon tiles use `--r-tile`, concentric with the card's `--r-group`.
6. Familiar icons always have a word.
7. Motion: only the planner's existing push and pop.
8. Feedback beside the item: a permission problem shows on its own row; the status line shows only after an action.

All sizes come from theme.css tokens (`--s*`, `--r-*`, `--touch`, type tokens).
