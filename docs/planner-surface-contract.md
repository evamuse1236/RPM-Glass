# Purpose-first Android planner

Mode: Operate. Android phone, trusted offline WebView, native private storage and Android system services. The Planner brief is [ux-2026-09-26/brief.md](ux-2026-09-26/brief.md); the accepted Capture extension is [capture-glass-plan-2026-09-27.md](capture-glass-plan-2026-09-27.md). Together they supersede the earlier Frosted Night and five-destination contracts. They do not replace the desktop browser or native home-widget contracts.

## Direction

**Thesis:** Purpose stays beside action. A task serves a Result, the Result has a Purpose, and the ordered tasks form its Plan.

**Visual world:** Planner uses solid light and dark tonal surfaces, Jakarta type, a 4dp rhythm, 48dp controls, one card level, persistent Area identity, and local press feedback and short, interruptible navigation/sheet motion. Capture keeps the shared type and spacing scale but owns a scoped lit-glass palette in `android-companion/capture-tokens.css`; it does not change Planner colors or hierarchy. The current normative system is recorded in root `DESIGN.md`.

**Story:** Start with what matters today, act in one tap, inspect the Result and Purpose, then move outward through Blocks, Projects, Goals, and Areas without losing place or changing words for the same concept.

**Binding vocabulary:** Area · Goal · Project · Block · Result · Purpose · Plan · Task · Must · No block · Inbox. “RPM” is the product name, not a list level. Do not use Outcome, Breakdown, Unsorted, Action, separate Priority, or a second importance concept in current UI copy.

## Navigation and hierarchy

- The solid 80dp bottom bar contains exactly **Today, Blocks, Projects, Life**, each with icon and visible label.
- Settings pushes from the Today top bar and from other-screen overflow. Search stays in the top bar. Capture opens from the top bar; neither is a floating peer to Add.
- Each root screen has at most one context-specific floating action.
- Details push above root navigation and use Android Back. Task detail and quick add use bottom sheets with sticky primary actions above the keyboard.
- Structural hierarchy is **Area → Goal → Project → Block → Task**. A list shows a summary; the next level holds controls. Cards never nest more than one level.
- Preserve the selected day, filters, scroll position, detail target, draft, and active context across ordinary rerenders and system text-scale changes.

## Core surfaces

### Today

- Header, date, week strip with task dots, and up to three Result summaries precede the Agenda/Timeline toggle.
- Agenda groups Now & next, Scheduled, Must anytime, Anytime, and collapsed Completed tasks. Every task keeps Result context; Now & next also keeps the full inherited Purpose.
- Completion is one tap, recoverable through Undo, and never claims the Result was achieved.
- Timeline uses a 72dp ruler and 112dp per hour. Timed cards scale by duration and use their Area tone. A 15- or 30-minute card keeps its title first and drops duration or Result metadata before it drops identity. Overlaps remain readable.
- The red Now label is one line. Hide only the nearest hour label when it falls within 12 minutes; keep the marker behind task text.

### Blocks

- List cards show Area/project, Result, `Why:` Purpose, one progress format, and the next incomplete task. That next-task checkbox is the only direct list control.
- Block detail makes Purpose prominent, then presents the ordered Plan with completion, Must, and drag handles.
- `priority` remains the stored order field for compatibility. The UI exposes Plan order, not a numbered priority or separate importance setting.

### Projects

- List cards show Area, Project, one-line Purpose, progress, and Block count. No nested Block cards appear in the list.
- Project detail shows Area/Goal breadcrumbs, the Project Purpose, progress, and first-level Block cards.

### Life

- Vision is the default view; Quarter, Month, and Values are scrollable 48dp tabs.
- The default Wheel of Life is a labelled radar chart with Area names, scores, persistent Area hues, and the average below.
- At 200% text, labelled accessible rating bars replace fixed chart labels so names and values remain readable.
- Ratings are reflective 0–10 values in half steps. They do not derive from task completion.
- Area detail shows its description, rating, yearly Goals, and linked Projects as rows rather than nested cards.

### Task detail and quick add

- Task detail combines completion, editable title and meta, Must, a tappable Part-of panel with Result/Purpose/breadcrumb, notes, and differing original capture text.
- The sticky footer uses “Mark complete” or “Mark incomplete”; destructive and secondary actions live in overflow with Undo or confirmation.
- Quick add opens with its title focused and the real keyboard visible. Date, duration, Block, Must, repeat, and More are optional chips. An unassigned task may keep an optional Why.
- Typed shortcuts are intentionally deferred. Do not claim or infer them from ordinary text.

### Capture

- Job statement: **Capture turns messy thoughts into tasks and Blocks.** AI chat is the mechanism, not a separate product.
- The scoped glass overlay measures the current response and grows or shrinks at up to 372dp wide, with 12dp side/bottom clearance and 24dp top clearance. Enlarged text uses available width with 4dp clearance; manual Expand uses available height. Content height moves over 220ms and follows keyboard insets. See the [motion contract](motion-plan-2026-09-28.md).
- The transparent host exists to receive reliable Android system-bar and IME insets. The panel uses a translucent tinted shell and contained cyan-violet-blue light; messages, saved-word provenance, active context, history summaries, proposals, recovery, and the composer use Strong backing, while the options menu is opaque. Native settings call this mode Glass. There is no user opacity setting or cross-app blur guarantee.
- The quiet header contains RPM identity, Expand, and Close. A visible More control near the composer opens the options menu; no top overflow remains.
- The empty, unfocused composer uses one row. Focus, entered text or enlarged text places the full-width growing field above More, Mic, and Send. More uses `width: max-content` with an 80dp minimum so enlarged or doubled text fits. Effective text-scale layout resynchronizes on phone-status changes.
- More and a 380ms Send hold open the same menu. Movement beyond 12px cancels the hold, release after activation cannot send, and short-tap send still requires nonempty text and no request in flight. More remains available while a reply is pending.
- Menu order is About, Assistant settings, Context, History, then Open planner pinned at the bottom. Preserve the exact draft before any menu route and after the Planner round trip; opening the menu or Planner never submits it.
- Three complete starter choices appear only in a truly empty conversation. Hide the greeting and starters while waiting or while a recovery card is present. At normal text the starters may scroll horizontally; at enlarged text they stack and yield before the input when height is short. Voice input uses Android's speech recognizer and shows a labelled Listening state only while active.
- Idle light drifts over 16s. Waiting uses a 6s aurora drift and a 2.4s contained band. A completed reply is available immediately and reveals once within 220ms. Unchanged resume/status updates retain the current card, disclosure state, scroll and input; they do not replay the response. Reduced motion removes drift, sweep, pulse, scale, lift, and stagger.
- Proposed tasks and Blocks expose Add, Edit, Dismiss, and Add all. Canonical changes require confirmation and remain undoable.

### Settings

- Settings is a pushed screen grouped by Appearance, Sounds & alerts, Widgets, Account & backup, and About.
- Theme offers System, Light, and Dark. Values use secondary text; opening rows use chevrons and booleans use switches.
- Navigation is always solid. Do not expose the retired solid-navigation option or any Capture-opacity control; the Capture mode is named Glass.
- Home-widget text size and butterfly controls remain accurately scoped native settings. Legacy stored transparency data may remain for compatibility but must not be presented or reported as an applied visual change.

## Data and behavior

- Save raw wording before interpretation. Preserve revisions, schedules, alerts, receipts, archived state, and Undo.
- Migration is idempotent: merge old star/must into Must; retain priority as order; move an assigned task Purpose to Notes; preserve an unassigned Purpose as Why; retain Area rating and persist `colorIndex`.
- Direct and assistant-driven edits use the same validated store operations. Compound edits remain atomic.
- Capture previews and Jev grouping previews mutate nothing before Apply. A stale preview cannot overwrite a later edit.
- Calendar access is read-only. No silent calendar, Samsung Clock, wallpaper, or external-service write is part of this surface.

## Accessibility and native behavior

- CSS pixels map to Android dp; WebView text zoom follows the effective phone font scale. Capture refreshes its large-text layout when phone status changes. No text role is smaller than 12px before scaling.
- Every interactive target is at least 48 × 48dp; visible icons may remain 24dp.
- Content reflows at 200%. Remove lower-value metadata before shrinking or clipping a title. Bottom navigation labels remain visible.
- Status never depends on color alone: overdue includes a word, Must uses a star, completion uses a check, and Area color appears with readable context.
- Honor system bars, display cutouts, the actual IME, predictive Back, locale date formatting, and Remove animations.
- The desktop browser and native home widget retain their separate design and delivery boundaries. The historical pixel-garden and Frosted Night layouts are not fallback styles; current Capture authority is the scoped token system and accepted Capture contract.

## Finish boundary

Implementation is not release. Verify source tests, Android build and lint, generated-asset parity, emulator journeys, dark/light themes, normal/200% text, details, Capture, keyboard, Timeline edge cases, migration on a copy, and data restoration. Record emulator evidence separately from physical-phone, TalkBack, live AI, live speech, audible-alert, install, publication, and external-integration status.

Current evidence and remaining limits are in [ux-2026-09-26/verification.md](ux-2026-09-26/verification.md).
