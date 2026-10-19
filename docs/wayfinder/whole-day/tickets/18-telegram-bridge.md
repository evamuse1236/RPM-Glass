# Build the Telegram bridge for Pi

Type: wayfinder:task (AFK) · Stream: agent · Status: closed · Assignee: gpt · Blocked by: 17-pi-telegram-and-tools (closed)

## Question

Write the bridge from the research (long polling, one allowed chat, Pi in RPC mode, timer for scheduled prompts, one stub RPM tool extension) with tests against a fake Telegram and a fake Pi. Branch `feat/pi-telegram-bridge`. Deploying it needs the user's bot token and chat ID.

## Resolution (2026-10-18)

Built on branch `feat/pi-telegram-bridge` (commit a9dd102), worktree `C:\Repos\rpm\RPM-Glass-wt-bridge`, folder `agent/telegram-bridge/`. Not deployed.

- Long-polls Telegram, answers one allowed chat only, keeps one Pi RPC child alive and restarts it after a crash, runs scheduled prompts in India time, and adds the `rpm_today` tool.
- 24/24 bridge tests pass (re-run by Claude). They use a fake Telegram server and a fake Pi, never the real services.
- The root `npm run test:js` fails 4 tests on the main checkout too (Windows file-permission checks), so the bridge adds no new failures.
- Pi RPC message shapes were confirmed against Pi v1.3.0 source. The live run on the VM is UNVERIFIED.

To deploy, the user provides: the bot token (`vm secret set TELEGRAM_BOT_TOKEN`), the numeric chat ID, and an OK for `loginctl enable-linger`.
