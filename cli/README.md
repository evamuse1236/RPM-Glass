# RPM — plans and check-ins

Run from the project directory:

```sh
npm run cli
```

Run `npm install` on a fresh checkout. This command uses local rules and needs no credentials. Node 26 was used for verification.

To interpret rambles with **DeepSeek V4.1 Flash through OpenRouter**:

```sh
npm run cli -- --ai --key-file /path/to/private/openrouter.env
```

The private file contains `OPENROUTER_API_KEY=...` and must have owner-only permissions (for example `chmod 600`). Keep it outside the project. An explicit key file takes precedence over the environment. Alternatively set `RPM_OPENROUTER_KEY_FILE` or `OPENROUTER_API_KEY` in your environment, then run `npm run cli -- --ai`. Never paste a key into the capture prompt.

The exact model is `deepseek/deepseek-v4.1-flash`, verified against OpenRouter's official catalog on 10 September 2026. The CLI never switches models. Each new note or change request makes at most one API request. Commands, numbered choices and direct answers to a question stay local.

Write a note. It saves when you press Enter. Each plan or check-in gets a terminal bubble showing its time, minutes and other known details. The numbered choices depend on the entry: a plan with an alarm offers **Use a reminder**; a check-in with no duration offers **How long?** You can choose a number or keep writing. Use `/options` to show the choices again.

```text
capture › Meeting with Riya tomorrow at 9am
Saved
╭──────────────────────────────────────────────╮
│ #1 · Plan                                    │
│                                              │
│ Meeting with Riya                            │
│ Thu, Sep 10, 9:00 AM · 30 min estimate        │
│ (default)                                    │
│ Alarm · Thu, Sep 10, 8:50 AM                  │
│                                              │
│ [1 Change time] [2 Set minutes]               │
│ [3 Use a reminder] [4 Add purpose]            │
│ [5 No alert]                                 │
╰──────────────────────────────────────────────╯

capture › Move that meeting one hour later
Changed. Your original words are still saved.
...shows 10am, with the alarm at 9:50am...
```

The example uses a fixed test date. Your CLI uses your computer's date and timezone. Bubbles fit 48- and 80-column terminals. They are keyboard choices, not mouse buttons.

With `--ai`, ask for changes in your own words:

- `Move the meeting with Riya to Friday at 10am`
- `Use a reminder instead`
- `Change the walk to thirty minutes and set energy to high`
- `Cancel the milk reminder`

The CLI finds older entries by name or `#ID` using local data. If two meetings match, it asks which one. If a time needs more detail, it asks a short question such as **Morning or evening?** No fields change until the answer is complete. A clear edit applies immediately; there is no extra confirmation. Original words and earlier versions stay saved. Canceling a plan stops its alert but keeps the plan in history.

Change one entry at a time. Names use simple word matching, not full meaning-based search. If no name matches, choose an entry or use `#ID`. “It” refers to the selected entry in this session. A restart does not select an old entry for you.

During a question, the prompt changes to `reply ›`. Type a number or a short answer. `/cancel` leaves the question without making the proposed edit. `/new Some other thought` saves a new note; it cannot edit an earlier entry. `/show ID` selects an existing entry for local commands. Without `--ai`, bubbles and commands still work, but free-form change requests need AI.

Useful commands: `/duration`, `/purpose`, `/purposes`, `/next`, `/history`, `/show`, `/done`, `/result Desired result | Purpose`, `/results`, `/link ID`, `/remind`, `/alert`.

The CLI now schedules alerts automatically for timed captures. Fixed commitments (meetings, appointments, interviews, flights, classes) get an alarm 10 minutes before the event. Flexible tasks get a desktop reminder at their planned time. Explicit reminder/alarm requests override these defaults. `/alert` changes the type, `/alert off` disables it, and `/dismiss` stops ringing. Keep the CLI open and the computer awake; there is no background service or wake-from-sleep guarantee. Overdue scheduled alerts are delivered when the CLI next runs. Previously saved preview alerts remain inactive. Desktop delivery uses `notify-send` and repeating sound uses `pw-play`.

Without `--ai`, no cloud service receives entries. Local rules handle supported conversational dates and infer editable mood/energy values from feeling words, preserving evidence. They do not understand arbitrary language or split multiple tasks reliably. Mixed or unresolved dates require editing with `/time`. Unreported actual duration stays unknown.

With `--ai`, only the **new note or change request**, current mode, reference time and local timezone are sent to OpenRouter and its model provider. History, reusable purposes, existing results and previous conversations are not uploaded. Your words are saved before the request starts. Once checked, one ramble can become multiple plans/check-ins. Each keeps the complete original text, its supporting phrases and earlier versions. Current feelings attach to a check-in; if the ramble contains only plans, they become a separate check-in. A stated purpose is kept. A missing plan duration remains a visible 30-minute estimate; missing actual duration stays unknown.

The model extracts relative date phrases, corrected times and intent. `chrono-node` resolves dates locally; local code subtracts the ten-minute alarm lead. Ambiguous or unsupported times stay unscheduled and get a focused follow-up. Answer it directly (for example `Friday at 7pm`), choose an available numbered time, or use `0` to write your own. `/cancel` leaves the saved entry unresolved; `/new TEXT` starts another capture. If multiple entries need clarification, `/show ID` and `/time` select another. Date-only plans need no immediate answer. `/show` also displays interpretation evidence and request usage/cost when reported.

If the API fails, times out, or returns an invalid response, your words stay saved. A likely change request stays in the interaction log without changing an entry. For a new note, local rules provide a fallback. **No automatic alert starts from that fallback**; check it, then use `/time` or `/alert`. Restarting does not resend earlier requests. Input lines run in order, and `/quit` waits for queued saves.

Technical limits: requests use JSON object mode with a strict local schema check, prefer the native DeepSeek provider, disable reasoning, cap output at 3,000 tokens and input at 12,000 characters, and time out after 20 seconds. OpenRouter may route a request among providers of this same model. There are no automatic application-level retries.

Data defaults to `$XDG_DATA_HOME/rpm-cli/data.json`, or `~/.local/share/rpm-cli/data.json`. Use a separate file for experiments:

```sh
npm run cli -- --data /tmp/rpm-experiment.json
```

Writes use a private file and atomic replacement. A lock prevents concurrent sessions on the same data file. Original capture text and revision snapshots survive corrections. This store is separate from Android and Convex records.

Run checks with `npm run test:cli` (81 tests). Tests make no live API calls. They cover captures, edits, name matching, short replies, choices tied to the right entry, unchanged original words, alert timing, failed saves, API failures and private key handling. See [conversation checks](experiments/openrouter-conversation-findings.md) for the synthetic live calls and terminal checks, and [earlier OpenRouter smoke findings](experiments/openrouter-findings.md) for the first capture tests. The separate HTML test chat now has opt-in conversation context; the CLI still sends only the current message.

What to refine next through use: how little the CLI should ask after a save, whether switching between plans/check-ins feels natural, and which follow-ups are worth keeping. There is no requirement to redesign the app until this interaction feels right.


## Natural entry and fewer steps

- `run at 7 a.m.` → the next 7 a.m. (today if still upcoming, otherwise tomorrow).
- `run at 7 a.m. tomorrow` and `tomorrow run at 7am` → tomorrow at 7 a.m.
- `run in 20 minutes` → a start time 20 minutes from now; `run for twenty minutes` → a 20-minute duration.
- `run tomorrow` → tomorrow, with no invented clock time.
- A bare `at 7` uses the next 7 AM/PM occurrence and labels that assumption. Multiple conflicting times remain unresolved with options to choose from. Explicit past times are not silently moved.

Choice numbers change with the visible bubbles. Each number acts on the entry beside it, even when one note created several entries. Missing fields come first. Completed plans offer **Use this plan again** and **View history**. No choice is required before saving another note.

Follow-ups provide numbered choices and **0 Write your own**. You can also type a custom answer directly. To enter a literal short duration instead of selecting an option, include the unit (`2 minutes`) or select 0 first. Custom mood/energy descriptions are stored as written. Purpose choices reuse previously entered purposes.

Automatic alerts reuse the captured time without another question. A manual change through `/alert` shows the event time and notification/ringing time before confirmation. Original inputs, inference evidence and assumptions, full typed interactions (including unrecognized replies), and revisions remain in the local JSON store. Existing records load without migration; older records do not retroactively gain inferred fields.

The interaction principle is **save first, show what was understood, offer optional corrections**. Fields should be collected from a line or a quick choice when useful, rather than becoming a mandatory questionnaire. No missing mood, purpose, or actual duration is invented to make the data look complete.

References: [Todoist natural-language dates](https://www.todoist.com/help/todoist/features/schedule-a-date-and-time-for-your-todoist-tasks-q7VobO), [Chrono parser and inference API](https://github.com/wanasit/chrono). This prototype does not claim every Todoist expression is supported; recurrence is explicitly left for later.

Conversational examples:

- `So day after tomorrow I have a meeting at seven in the morning` → 7 a.m. event, 6:50 a.m. alarm.
- `Bring my keys day after tomorrow at 8.30 am` → 8:30 a.m. reminder.
- `Tomorrow at quarter to seven in the morning, go for a walk` → 6:45 a.m. reminder.
- In `/checkin`: `I feel happy but exhausted` → Good mood, Low energy, both editable.

A fixed event less than 10 minutes away is saved with an inactive `needs_time` alert and an explanation; the CLI does not silently move its warning. Change the time or choose a reminder explicitly. Stored parser match offsets refer to the retained normalized text. The untouched original remains in `raw`.
