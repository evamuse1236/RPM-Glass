# Pi on the VM: headless service, Telegram, one RPM tool (ticket 17)

Date: 2026-10-18. Labels: **stated** = a primary source says it; **measured** = I ran it on oracle-vm; **inferred** = my reasoning; **UNVERIFIED** = not run.

Primary sources used:
- Pi 1.3.0 docs installed on the VM, read in place: `~/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent/docs/` (cited below as `docs/<file>`). Same text as https://pi.dev and https://github.com/earendil-works/pi/tree/main/packages/coding-agent/docs.
- Pi announcement: https://earendil.com/posts/pi-1-0/
- Pi Durable README: https://github.com/earendil-works/pi/blob/main/packages/durable/README.md
- Telegram Bot API: https://core.telegram.org/bots/api#getupdates
- Telegram bridge READMEs: https://github.com/badlogic/pi-telegram, https://github.com/earendil-works/pi-chat

## 1. Headless and service modes

| Mode | Lifetime | Fits a service? | Source |
|---|---|---|---|
| Print (`pi -p "..."`) | One run, prints final text, exits | As a one-shot per message. Costs a ~1.5 s start each time. | stated `docs/cli-integration.md`; start time measured (vm-agent-test: 1.5 s) |
| JSON (`--mode json`) | One run, JSONL events, exits | Same as print, with events. | stated `docs/cli-integration.md` |
| RPC (`--mode rpc`) | Long-lived child process. JSONL commands on stdin, events on stdout. | Yes. Best match for a bridge. | stated `docs/rpc.md`, `docs/rpc-commands.md` |
| SDK (`createAgentSession`) | In-process in a Node host | Yes, if the bridge is TypeScript and wants no child process. | stated `docs/sdk.md` |
| Pi Durable | Separate package, not the coding agent | Not needed for this job. | see below |

RPC facts (stated, `docs/rpc.md`, `docs/rpc-commands.md`):
- Start: `pi --mode rpc` plus normal CLI options (`--provider`, `--model`, `--session-dir`, `--no-session`).
- Send `{"type":"prompt","message":"..."}`. The reply `success:true` only means "accepted". Read events until `agent_settled` to know the turn is over.
- While a run is active, a new prompt must say `"streamingBehavior":"steer"` or `"followUp"`, or it errors. A bridge must handle this for fast double messages.
- Closing stdin shuts Pi down in an orderly way. Stdout is protocol only; logs go to stderr. Split records on LF only (not Node `readline`, which also splits on U+2028/2029).
- `RpcClient` is exported from `@earendil-works/pi-coding-agent` and wraps this for TypeScript. Example: `examples/rpc-client.ts`.
- `get_last_assistant_text` returns the final reply text (stated, `docs/rpc-commands.md` index).

Pi Durable (stated, README and announcement):
- "A durable agent harness." Turns, tool calls and state are committed to storage; after a crash, reopening storage resumes. Backends: memory, SQLite, JSONL, Cloudflare Durable Object.
- It is built on `pi-ai` and `chord`, runs on plain Node, and is labelled "Experimental. The API changes without notice between releases."
- The README does not mention the coding agent. It has its own `read/write/edit/bash` tools. It is a different harness, not a mode of `pi`. It is not installed on the VM (the install has `pi-agent-core`, `pi-ai`, `pi-codemode`, `pi-coding-agent`, `pi-mcp`, `pi-telemetry`, `pi-tui`; measured with `ls`).
- Inferred: skip it. The coding agent's own session files already survive a restart (section 5), and an experimental API adds risk.

Running it as a service (inferred from the above, UNVERIFIED on this VM): a systemd unit that runs the bridge; the bridge spawns `pi --mode rpc`. If the bridge dies, systemd restarts it, and the bridge restarts Pi with `--continue`.

Security note (stated, `docs/security.md`): Pi has no per-call approval and runs with the permissions of its account. The doc names a container/VM as the strongest boundary. The VM is already that boundary, but the account also holds `~/.secrets`. Restrict tools (section 3).

## 2. Telegram

Existing bridges (stated, READMEs):
- `badlogic/pi-telegram`: a Pi extension. Polling (the README says "stop polling"). The first DM user to send `/start` becomes the only allowed user. Text is forwarded with a `[telegram]` prefix; messages sent while Pi is busy are queued; long replies are split under 4096 characters. It is set up with slash commands (`/telegram-connect`) inside a running Pi session. **UNVERIFIED**: whether it works under `--mode rpc` with no terminal. Also, "first user wins" is a weak lock for an always-on bot; I would rather pin the chat ID.
- `earendil-works/pi-chat`: Discord and Telegram. Each channel gets its own Gondolin micro-VM under QEMU, plus tmux workers. Inferred: far too heavy for a 954 MB VM (QEMU guest per chat). Skip.
- Others exist (Qusic, boyuruan, NicholasMGreen, jalyfeng, acarerdinc). I did not read their source. One (`bottomash/pi-telegram-bridge`) needs a webhook and a tunnel, so it is the wrong shape.
- Pi's own docs and the announcement do not mention Telegram (measured: grep of the installed docs found nothing).

Long polling needs no open port (stated, Bot API): `getUpdates` is "long polling"; `timeout` is seconds (default 0 = short polling); `offset` must be "greater by one than the highest" `update_id` seen, and an update is confirmed once you call with a higher offset. It "will not work if an outgoing webhook is set up", so never call `setWebhook`. The VM makes only outbound HTTPS calls to `api.telegram.org`. (Inferred: no inbound port, no Oracle firewall change. Reachability from the VM: measured `fetch("https://api.telegram.org/")` returned HTTP 200 from the VM.)

Smallest bridge to write (inferred design, about 100 lines of dependency-free Node 22, global `fetch`):
1. Read the token and allowed chat ID from `~/.secrets/TELEGRAM_BOT_TOKEN` and `~/.secrets/TELEGRAM_CHAT_ID` (never argv or logs).
2. Loop `getUpdates?timeout=50&offset=N`. For each update, advance the offset. Ignore any update whose `message.chat.id` is not the allowed ID (stated: `message.chat.id` and `message.from.id` exist on each update). Also check `from.id` equals the same user for group safety.
3. Spawn one `pi --mode rpc --session-dir ~/.pi/telegram-sessions --continue` child with the same working directory every time. Send `{"type":"prompt","message":text}`; use `"streamingBehavior":"followUp"` if a run is active.
4. On `agent_settled`, send `get_last_assistant_text`, split at 4096 characters, and call `sendMessage` to the allowed chat. Send `sendChatAction typing` while it runs.
5. Respawn Pi on child exit. Log update IDs only, never message text or tokens.

Session memory per message: RPC keeps one live `AgentSession`, so each prompt sees earlier turns. `--continue` reopens the most recent session in that working directory after a restart (stated, `docs/sessions.md`, `docs/cli.md`).

## 3. Custom tools (one HTTP tool for a future RPM/Convex route)

- MCP is built in (stated, `docs/mcp.md`): stdio or streamable HTTP servers, configured in `~/.pi/agent/mcp.json`; tools appear as `mcp__<server>__<tool>`; headers can use `${ENV_VAR}`; SSE is not supported; `pi mcp list` checks connections. Disable with `--no-mcp`. RPM would first need to expose an MCP server, which is more than one HTTP route.
- Codemode (stated, `docs/codemode.md`): the `codemode` tool lets the model write a JavaScript script that calls other tools, in a QuickJS sandbox with no network or file access. Scripts reach the outside only through tools. Enable with `pi --tools +codemode`. It saves turns when many tool calls are chained; it is not needed for one tool. (Codemode's remote sandbox variant needs Cloudflare Durable Objects; the local one does not. Stated, `pi-codemode/README.md`.)
- Extensions (stated, `docs/extensions.md`): a TypeScript file whose default export receives `pi` and calls `pi.registerTool({name, description, parameters (TypeBox), execute})`. Place it at `~/.pi/agent/extensions/<name>.ts` or load it with `-e path`. Pi compiles it with `jiti`, so no build step. Throw from `execute()` to report a failed tool. The extension runs in the Pi process with full permissions.
- Skills (stated, `docs/skills.md`): a `SKILL.md` directory with instructions (and scripts). Only name and description sit in the prompt; the model reads the rest when needed. A skill that tells the model to run `curl` through `bash` would also work, but gives the model a general shell (worse for safety).

Recommended: an extension, not MCP. Sketch (inferred from `examples/extensions/dynamic-tools.ts` pattern; **UNVERIFIED**, not run):

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFileSync } from "node:fs";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "rpm_add_capture",
    label: "RPM add capture",
    description: "Save one captured thought to RPM. Use the user's exact words.",
    parameters: Type.Object({ text: Type.String() }),
    async execute(_id, params, signal) {
      const key = readFileSync(`${process.env.HOME}/.secrets/RPM_API_KEY`, "utf8").trim();
      const r = await fetch(process.env.RPM_URL!, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify(params),
        signal,
      });
      if (!r.ok) throw new Error(`RPM ${r.status}`);
      return { content: [{ type: "text", text: await r.text() }], details: undefined };
    },
  });
}
```

(The `execute` third argument being an abort signal is my assumption from the `ctx`/`signal` wording in `docs/extensions.md`; check `extensions/types.ts` before relying on it.)

Restrict the model to that tool (stated, `docs/cli.md`): `--no-builtin-tools` keeps extension tools and drops `read/bash/edit/write`; `--tools` is an allowlist; `--exclude-tools` is a denylist. For a chat bot, run `pi --mode rpc --no-builtin-tools --no-skills --no-context-files -e ~/.pi/agent/extensions/rpm.ts` (flags stated; the combination is **UNVERIFIED**). This stops a prompt-injected Telegram message from reading `~/.secrets`. Only the one chat ID can reach Pi, which already limits exposure.

## 4. Scheduling

- Built in: none found. Measured: a grep for `cron` and `schedul` in the installed docs only hit retry/compaction scheduling, not job scheduling.
- Option A (inferred, simplest): a timer inside the bridge (`setInterval` or a tiny "at 08:00" check) sends a prompt through the same RPC child. No second Pi process, so no extra ~120 MB.
- Option B (inferred): `systemd` timer or cron runs `pi -p "<prompt>" --continue` plus a `curl` to `sendMessage`. A second Pi process runs only during the job (~120 MB for ~10 s, measured in the loop test), and it shares the session file; two writers at once could clash. Use A or serialise with a lock.
- Option C: the schedule lives in RPM/Convex, which calls the bridge. That needs an inbound port, so not for now.

## 5. Memory and persistence

- Sessions persist by default as JSONL under `~/.pi/agent/sessions/`, grouped by working directory (stated, `docs/sessions.md`). `--session-dir` or `PI_CODING_AGENT_SESSION_DIR` moves them. `--no-session` makes them ephemeral.
- Context: Pi sends the active branch. When the context nears the model limit, auto-compaction adds a summary and keeps recent messages; originals stay in the file (stated, `docs/sessions.md`, `docs/compaction.md`).
- Standing instructions: `AGENTS.md`/`CLAUDE.md` in the agent dir or working directory are loaded each session (stated, `docs/configuration.md`). This is the place for the bot's persona and rules.
- Small durable values: codemode `store`/`load` persist JSON in the session (stated, `docs/codemode.md`). Extensions can use `pi.appendEntry()` for data outside model context (stated, `docs/extensions.md`).
- No built-in long-term memory across sessions (measured: grep for "memory" in the docs found only llama.cpp and in-memory session notes). `pi-chat` advertises "memory" but needs micro-VMs. Inferred: keep durable facts in RPM itself (via the tool) rather than in Pi.
- Cost caution (inferred): one endless session grows token cost per turn until compaction. A daily `new_session` command (stated, `docs/rpc-commands.md`) is a reasonable reset.

## 6. RAM estimate

| Piece | MB | Basis |
|---|---|---|
| Pi 1.3.0 idle (`pi --version`) | 114 | measured, vm-agent-test-2026-10-18.md |
| Pi during a 5-turn tool loop | 120 | measured, same file, process tree peak |
| Node 22 process doing one HTTPS fetch | 63 | measured today (`process.memoryUsage().rss`) |
| Bridge (polling loop plus JSON parsing) | 45 to 65 | inferred from the 63 above |
| **Total, bridge plus long-lived Pi** | **about 170 to 190** | inferred |

- Headroom: at test start the VM had 428 MB used and 525 MB available; just before my check, 536 MB available (measured). So the setup fits with about 350 MB spare (inferred).
- A long-lived Pi will grow with session length and extension use. The 120 MB was a short session with built-in tools, no MCP, no codemode. Add 20 to 50 MB of margin for a long chat (guess). A systemd `MemoryMax=400M` on the unit makes a leak restart instead of starving other services (inferred).
- I could not read idle RSS of `pi --mode rpc` itself today (my sampler missed the process), so that row is not measured. I did confirm `pi --mode rpc --no-session --offline` starts and answers `get_state` on the VM.

## Smallest setup

1. User runs `C:/Repos/tools/vm/bin/vm secret set TELEGRAM_BOT_TOKEN` and pastes the token from @BotFather (new bot: `/newbot`).
2. User sends any message to the new bot, then gives me their numeric chat ID. (I can read it from one `getUpdates` call on the VM with the token read from the file. Never print the token.) Then `vm secret set TELEGRAM_CHAT_ID`, or I write it to `~/.secrets/TELEGRAM_CHAT_ID` (not a secret, but keep it with the others).
3. I write the ~100-line bridge to `~/work/pi-telegram/bridge.mjs` on the VM (section 2, steps 1 to 5). Test with `vm run` before making it a service.
4. I write `~/.pi/agent/extensions/rpm.ts` with one tool. For the first test the tool can call a stub URL. The real RPM/Convex route comes later and needs its own key (`vm secret set RPM_API_KEY`).
5. I write `~/.pi/agent/AGENTS.md` with the bot's rules (short replies, keep the user's exact words, use `rpm_add_capture` for captures).
6. I add a user-level systemd unit `pi-telegram.service` running `node bridge.mjs`, with `Restart=always`, `MemoryMax=400M`, `loginctl enable-linger ubuntu` so it runs without a login. (Needs `sudo` for linger; ask before doing it. No ports opened.)
7. Check: send "hello" from the user's phone, then "remember: buy milk" and confirm the tool call reached the stub. Restart the service and send "what did I just say?" to prove session memory survives. Measure `ps` RSS of both processes and update section 6.
8. Add scheduling as a timer inside the bridge (section 4, option A) only after steps 1 to 7 pass.

**User must provide:** (a) the Telegram bot token via `vm secret set TELEGRAM_BOT_TOKEN`; (b) their numeric Telegram chat ID (or one message to the bot so I can read it); (c) approval for `loginctl enable-linger` on the VM; (d) later, the RPM route URL and a key.

**Open risks:** custom extension and flag combination in RPC mode not run (UNVERIFIED); `execute()` signature not checked against `types.ts`; Pi idle RSS in RPC mode not measured; Haiku cost per chat turn not estimated.
