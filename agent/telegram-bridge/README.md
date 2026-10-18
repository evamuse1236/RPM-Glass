# Run the Telegram bridge for Pi

This dependency-free Node 22 service forwards text from one configured Telegram chat to one long-lived Pi RPC child. Replies and scheduled prompts share a durable FIFO queue. The RPM extension reads a future `/v1/today` endpoint; it returns `RPM API not configured` until you configure that endpoint.

The code has local HTTP and child-process fixture tests. Live Telegram, Anthropic, Pi extension loading, and the systemd unit on the VM are UNVERIFIED. These instructions describe a future installation; this change does not deploy anything.

## Prepare the VM

Use the existing `oracle-vm` account and Pi 1.3.0 installation. On the PC, run these commands in Git Bash with `C:/Repos/tools/vm/bin` on your PATH. Paste each secret only into the command's stdin prompt.

```sh
vm secret set TELEGRAM_BOT_TOKEN
vm secret set ANTHROPIC_API_KEY
vm run 'mkdir -p ~/work'
vm push agent/telegram-bridge work/
```

Create the bot with Telegram's `@BotFather` if you do not already have one. Use the existing Anthropic key when it is already stored under `~/.secrets/ANTHROPIC_API_KEY`; do not overwrite it unnecessarily.

On the VM, confirm the executable paths before installing the unit.

```sh
command -v node
node --version
command -v pi
pi --version
```

The unit expects Node at `~/.local/node/bin/node` and finds Pi through PATH. Adjust `ExecStart` and PATH if the installed Node path differs. Set `PI_BIN` in `bridge.env` if Pi is elsewhere. No `npm install` is needed for this folder.

## Find your chat ID

Stop any existing poller for this bot. Send the bot a private message, then run this on the VM. It prints chat and sender IDs without printing message text or the bot token.

```sh
cd ~/work/telegram-bridge
TELEGRAM_TOKEN_FILE="$HOME/.secrets/TELEGRAM_BOT_TOKEN" node --input-type=module <<'JS'
import { readFile } from 'node:fs/promises';
try {
  const token = (await readFile(process.env.TELEGRAM_TOKEN_FILE, 'utf8')).trim();
  const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ timeout: 0, allowed_updates: ['message'] }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  if (!response.ok || !body.ok || !Array.isArray(body.result)) throw new Error();
  for (const update of body.result) {
    const message = update.message;
    if (message?.chat?.type === 'private') {
      console.log(JSON.stringify({ chatId: message.chat.id, senderId: message.from?.id }));
    }
  }
} catch {
  console.error('Chat lookup failed. Check bot setup and competing pollers.');
  process.exitCode = 1;
}
JS
```

Copy your numeric `chatId` into `ALLOWED_CHAT_ID`. The bridge checks the chat ID, not individual senders within a group. Use your private chat for access restricted to you. Telegram long polling requires that the bot have no webhook; the bridge never changes webhook configuration. See the [Telegram getUpdates reference](https://core.telegram.org/bots/api#getupdates).

## Configure and start the service

Create `~/work/telegram-bridge/bridge.env` on the VM. Replace the example ID with yours. This file contains paths and configuration, not secret values.

```ini
ALLOWED_CHAT_ID=123456789
```

The unit sets `TELEGRAM_TOKEN_FILE` and `ANTHROPIC_KEY_FILE` to the secret files created above. To use different paths, set those variables in `bridge.env` with absolute paths. Environment files do not expand `$HOME` or `~`.

When the RPM route exists, store its bearer token from the PC with `vm secret set RPM_API_TOKEN`. Add the following variables with your actual URL and absolute token path.

```ini
RPM_API_URL=https://your-rpm-api.example
RPM_TOKEN_FILE=/home/ubuntu/.secrets/RPM_API_TOKEN
```

`rpm_today` sends a GET to `RPM_API_URL` followed by `/v1/today`. It returns JSON text, sanitizes request errors, and accepts cancellation. No RPM API route is implemented by this folder.

Edit `schedule.json` to enable daily prompts. The checked-in file is an empty list.

```json
[{"at":"08:00","prompt":"Morning briefing"}]
```

Times use `Asia/Kolkata` regardless of the VM timezone. Each entry fires at most once per local date, including across restarts. The timer checks once a second and matches the current minute. Missed minutes during downtime are not caught up. Restart the service after changing the schedule.

Install and start the user unit on the VM.

```sh
cd ~/work/telegram-bridge
chmod 600 bridge.env
mkdir -p ~/.config/systemd/user
cp rpm-bridge.service ~/.config/systemd/user/
systemd-analyze --user verify ~/.config/systemd/user/rpm-bridge.service
systemctl --user daemon-reload
systemctl --user enable --now rpm-bridge.service
systemctl --user status rpm-bridge.service
journalctl --user -u rpm-bridge.service -n 30 --no-pager
```

Only after the user's explicit approval, enable operation after logout with the following command on the VM. Do not run it as part of the unapproved setup.

```sh
sudo loginctl enable-linger "$USER"
```

The [loginctl manual](https://www.freedesktop.org/software/systemd/man/latest/loginctl.html) describes lingering. The supplied unit uses a 400 MB memory limit; that limit is a configuration choice, not a measured requirement for this bridge.

Send two private messages quickly and confirm that both replies arrive in order. Test a scheduled prompt, restart the service, and confirm conversation continuity before treating installation as live verified.

## Stop or inspect the bridge

```sh
systemctl --user stop rpm-bridge.service
systemctl --user disable rpm-bridge.service
```

For a foreground check, first stop the service, export the variables from `bridge.env` plus the two secret-file paths, then run `node bridge.mjs`. SIGINT or SIGTERM closes Pi stdin and kills an unresponsive child after three seconds. Run only one bridge per bot, state file, and session directory.

Logs contain fixed event names such as `pi_restart`, `telegram_poll_retry`, `telegram_send_retry`, and `bridge_failure`. Child stderr, message text, HTTP URLs, and provider error bodies are not logged. Repeated `pi_restart` events mean you should check the Pi executable, Node path, and installation. A startup failure asks you to check configuration, state, and service access without printing sensitive exception details.

## Persistence and recovery

`state.json` stores the Telegram offset, pending prompts, reply chunks, and daily schedule keys. Atomic transactions advance the offset and enqueue allowed messages together, including advancement past ignored updates. A single worker changes jobs through `queued`, `running`, and `reply`. This follows the Model the Domain principle and keeps polling, scheduler, and delivery writes under one owner.

Queued work survives a restart. An interrupted active prompt produces an interruption reply and is never automatically replayed, because tools might already have executed. Outbound delivery resumes from its saved chunk cursor. If Telegram accepts a chunk and the bridge crashes before saving the acknowledgement, that chunk can be sent twice. Telegram does not offer an idempotency key for `sendMessage`.

Corrupt state stops startup rather than resetting the offset. Stop the service before inspecting or restoring state. Keep its backup paired with the same bot and allowed chat. Do not reuse state or Pi sessions for another chat. Pending prompts and Pi's `sessions/` files contain conversation text, so keep the folder private and preserve both when upgrading.

Optional environment variables are `PI_BIN`, `BRIDGE_STATE_FILE`, and `SCHEDULE_FILE`. Defaults are `pi`, this folder's `state.json`, and this folder's `schedule.json`. Pi sessions stay in this folder's `sessions/`. Pi starts with the Anthropic provider, `claude-haiku-5-5`, thinking off, and `--continue`. Built-in tools, discovered extensions, MCP, skills, context files, and prompt templates are disabled; the explicitly loaded `rpm_today` tool remains enabled. Each active turn has a three-minute deadline. Pi restarts with exponential backoff from one to thirty seconds.

## Test locally

From the repository root, use Node 22.

```sh
node --test agent/telegram-bridge/
npm run test:js
```

The local private `package.json` supplies the directory's test entry point for Node 22. Tests use an ephemeral HTTP server and a fake JSONL Pi child, with no real Telegram or Anthropic calls. They cover filtering, persisted offsets and recovery, FIFO delivery, Unicode splitting, crashes and deadlines, timer scheduling, secret suppression, and the RPM tool. No root test configuration is changed.

The existing root suite checks Unix permission bits, which Windows does not implement. Run that suite on POSIX for those checks. From WSL on a Windows-mounted checkout, use `BRIDGE_TEST_TMPDIR=/tmp node --test agent/telegram-bridge/` to keep fixture state on Linux storage. The existing root CLI test also has a five-second subprocess deadline; the local WSL run exceeded it. These root tests and their configuration remain unchanged.

## Confirmed Pi protocol

Checked against the upstream `v1.3.0` source, matching the version recorded in `docs/wayfinder/vm-agent-test-2026-10-18.md` in the main checkout. These shapes are source-confirmed, while runtime compatibility on the VM remains UNVERIFIED.

- [RPC framing and lifecycle](https://github.com/earendil-works/pi/blob/v1.3.0/packages/coding-agent/docs/rpc.md) specify one JSON object per LF-delimited record, orderly shutdown through stdin closure, and `agent_settled` for completion. `agent_end` is insufficient.
- [RPC command implementation](https://github.com/earendil-works/pi/blob/v1.3.0/packages/coding-agent/src/modes/rpc/rpc-mode.ts) accepts `{id,type:"prompt",message}` and responds with `{id,type:"response",command:"prompt",success:true,data:{disposition}}`. `handled` starts no run. After settlement, `{id,type:"get_last_assistant_text"}` returns `data.text`, a string or null. Request IDs associate replies with commands. Rejected commands have `success:false`.
- [JSON event reference](https://github.com/earendil-works/pi/blob/v1.3.0/packages/coding-agent/docs/json.md) defines `message_end` and assistant messages. The bridge tracks the current turn's assistant result, including `error` and `aborted` stop reasons, to avoid forwarding stale text.
- [Extension types](https://github.com/earendil-works/pi/blob/v1.3.0/packages/coding-agent/src/core/extensions/types.ts) define `registerTool` and `execute(toolCallId, params, signal, onUpdate, ctx)`. The third argument is the abort signal.
- [Tool argument validation](https://github.com/earendil-works/pi/blob/v1.3.0/packages/ai/src/utils/validation.ts) accepts plain JSON schemas through TypeBox validation. The zero-argument extension schema needs no additional package.
- [CLI options](https://github.com/earendil-works/pi/blob/v1.3.0/packages/coding-agent/docs/cli.md) document the selected model, session, and resource flags, including explicit `-e` loading with `--no-extensions`.

The fixture also accepts acknowledgements without `data.disposition` as a defensive compatibility case. That older shape was not confirmed against the installed VM binary. The restricted flag combination, extension loading, session continuation, real provider events, and systemd resource behavior still need live verification after deployment is authorized.
