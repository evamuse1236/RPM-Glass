# Can PicoClaw run on the phone? (2026-10-18)

Source: a Haiku scout read sipeed/picoclaw (HEAD bbf6893, v0.3.1, MIT, Go, ~30k stars, last push 2026-10-15). Read from docs; nothing was installed or run.

- Yes, without root. The documented route is Termux plus the Linux arm64 build, run with `termux-chroot ./picoclaw gateway` (`docs/guides/android-termux.md`). An APK is offered on picoclaw.io, not on GitHub; not checked.
- RAM: claims under 10 MB; README warns recent builds may use 10-20 MB.
- Providers include Anthropic and OpenRouter. Telegram uses long polling, like our bridge.
- Tools: shell (workspace-restricted), files, web, cron, MCP servers (stdio/sse/http). An RPM tool would be easiest as an HTTP MCP server.
- Risk: the gateway is a long-lived process. The docs only say "keep Termux open" and "turn off battery optimisation". No foreground service or wake lock found. Samsung may kill it with the screen off (guess; test for an hour).

Verdict (inferred): it can run on the phone as a second node, but the VM stays the always-on agent. The phone sleeps and loses network; the VM does not.

## Measured on the phone (2026-10-18, Galaxy S24 FE SM-S721B, Android 16, 4 KB pages)

- Termux v0.118.3 (official GitHub build) and PicoClaw 0.3.1 (sipeed GitHub release, SHA-256 checked) installed over USB. The "not 16 KB compatible" warning is harmless on this phone: its page size is 4096.
- First prompt: answered in 3.8 s, ran `date` and `uname -m` with its shell tool, peak memory 25 MB.
- PicoClaw sends `temperature` on every request, and Claude Haiku 5.5 rejects it ("temperature is deprecated"). Both Claude paths in PicoClaw do this. Workaround: Claude Haiku 4.5. A fix belongs upstream.
- The Claude key was piped from the VM into `~/.picoclaw/.security.yml` (mode 600); never printed.
- Dropped on 2026-10-18: the user chose Pi instead. PicoClaw and its key copy were removed from the phone.

## Pi on the phone instead (2026-10-18)

- Node 24.18 (Termux package) + `npm install -g --ignore-scripts @earendil-works/pi-coding-agent@1.3.0`: 14 s. Same Pi version as the VM.
- Runs Claude Haiku 5.5 with no workaround. First prompt with two bash tool calls: 4.3 s, peak 82 MB (measured).
- Key: `~/.secrets/ANTHROPIC_API_KEY` in Termux (mode 600), piped from the VM; never printed.
- Commands run over adb need `LD_PRELOAD=$PREFIX/lib/libtermux-exec.so` for the `#!/usr/bin/env node` shebang; inside the Termux app this is already set.
- Screen-off soak: one "OK" prompt every 5 minutes for an hour, in the Termux app with a wake lock. Log: `~/pi-soak.log`. Result: pending.
