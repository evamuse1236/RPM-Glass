# How does Pi on the VM talk over Telegram and call RPM tools?

Type: wayfinder:research (AFK) · Stream: agent · Status: closed · Assignee: claude · Blocked by: 01-vm-agent-loop-test (closed)

## Question

Pi 1.3.0 runs on oracle-vm. What does Pi offer for running headless as a long-lived service (SDK, RPC, Pi Durable), receiving Telegram messages (existing bridges or a small one we write), calling custom tools (MCP via Codemode, extensions), scheduled jobs, and memory? What is the smallest setup that gives a Telegram chat with Pi that can call one RPM tool, and what would it cost in memory?

## Resolution (2026-10-18)

Run Pi as a long-lived child in RPC mode (`pi --mode rpc`, JSONL on stdin). Pi has no Telegram bridge that fits; write a ~100-line Node bridge that long-polls Telegram (no open port; the VM reached api.telegram.org, measured), accepts only the user's chat ID, and sends each message to Pi as a prompt. Give Pi RPM access through a small extension tool (`pi.registerTool`) that calls an HTTP route, with built-in tools off so it can't read secrets. Schedule jobs with a timer inside the bridge. Sessions persist as JSONL (`--continue`); no cross-session memory. Estimated 170–190 MB total (inferred). Needs from the user: a Telegram bot token (`vm secret set TELEGRAM_BOT_TOKEN`), their chat ID, and OK for `loginctl enable-linger`. Detail: [pi-telegram-and-tools](../research/pi-telegram-and-tools.md).
