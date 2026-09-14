# RPM 0.9 verification log

Owned API 36 Android emulator `RPM_S24_FE`, synthetic task data, 12 September 2026. The existing private store was copied to `companion-before-v09-qa.json` before testing. No physical phone or Google events were modified. Screenshots are development-only fixtures, not bundled user goals.

## Verified journeys

- Day workspace starts at viewport y=0, with no upper app/date headers; bottom destinations are date, RPM, Projects, Life, Settings. Portrait CSS viewport 404×808, no document horizontal overflow.
- RPM shows all outcome blocks independently of Projects. Projects shows a project's block summaries; summaries open their RPM block.
- Touch drag moved task 101 from `qa-block-a` to `qa-block-b`; destination order became [103,101], source became [102] with priority 1. The task and order survived installing the next build and restarting the app.
- The task 102 checkbox persisted done=true. More actions → Delete task → confirmation persisted archived=true. Undo restored it without losing its done status. Native archive/restore checks verify alert cancellation and reconciliation.
- Capture from Projects displayed `In Prepare for the week`. Its scoped context contained that exact project ID, selected day, and no task/block IDs or personal documents.
- Live AI request: “Make an RPM block called QA discussion ready and add it here. Add a task called QA rehearse opening inside that block.” `change_planner` completed in 4.9 seconds. Saved block.projectId matched the selected project; saved task.blockId matched the newly created block. Original words were retained.
- Live compound request renamed the project to `QA calm week`, moved `QA rehearse opening` into `Have home ready`, set must=true and minutes=10, and completed `Buy essentials`. Three read-only lookups preceded one change transaction, completed in 6.7 seconds. Readback matched all fields.
- Live “Open my RPM blocks” navigated through `control_app` to the native PlannerActivity with the RPM tab selected.
- Native Android touch swipe moved task 101 into empty block `qa-empty`; persisted readback confirmed the destination. Editing task 104 to a daily series and ticking its checkbox recorded the chosen occurrence as complete while retaining recurrence=daily and done=false for future occurrences.
- Live AI set widget transparency to 40%; native readback confirmed 40. The original 47% value was then restored. Live AI created a life area, a 2026 goal under that area, and linked the existing project to that goal in one transaction; all three IDs/links were read back.
- Live “Open the alarm sound picker” opened the native Settings activity's Alarm sound dialog with phone tone/audio file/default choices. No sound selection was made. Clearing capture context removed all target IDs and the selected date. With emulator Wi-Fi and mobile data disabled, an AI create request preserved the words, returned connection_error, and created no project; both network transports were re-enabled.

## Failures found and corrected

- Capture had no planner tools: the new real-agent regression failed before the registry was added.
- Date-only requests were initially discarded by the new time adapter. A regression now checks that “tomorrow” retains plannedDate with no invented clock.
- Sparse priority/block edits could leave duplicate ranks. Manual editor and AI edits now renumber source/destination through the shared domain command.
- A live compound request exposed multiple read calls being rejected as an invalid model response. The current OpenRouter route also returns HTTP 404 when `parallel_tool_calls:false` is included; the identical minimal request without that parameter returns HTTP 200. The unsupported parameter is omitted. Bounded read-only batches are accepted; multi-write/incomplete replies are repaired without applying partial edits. The live compound request then passed.

## Checks at this stage

- 86 JavaScript tests passed, including the legacy pending-proposal upgrade regression with the new planner registry present.
- Native companion: 50 passed, including four new settings allowlist/persistence checks; original native app: 38 passed.
- Build and Android lint passed; final lint count, display matrix, reviewer verdict, signing and data restoration are recorded in the release handoff after completion.

Provider reference: [OpenRouter tool-calling documentation](https://openrouter.ai/docs/guides/features/tool-calling). The implementation follows actual route compatibility measured above, not an assumption that every documented parameter is supported by this provider route.

## Final verification

- Normal portrait, narrower 358px viewport, landscape, Android 200% font scale, real keyboard task editor and full native contextual capture were rendered and inspected. Save stays above the keyboard; Back/reopen retains a task draft; explicit Cancel clears it. Five bottom destinations remain available. Normal display preferences were restored.
- Horizontal day swipe and vertical bottom-navigation level swipe passed. Non-drag Move returned task 101 to its chosen block. State persisted across cold emulator restarts.
- Fresh reviewer verdict is ship after one fix: short timeline cards now allocate whole text lines and omit optional text that cannot fit. The 48px minimum card and resize target remain. `.impeccable/review/v09-finish-verdict.md` records the bounded review.
- A real task-editor details-only save preserved a synthetic date-only task's plannedDate=2026-09-18 and planned=null. The unchanged empty start field no longer discards its captured day.
- Final native rerun: 50 companion checks and 38 original-app checks passed. Final build/lint passed with 0 errors and 26 warnings. No test classes, QA fixture markers or private-data paths were found in the APK packaging checks. No new raster assets; provenance scan found 3 existing rasters and 0 missing records.
- Emulator test data was retained privately as companion-v09-qa-complete.json; the original companion-before-v09-qa.json was restored byte-for-byte to the active store. QA capture context was cleared; capture draft length was zero. No device data or earlier release was deleted.
