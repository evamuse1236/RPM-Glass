# Local chat prototype

Historical version notes. The current persistent tool-using companion is documented in `chat-prototype/README.md` and `docs/companion-surface.md`. The in-memory storage and context exclusions below apply only to the earlier prototype.

Scope: one HTML chat screen, not an Android port or a deployed website. Visitor mode: Operate. The question is whether typing and tapping contextual choices feel like one continuous conversation. The user removed the microphone from scope after the first preview.

## Direction contract

THESIS: the conversation is the working surface. A note becomes an editable plan or check-in directly in the chat, with no dashboard or setup form.

OWN-WORLD: retain RPM's light surfaces, dark readable text, gentle lavender user messages and rounded small controls. Use a system sans-serif; no imagery or display typography is needed for this working prototype.

STORY: write a note, inspect the entry, choose a short action or ask for a change. The visible entry details show the current state; original text remains accessible.

FIRST VIEWPORT: a compact RPM header, a centered conversation no wider than 720px, and a bottom composer. Initial text says what can be entered. Three optional example chips fill the composer without sending. The signature interaction is a real entry card whose choices and direct-language edits update the same underlying entry.

FORM: user-pinned simple chat, built directly in HTML. Seed not applicable: a precisely specified narrow local prototype, not an open concept tournament. No image-generation or permanent workflow default is introduced.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Boundaries

- Real AI, confirmed by the user; localhost-only Node server.
- Per-browser test chat in memory. No production data migration or file persistence.
- No scheduled alert runtime in this visual prototype; show that limit next to alert settings.
- No microphone, recording, or speech service in this version.
- The existing Node workflow makes a server necessary; a double-click HTML mock would not safely reuse its secret key or real AI. This explicit user choice overrides the prototype skill's usual single-file/no-server default.

## Initial build and first fix — 11 September 2026

- 82 local tests passed: 81 shared CLI checks and one HTTP regression check. No paid requests in these tests.
- Real browser/AI checks: capture a meeting; change alarm to reminder with a bubble; move that same entry one hour later by typing; create a second meeting; receive a choice instead of changing an arbitrary match.
- After the user's failure report, replayed `run morning 8a` → `make it 9no` → `same` with real AI. It changed the one run from September 12, 8 AM to September 12, 9 AM. The question remained visible. The short reply was resolved locally.
- Root causes: reply evidence replaced the unresolved hour; a same-day/part-of-day reply had no local resolution path; the page kept only the current question, hiding prior questions. Regression coverage exercises the real Workflow and HTTP call sites.
- Rendered at 1440×900, 390×844 and the current 700×716 window. Fixed composer overlap by giving the conversation its own scrolling area. Confirmed all five entry choices are reachable on mobile. Screenshots are under `.impeccable/review/`.
- Mechanical design scan returned no findings. Key scan found no real key in 39 source/report files; the external key file remains mode 600. Server source/path traversal return 404; cross-origin changes return 403; the page returns 200.
- The server was restarted once for the fix, clearing the temporary test chats as announced. CLI data was not read or changed. The updated server remains running on loopback port 4317.
- Finish verdict: ship. A bounded review of the three renders found no clipping, overlap, unreadable text, or unreachable mobile controls. The chat-only design snapshot is recorded in `DESIGN.md` and `.impeccable/design.json`; it does not redefine the older Android or HTML designs.

## Context-aware conversation repair — 11 September 2026

The initial “ship” verdict concerned the rendered layout, not general conversational reliability. The user's next test exposed a broader routing flaw: AI saw only the latest text, most follow-up answers bypassed it, and the page repeated the initial question instead of displaying the latest validation message. A null normalized time plus a general uncertainty flag also incorrectly demanded a day for an otherwise valid `1pm` answer.

The user explicitly approved sending recent messages and relevant entry details from this test chat to the existing OpenRouter AI. The new chat-only adapter sends the last six messages, at most eight entry summaries, the selected entry and the current question. Typed turns can be captures, edits, answers, requests to leave a question, or non-mutating conversational replies. Bubble actions still run locally. The separate CLI data and current-text-only request contract are unchanged.

- 97 local checks pass: 81 CLI and 16 chat checks. The original HTTP failures went red before the fixes.
- Twelve synthetic real-AI calls across four conversations passed, including short corrections, the afternoon reply, day-only changes, a terse check-in, and a new topic during a question. Latency was 1.061–2.541 seconds (median 1.490 seconds); total reported cost was $0.00315804852. These are a bounded sample, not a guarantee for arbitrary conversation.
- Browser checks also verified `call deep afternoon` → `say 1 pm`, `run at 7 a tomorrow` → `maybe 8`, and an entry-specific reminder bubble. Those four additional browser AI calls are not included in the synthetic report's cost.
- A time answer survives a subsequent day question; true day alternatives remain unresolved until chosen. Unsupported recurring requests are not silently turned into a one-time schedule by a clock-only answer. AI failures keep the words in the chat without creating a speculative plan or edit.
- A source/report scan found no actual key in 42 files; the external key file remains private (mode 600).
- The updated test server uses loopback port **4318** for this handoff. The earlier server on 4317 was not stopped, preserving the user's earlier in-memory chat. No actual reminders or alarms run.

Evidence and replay: `chat-prototype/experiments/contextual-chat-results.json`, `chat-prototype/experiments/contextual-chat.mjs`, and `chat-prototype/conversation.test.mjs`.
