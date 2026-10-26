# Standalone website: progress log

Done condition (pass/fail): the website adds, edits, completes and captures (with AI) a task while the phone is offline; the phone shows it after reconnecting; a same-task conflict resolves by the written rule with no loss; `npm test` passes; `npm run ci:emulator` passes; the Site is published after merge; the APK is built, with its install reported separately.

| When | Step | Result |
|---|---|---|
| 2026-10-27 | Grounding (4 scouts) | Facts in `brief.md`. Phone writers bypass `editPlan`; task IDs are `max+1`; Undo is whole-document. |
| 2026-10-27 | User decision | Copy vault key `anthropic` to Convex prod as `ANTHROPIC_API_KEY`: approved. |
| 2026-10-28 | Architect arena | Two runners (Opus high, GPT-6.1 Sol high) restarted after a PC reboot wiped `/tmp`. Files in `~/.cache/arena-standalone/`. |
| 2026-10-28 | Arena pick | Judge (GPT) preferred candidate 2; I kept candidate 1's merge rule and grafted judge fixes. Reason: candidate 2 parks a whole offline phone batch on one conflict. |
| 2026-10-28 | Interrogate (Opus, GPT) | Agreed blockers: in-flight edits, partial-pull repair, coupled fields, tabs, Capture retries. Redesigned as v2: website and Capture write on the server through `editPlan`; only the phone merges. Reviews in `arena/`. |
| 2026-10-28 | Unit 3 spike (`spike/u3-capture-convex` d709767) | Capture runs in a Convex Node action; a lost reply keeps one task and one model call. NOT VERIFIED for time zone: `process.env.TZ` and `Intl` stay UTC inside Convex, so 5 pm saved as 17:00Z. Unit 3b builds a zoned `Date` wrapper with an equivalence test. |
| 2026-10-28 | Unit 3b (`build/u3b-zoned-time` 0a39ab6, merged) | VERIFIED: `withTimeZone` makes a UTC Convex Node action save 5 pm India time as 11:30Z. Equivalence tests 4/4 against real `TZ` processes (rerun by me under `TZ=UTC`). |
