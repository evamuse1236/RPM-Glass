# RPM conversational companion

```sh
npm run chat -- --key-file /home/darax/.config/rpm/openrouter-20260910.env
```

Open [RPM](http://127.0.0.1:4318). `--port` selects another loopback port. The key remains server-side. Without it, saved records remain inspectable and archival/Undo work, but conversational changes need AI.

## Conversation and tools

The companion uses the user-selected `openai/gpt-5.6-luna` through OpenRouter, with medium reasoning and required native tool calls. The separate CLI retains its existing model. Native tool calling replaces the old one-entry extraction contract. Tool definitions and local validation are in `companion-tools.mjs`; the bounded agent loop and prototype-only model are in `companion-agent.mjs`.

- `read_context`: read/search all unarchived entries, memories, imported interactions and conversations, with pagination. Initial context contains up to 30 entry summaries, 30 memories and 14 recent messages; older information stays tool-accessible.
- `propose_changes`: prepare an entire batch of creates, edits, explicit preference memories, archives or restores. Each operation has its own target and current-request evidence. No partial application. Questions hold the complete proposal, including the original request and choice bubbles.
- `respond`: ordinary conversation and useful suggestion bubbles without record changes.

Clear changes apply immediately with one-step Undo. Ambiguous requests wait as persistent proposals. Existing dates and periods are inherited for bare clock corrections; `530` is normalized to `5:30`. Ordinary new plans without a time are not forced into a scheduling questionnaire. Historical cards are snapshots, marked when changed; Current plans shows the latest records.

There are at most five model steps, two invalid-argument repairs, an 18-second per-call timeout and a 45-second turn ceiling. Network/rate failures do not retry automatically or produce speculative changes. Messages are saved before inference; the UI retains drafts on transport failures. Real model/provider failure messages are reduced to safe categories without logging secrets.

## Private persistence and import

Default data: `$XDG_DATA_HOME/rpm-companion/data.json` (normally `~/.local/share/rpm-companion/data.json`), owner-only and atomically replaced. A process lock prevents concurrent companion servers using that store. `--data` selects a different companion store.

On the first start only, import the default CLI `rpm-cli/data.json`, or the source named by `--import-cli`. This is an editable COPY: nothing writes back to CLI, starts its alert runtime, or imports the separate smoke/emulator datasets. Use a nonexistent import path for an empty isolated test. Existing prototype data wins on subsequent starts. A corrupt/unknown store is not overwritten.

Conversations share one local context store. New chat keeps plans, memory and older conversations; closing/restarting does not clear them. Archive/restore is recoverable and controls active AI context. Archived conversation content is excluded from both transcript and interaction-history retrieval. Undo restores the latest data change while preserving subsequent chat history.

The one-time `import-legacy.mjs` utility imported the prior visible browser chat into the user's private test copy. Only fields exposed by the old API were available: current cards, original words, revision counts, and messages. Missing historical revision snapshots were not fabricated. Its private snapshot is retained outside the repository.

## Safety and limitations

Localhost-only server, same-origin checks, per-process request token, strict CSP, no arbitrary file serving, no browser key access, and optimistic version checks across tabs. Only one mutation request runs at a time. Every model batch runs against a clone and is committed with its response atomically.

Reminder, alarm and recurrence cards are settings previews only. No real notification delivery, calendar writes, microphone, Android overlay, or coaching. The local model loop exposes only the three tools above, not filesystem or shell access. Model interpretation can still be mistaken; inspect receipts and Undo.

HTML/CSS/client changes require a page refresh. Server/tool changes require a restart. Stop the existing companion before starting another against the same store.

## Verification

Current handoff (2026-09-11): all 114 offline tests passed. Browser checks with synthetic data passed for the launcher, expanded/mobile panel, multi-plan clarification bubbles, saved receipts and Undo. The persistent server retained 14 imported entries and two conversations; the source CLI file's SHA-256 was unchanged. The visual finish review returned `ship`.

After the requested switch to Luna, a seven-turn **live OpenRouter** check passed through the actual HTTP server and tool loop, using synthetic, in-memory records: `run at 8a` → `maybe 9` preserved the entry and day; a compound edit changed both plans; clarification held both changes and supplied choice bubbles; the answer committed both; explicit preference memory saved; older history was retrieved with `read_context`. The passing run took 1.9–3.5 seconds per turn. This is a bounded smoke test, not a guarantee of all conversational interpretations. Earlier DeepSeek probes failed with 429/timeouts.

The live check exposed and fixed two integration issues: explicit `strict:false` keeps patch fields optional rather than forcing null/empty values, and clock shorthand normalization no longer rewrites calendar years. Local schema validation remains mandatory. A small set of tool examples clarifies full-batch proposals and delegates clock-only date selection to the deterministic local parser.

`npm run test:cli` and `npm run test:chat` run deterministic offline tests. `companion.test.mjs` covers two-plan shorthand edits, atomic clarification, dropped-operation rejection, Undo, memory corrections, archive exclusion, historical retrieval, persistence, key boundaries, tool repair, timeout handling and HTTP guards.

`node chat-prototype/experiments/interface-fixture.mjs` serves a clearly labeled synthetic interaction fixture on 4320, without importing personal data or calling AI. It exercises proposal bubbles, receipts and Undo in the real browser UI.

Explicit live test (incurs OpenRouter usage, synthetic data only): `node chat-prototype/experiments/companion-live-smoke.mjs --key-file /path/to/private/openrouter.env`. It never reads or imports personal records and closes its temporary server afterward.

References: [OpenRouter tool calling](https://openrouter.ai/docs/guides/features/tool-calling), [Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna), and [strict-mode semantics](https://developers.openai.com/api/docs/guides/function-calling#strict-mode). Older `contextual-chat-results.json` validates the former extraction-based adapter, not the new agent. Live model checks and synthetic UI fixtures are separate evidence.
