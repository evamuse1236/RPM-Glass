# Voice mode (Gemini Live)

The user talks; Gemini Live changes the plan through tools. Three places: the phone's Capture sheet (opened by the home widget's mic and by the planner's Add hold), and the website's Capture. Approved after the `npm run ramble` prototype (2026-10-27).

## Facts this design rests on (measured 2026-10-27)

- `gemini-3.8-live` over `BidiGenerateContent`: audio out only (`TEXT` closes with 1007), manual activity detection, tools as `functionDeclarations` with `parametersJsonSchema`. 5 of 5 changes right on a 21 s ramble; first change 2.3 to 2.8 s after stop.
- Short-lived tokens work: `POST v1alpha/auth_tokens` with `bidiGenerateContentSetup` locks the model and setup; the socket opens on `BidiGenerateContentConstrained?access_token=` with no key (probe in `scripts/ramble/probe.mjs`).
- The prototype's silent reply was ours, not Gemini's: the take ended at the turn that answered `finish`, and the spoken sentence (about 290 KB of audio) arrived 1 s later. Without `finish` the reply arrives in the next turn, which has no tool call.

## Key handling

Every surface uses the same browser client (`voice-client.mjs`) with a one-use token that locks model, prompt and tools. Only the token's source differs.

| Surface | Who holds the key | Token source |
|---|---|---|
| Phone (Capture, widget, planner) | Java, in its own encrypted preference (`GeminiKey`), pasted in Settings. It is not a `CompanionKey.Service`, so the model gateway can never send it to another service. | Bridge action `voiceToken`: the page sends the setup, Java forces the model name, mints the token with the key in the `x-goog-api-key` header, and returns `{token,url}`. CSP `connect-src` allows only `wss://generativelanguage.googleapis.com`. The WebView grants only audio capture, only to `https://rpm.local`, only after Android's `RECORD_AUDIO` permission. |
| Website | Convex env `GEMINI_API_KEY` | `POST /v1/web/voice-token` (browser auth like the other `/v1/web` routes, its own quota of 30 an hour). The server builds the setup itself from the request's time zone. |

The key never reaches page code. `npm test` greps built assets for the key prefix `AIza`. A token opens one session within a minute and lasts ten.

## Shared core (`android-companion/voice/`)

Pure modules, used by the phone page, the website and the ramble prototype:

- `voice-tools.mjs`: the tool list, the system prompt, `planView(data)` and `toolOps(data, name, args)`, which turns one call into planner ops. Every op is an existing `editPlan` op.
- `voice-client.mjs`: mic (`getUserMedia`, a 16 kHz AudioWorklet), socket and the 24 kHz reply. Limits: 10 s to connect, 2 min of talk, 30 s to answer after stop.
- `voice-turn.mjs`: one ramble. It takes server messages and returns client messages, applies each tool call to a working copy at once (so the answer carries real ids), and ends on the first finished turn with no tool call. It returns `{heard, said, ops, uuids, changes, failed}`.

### Tools

| Tool | Op |
|---|---|
| `get_plan` | none; tasks, Blocks, Projects (with `goalId`), Goals (with `areaId`, year), Areas with ids, priorities and purposes |
| `save_task` (add or change; `done` completes, `done:false` reopens; a time replaces the day and a day replaces the time) | `saveTask`, `reopenTask` |
| `delete_task` | `archiveTask` (Trash, restorable) |
| `move_task` (to a Block or the Inbox, optional before) | `moveTask` |
| `order_block` (task ids in priority order) | `saveTask` with `priority` per task, so a replay never needs the whole Block |
| `save_block` (title = result, purpose, Project) | `saveEntity` blocks |
| `delete_block` (its tasks go to the Inbox) | `removeEntity` blocks |
| `save_project` (title, purpose, `goalId`) | `saveEntity` projects |
| `save_goal` (title, purpose, `areaId`, year; a new Goal is yearly, this year) | `saveEntity` goals |
| `save_area` (title, purpose, rating) | `saveEntity` areas |
| `delete_project`, `delete_goal`, `delete_area` | `removeEntity` (Blocks, Projects or Goals stay, unlinked) |

"Add a Block to a Project" is `save_block` with `projectId`; "remove it" sets `projectId: null`. A Block reaches an Area through Project, then Goal, then Area (decided 2026-10-28: no direct link). "Put X in Health" links its Project to a Goal of Health with `save_project goalId`, and adds a yearly Goal first when Health has none this year; a Block with no Project goes into a fitting Project or a new one. The model says what it chose. Blocks have no saved order (decided 2026-10-28): the planner lists them by deadline, so "prioritize a Block" means the order of its tasks (`order_block`) or its Musts, and a request to move a Block itself changes nothing and gets that explanation out loud. Removing a task is always Trash, never a hard delete.

`finish` and `keep_note` are dropped. The phone's mic stops and the ramble is saved when Capture goes to the background. the reply is the spoken sentence, and an idea that is not a task becomes a task only if asked; otherwise the model says so out loud.

### One ramble, one batch, one Undo

A ramble is one press of the mic: start, talk, stop, and the model's answer.

1. Each tool call runs on a working copy inside `withIds`, so new Block, Project and Area ids are recorded, and the answer carries real ids. A new session opens for every press, so no old id carries over.
2. As soon as the model starts answering (the transcript is complete), the words are saved in `intentV2.captures[id]` with `source: 'voice'` and `status: 'captured'`.
3. When the turn ends, one save holds the words' final status and one `batch` op with every change. The capture keeps `voice.undoEvent`, the batch's last planner event.
4. The ramble's Undo (Discard on the phone) works only while that event is the newest planner change; otherwise it says to undo in the planner. Undo never touches the words. After Capture closes and opens again, History lists the ramble with its changes and offers Discard while it is still the newest change (`rambleUndoable`, decided 2026-10-28).
5. If the batch fails, the socket drops, or a replay on newer data would give a new task a different id than the model was told, no change is saved and the words stay with `lastError`, so Capture's Retry reads them as text.
6. A save that meets a newer version reloads and replays the batch with the same ids (`retryOnChange`).

The website does the same through one `plan` command holding the batch (its Undo is that command's server inverse). It saves the words with a `capture` command whose `args.source` is `voice`; the contract allows it and the server saves it without scheduling the text model (cloud test). The mic stays off while an earlier change is still unsent (`pendingIds`), so a ramble never meets the WAITING refusal.

## UI states (Capture on phone and website)

| State | Shows |
|---|---|
| `connecting` | mic button busy |
| `listening` | pulsing mic, "Listening", the words heard so far; tap the mic or Done to stop. Gemini sends its transcript only after Stop (measured 2026-10-28, `scripts/ramble/transcript-timing.mjs`), so the website shows the browser's own interim words (`web/app/live-words.mjs`) until Gemini's words replace them; only Gemini's are saved. The phone shows no live words (decided 2026-10-28). |
| `working` | "Saving your changes"; each change appears as a row as its tool call lands |
| `done` | receipt card: one row per change with its icon, the spoken sentence, and Undo |
| `failed` | "Your words are saved." with Retry (text Capture) |
| `no-mic` | "Allow the microphone to talk to RPM." with a Settings button; typing still works |
| `no-key` | Phone: falls back to the system dictation as today. Website: the mic is hidden. |

The home widget's mic opens Capture already listening (`com.rpm.widget.voice` already calls `rpmStartVoice`). The planner's Add hold opens the same Capture; its mic is the same button.

## Out of scope

Calendar events, habits (water, meals), review steps. A saved order of Blocks (they sort by deadline). Hands-free activity detection. A spoken answer to a question without a new press.

## Verification

- Core: unit tests for `toolOps`, folding, one-batch Undo, words kept on failure, replay with the same ids.
- Live eval: `node scripts/ramble/probe.mjs <wav>` runs a recording through Live with the shared core and prints the changes; recordings for each tool family.
- Phone: `verify-rpm-glass` drive with a recorded ramble fed to the emulator mic, at `display phone`; read back with `rpmctl state`. The real widget and Samsung behavior are UNVERIFIED.
- Website: a browser drive with a fake mic stream from a recording; the planner shows the changes; one Undo reverts them.
