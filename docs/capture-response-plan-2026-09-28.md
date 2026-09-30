# Capture: one readable response

This contract follows the user's two phone screenshots and the completed Claude Opus 5.5 medium Batch consultation in `output/capture-response-2026-09-28/batch-review/advice.md`. It supersedes the fixed-height and transcript portions of the 27 September Capture Glass plan. The approved glass material, menu and planning data model remain in force. Routing keeps Luna none/high, with referential follow-ups upgraded to high after the recent-chat investigation.

Capture presents the latest response. A proposal uses a kind label, 17/24 semibold title, compact schedule, meaningful changes and any unanswered question. Same-day ranges show one date and one time range: **28 Sept / 2 pm to 3 pm · 1 hr**. Original words and schedule assumptions stay in an explicit Details disclosure. Titles and warnings are never ellipsized. A successful save replaces the proposal with a receipt, Undo and Open in Planner. The composer returns to “Capture a thought…”.

Previous captures and Classic messages belong in **More → History → conversation**. They remain stored and available for recovery. They do not appear as “Earlier…” sections below the current response. An unresolved legacy proposal still surfaces because it blocks a new save.

The Android window measures intrinsic content, grows upward from the bottom/right, and shrinks when the response becomes shorter. Its maximum is the actual screen space after system bars, keyboard and 24dp top clearance. Normal width is at most 372dp. Enlarged text uses the available width. Manual Expand uses the available height. The response starts at its beginning whenever its identity or revision changes. An ordinary refresh of the same response preserves scroll position. Overflow has an explicit More below control; response actions stay above the composer.

Actions occupy one row at normal size, with Dismiss, Edit, Add in increasing emphasis. When enlarged text makes the row too wide, Add wraps below the other two. Intrinsic label widths decide this, so rows that still fit stay compact. All targets retain 48dp minimum size. The empty unfocused composer is a compact row with a labeled accessible More button, writing field, microphone and Send. Focus or text expands the field. More and hold-Send retain the existing menu and draft preservation.

Waiting uses a 96dp response slot, real request state and the existing glass flow. Reduced motion removes animation. A failed save keeps the draft and offers Retry using the original action identity. Unsent text is also written through an ordered native private store; WebView localStorage remains a compatibility mirror. The typed-text bridge bypasses diagnostics. Text awaiting a send result remains recoverable if the process exits. This UI cannot fabricate model progress or successful storage.

## Deliberate adjustments to the consultation

- Multiple proposals retain atomic **Add all**. Partial selection needs transaction/dependency support and is not represented by inert checkboxes.
- A date without a time reads **Time not set**, never All day: no all-day commitment was supplied.
- Dates use the user's requested compact absolute form, avoiding stale Today/Tomorrow labels when reopening old captures. Overnight and year-boundary ranges retain both dates; repeated DST clocks retain their offsets.
- All-task batches use a single “3 proposed tasks” label instead of repeating Task above every title; mixed proposals retain their item types. This keeps the first title visible at 200% text with the keyboard open.
- Native resizing is immediate. Existing response crossfades remain bounded; a new height animation needs measured physical-device frame cost before shipping.
- Long responses remain scrollable downward at the screen limit. The interface cannot show unlimited text simultaneously, especially with 200% text and the keyboard open; it must never require scrolling upward to find the start of a newly arrived response.

## Verification

Verify the installed Android WebView over the launcher, not only a desktop preview. Cover short/long titles, ranges, date-only/unscheduled tasks, multiple proposals, ambiguity, reflection, errors, save/Undo, Details, History, menu/hold-Send and Planner draft return. Render light/dark, keyboard open/closed and 200% text. Use only the isolated `RPM_CAPTURE_RESPONSE` emulator with synthetic data and no model credentials. Report emulator tests, APK build and physical-phone installation separately.

## Follow-up review protection

An uncommitted proposal that selects an unrelated saved title from a conversational reference shows Check this draft and a brief correction request. Edit and Dismiss remain available; Add is hidden and the commit path independently blocks the same mismatch. Original words and earlier conversations remain intact. These are targeted provenance/referent checks, not a claim that every model interpretation is semantically correct. Completed implementation, live replays and physical installation are recorded in [verification](capture-response-verification-2026-09-28.md).


## Current-phone fit correction

The user's keyboard-open editing frame exposed a short-card overflow: an empty starter container still occupied footer space, a duplicate update label and vertically stacked estimate lengthened the card, and the More below row then reduced the visible response further. Single updates identify the pending change in the card heading; a numeric estimate uses one clock row. Empty starters occupy no space. Simple task changes must fit completely at the phone's 360dp width and roughly 452dp available height, with the typed words and all actions preserved. Long content remains scrollable at the physical limit.

Response cards use the existing Strong material in both themes. The shell keeps its glass and stable-size animated texture; wallpaper must not remain legible underneath response text. This extends the motion repair, rather than restoring per-frame height animation.
