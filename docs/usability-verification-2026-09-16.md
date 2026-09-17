# RPM 0.11 usability verification

Date: 16 September 2026. Package: `com.rpm.prototype`, version `0.11-usability` (11).

## Scope and result

User-reported capture/goal/Open regressions, removal of planner drag/drop, integrated Settings, widget text size, and common visual hierarchy across the Android capture and planning surfaces. Research used official Apple HIG and Android accessibility guidance; implementation used Sol high agents and research used Luna medium, as requested.

## Automated checks

- `node --test android-companion/*.test.mjs chat-prototype/*.test.mjs cli/*.test.mjs`: 182 passed, 0 failed.
- `bash scripts/build-debug.sh`: assembleDebug, lintDebug and assembleDebugAndroidTest succeeded. Lint: 0 errors, 24 warnings.
- Companion instrumentation: 57 checks passed.
- Compatibility instrumentation: 38 checks passed.

## Emulator journeys

Owned API 36 emulator; synthetic fixtures and the user's supplied 159-character reproduction text. No live-provider request was used to substitute for direct navigation checks.

- Legacy Goal suggestion opens Life → New goal, with an editable title and all source words retained in Notes/original capture. Editing, Back and reopening preserve the draft; saving creates a goal without a second chat request.
- Legacy saved task message renders a separate Task created label and a lighter italic title. Open navigates to the exact task ID; message count remains unchanged. A target removed after rendering produces visible local feedback: “That saved item no longer exists.”
- Explicit Complete, Undo and Move work. Planner contains no drag/drop or resize handles. A real touch swipe scrolls 452 CSS pixels with task data unchanged.
- All five destinations have matching visible and selected navigation. Settings remains in the same WebView; Back returns to the preceding planner destination. Dismissing the native sound chooser returns to that same Settings instance.
- Widget text scale persists at 160% and applies to capture while planning remains at system scale. Capture expands for enlarged text; Settings has a preview and an 80–160% range.
- Keyboard-visible goal form keeps Save above the Android keyboard. First Back hides the keyboard while retaining the editor.
- Normal portrait, narrow phone at 200% system font, landscape, populated planning, long goal text empty RPM, and compact saved/error receipts were inspected. No whole-document horizontal overflow at 352 CSS px or landscape 884 CSS px. Full Android screenshots were used to verify the translucent widget because CDP screenshots distort its composited header.
- 17 scripted end-to-end UI assertions passed in the final functional pass.

## Corrections from rendered review

The first visual pass found tall compact receipts centered above their reachable scroll origin. Receipts now start at the reachable top; Open remains visible. Local errors are visible in capture. Goal title uses a multiline input, editable content precedes the expandable original text, and the editor's obsolete drag-handle decoration is removed.

A configuration pass found that Android font-size changes recreated the activity and reopened its old launch target. Both activities now handle font-scale configuration changes in place. Emulator assertions confirmed that switching system size from 100% to 200% and back retains the same WebView, the selected RPM/Settings destination, and the closed editor. The corrected large-text capture shows RPM at 352 CSS px, with no document-wide horizontal overflow.

## Evidence

Local QA captures: `.impeccable/review/usability/` (ignored developer artifacts). The fixture scripts are in `testing/planner/` and are excluded from APK assets. Research: [Apple/Android notes](research/apple-ui-guidance-2026-09-16.md). Direction: [usability design](usability-design-2026-09-16.md).

## Limits

Physical-phone behavior, TalkBack, tablet layouts, live AI-provider output, and real calendar/notification/audio delivery were not verified in this update. Deterministic provider-response regressions and actual emulator routing were verified. Existing lint warnings remain.

## Final review and packaging

- Independent finish verdict: **ship** after three bounded fixes: 88px scrollable large-text navigation, save feedback clear of Add/Search and navigation, and one accessible local Open error retaining the receipt.
- Emulator assertions confirmed selected Settings stays visible when the system font changes to 200%, all labels fit their own targets, real nav swiping scrolls without changing the destination, and status refreshes retain manual nav scroll.
- Notice/action/navigation rectangle intersections are empty in portrait and landscape.
- All 61 backed-up files (private companion data, preferences and WebView storage) were restored byte-for-byte. A configuration restart initially touched one legacy sync preference; stopping the app after configuration settled and restoring again resolved it. Original system font scale, display size and rotation were restored. The app is left stopped.
- Final APK: `releases/rpm-0.11-usability.apk` (2,051,409 bytes), also copied to `output/RPM-Night-latest.apk`.
- SHA-256: `043a2444f646bb980286f8c1ebc54eb779f2f2dc5e474e606574f8a4e4bfdad6`.
- APK signature verifies and matches the previous 0.10 release. Package metadata is version code 11 / `0.11-usability`; bundled runtime/styles match source. No QA fixture or research/document assets are bundled.

## Release submission

The final APK was submitted as a document to the exact WhatsApp group **Noted**, using stable request ID `936af2fa-3e8e-428e-851d-45ac1e42cbbd`. WhatsApp returned a message ID and matching file hash. Submission does not establish delivery to every group member or reading. The release journal is `releases/rpm-0.11-usability.delivery.json`.
