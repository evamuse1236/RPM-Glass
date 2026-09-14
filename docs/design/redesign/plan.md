# RPM redesign plan — 8 September 2026

Applied skill: [Mobile Product Design](/home/darax/.codex/skills/mobile-product-design/SKILL.md). This supersedes the initial implementation's layout; the approved lavender/navy/warm-white references remain identity cues. The user explicitly rejected the current design and asked for a new plan and implementation.

## Audit of the current build

The app works, but its visual grammar obscures the work. Nearly every element is a large lavender pill or rounded card, including navigation, metadata choices, and actions. The first screen spends about a third of its usable height on introductory copy and seven competing buttons before showing an entry.

| Finding | Verdict | Evidence | Impact |
|---|---|---|---|
| Action/navigation hierarchy | Fail | MainActivity.render: all three tabs use the same filled button component as Save and Capture; tabs scroll away | Major: the user has to parse rather than recognize where to go |
| Density and repetition | Fail | MainActivity.entryCard: label, heading, metadata, extra fields and full-width Open details in every card | Major: a few short thoughts occupy the whole screen |
| Detail/edit structure | Fail | MainActivity.detail: an entire detail page and many large buttons live inside an alert dialog | Major: long scrolling dialog stacks make simple edits cumbersome |
| Capture hierarchy | Fail | CaptureActivity: equal-weight duration/purpose controls; a saved entry and another form compete for room above the keyboard | Major: the primary input and save are not visually stable |
| Typography and icon system | Fail | Ui: inherited Button padding plus ad-hoc sizes; emoji/Unicode mixed with vector widget icons | Major: inconsistent visual rhythm and oversized control chrome |
| State correctness | Pass | SQLite/outbox, existing correction history, explicit alarm confirmation, successful emulator tests | Preserve during the redesign |
| System-bar and IME support | Pass with limits | Ui.insets; portrait tested, landscape keyboard and 200% scaling not fully tested | Verify all redesigned forms |
| Contrast and accessibility | Not tested for new palette | Existing screenshot reviews are insufficient for a new system | Measure actual pairs; inspect targets, focus, and large text |

## Product hierarchy

Three peer destinations: **Next**, **History**, **Results**, with a persistent labeled bottom bar. Frequent actions stay near the bottom: **Check in** and **Capture**; Capture carries the strongest emphasis. Remind remains a one-tap toolbar action on Next and an option on an entry. Settings is a separate page.

- **Next:** date, clear title, compact list of planned actions grouped by date/unscheduled. No marketing headline. The full row opens details; no repeated Open details buttons.
- **History:** date-grouped timeline of saved plans/check-ins, compact filter chips (All / Check-ins / Plans). Type labels distinguish actual reports from plans. Missing values remain omitted/unknown.
- **Results:** result/purpose/domain preview, linked action count and modest progress, tap into a proper result page. Creation is clearly discoverable.
- **Detail:** screen with Back, content title, estimated/reported time, purpose/result and clearly grouped editable rows. Completion is a clear action. Original input/history remains accessible. Editing uses labeled forms, not nested action dialogs.
- **Capture:** restrained rounded sheet over the real background, Close control, descriptive title, large plain text entry area, compact optional controls, stable Save beside the keyboard. After save, a small confirmed entry appears above the next input. Corrections name the affected entry and require explicit confirmation.
- **Check in:** same composer family; optional mood and energy use explicit selection controls, duration remains reported actual. No automatic inference.
- **Settings/Cloud:** normal settings rows and a concise connection status. Pairing fields appear when needed; advanced reconnect details are collapsed once connected.
- **Widget:** compact four-action strip with consistent vectors and a visibly emphasized Check in. Its visual controls do not expand into tall columns when the launcher allocates extra space.

User follow-up: apply the design principles to the entire widget workflow and make the widget a smaller bar. Default visual height is about 64dp, no RPM header, 20dp vectors inside 48dp targets, single-row layout, horizontal resizing. Test all four launches, draft recovery, save/correction, and close back to launcher.

## Design system

Native Android Views and Java are retained. No data/schema/backend rewrite.

| Role | Light | Dark |
|---|---|---|
| Background | #FAF9FC | #14151C |
| Surface | #FFFFFF | #1D1F2A |
| Primary text | #202234 | #F0EFF7 |
| Secondary text | #646575 | #B9B9C8 |
| Accent / on accent | #65558F / #FFFFFF | #D0BFFA / #30234B |
| Accent container / on container | #EDE7F7 / #42335F | #353044 / #E8DDF8 |
| Outline (controls) | #797584 | #928C9B |
| Divider (decorative) | #E8E5EE | #343442 |
| Success | #316A50 | #9FD5B4 |
| Error | #A83238 | #FFB3B6 |

Typography: system sans; 28sp screen title, 22sp section/sheet title, 16sp medium row title/body, 14sp supporting/controls, 12sp caption. At normal scale: 20dp phone content margins, 16dp row padding, 8dp intra-group and 24dp section gaps. 48dp minimum touch targets, 24dp icons, height grows with text. Shape hierarchy: 12–16dp controls/groups, 24dp sheets. Filled/tonal primary action; neutral/text secondary actions; selection indicator for navigation.

Colors remain semantic tokens, including dark counterparts. Borders are reserved for affordances/grouping; no gradients, decorative shadows, or invented dashboard content.

## Build sequence and acceptance

1. Validate the skill and its contrast helper. Archive the previous build for rollback.
2. Implement shared tokens, vectors, interaction feedback, and primary navigation/list rows.
3. Rebuild Capture/Check in with a stable keyboard-adjacent Save and compact saved state. Render and correct this flow before proceeding.
4. Replace detail/settings/result screens and align cloud/widget/alarm presentation.
5. Inspect default and long content at ordinary, narrow, landscape, 1.3× and 2× text. Verify light/dark, empty, saved, validation, and queued states. Exercise Back, filters, edits, completion/reopen, and original history.
6. Build/lint, run existing parser/persistence tests, install the update into the emulator, and leave it open for feedback. Keep personal phone data untouched during synthetic testing.

Successful output is the implemented, inspected app plus screenshots and an APK. The skill and plan are reusable artifacts; neither replaces visual inspection or the user's feedback.

## Follow-up refinement: inline conversations

User clarified that the existing Duration/Purpose and Mood/Energy controls should remain. Their follow-up questions now appear as inline reply bubbles within Capture, Check in, and Remind. Tappable answers and a separate reply field preserve the unfinished main thought. Corrections name the affected entry and confirm inline; reminder type, permission explanation, and scheduling confirmation use the same flow. Only Android permission screens and native date/time pickers remain external. This is a deterministic local interaction, not a new AI service.
