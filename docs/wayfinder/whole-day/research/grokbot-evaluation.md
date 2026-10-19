# Grokbot evaluation (2026-10-18)

Question: can "grokbot" be RPM's always-on background agent on the Oracle VM?
Labels: **[measured]** = I ran or read it myself here; **[source]** = stated by the project's own README/code/registry; **[inferred]** = my reasoning.

## What "grokbot" is

No local folder or file named grokbot/grok-bot/grok_bot exists under `C:\Repos` (depth 3) **[measured]**. The local `grok` command is xAI's official **Grok Build CLI** 1.0.62 at `~/.grok/bin/grok.exe` **[measured]**. It is a coding agent, not a Telegram bot.

Web candidates:

| Candidate | What | Fit |
|---|---|---|
| **artickc/grok-telegram-bot** (npm `grok-telegram-bot`) | Telegram bridge that drives Grok Build CLI over ACP (`grok agent stdio`) | Most plausible. Evaluated below. |
| superagent-ai/grok-cli | Community terminal coding agent with a Telegram `/pair` remote. 3.5k stars, TypeScript, MIT, last push 2026-07-06 **[measured via GitHub API]** | Second. Same shape as the first: a coding CLI with a Telegram remote. CLI process must stay running **[source]**. |
| artastakenaka/grok-ai-telegram-bot | Plain Grok chatbot (chat, images) | No custom tools or plan access. Rejected. |
| xAI "Grok Bot" | Hosted xAI product; Composio integration guides only | Not self-hostable. Rejected. |

### artickc/grok-telegram-bot

- URL: https://github.com/artickc/grok-telegram-bot — TypeScript on Node 20+, run with `tsx`; deps grammy, dotenv, diff **[source: npm registry]**.
- License MIT. 9 stars, 2 forks, 13 releases, latest 2.7.0. Created 2026-07-09, last push 2026-08-30 **[measured via GitHub API / npm registry]**. One maintainer. Fork of kiro-telegram-bot.
- Needs the Grok Build CLI installed, plus a SuperGrok / X Premium+ sign-in or `XAI_API_KEY` on a headless host **[source]**.

## Requirements

| Requirement | Result | Evidence |
|---|---|---|
| Runs on Ubuntu, no Docker, no local models | **Pass** | systemd user service via `grok-tg install` **[source]**. Grok CLI installer ships Linux x86_64 and aarch64 builds **[measured: read install.sh]**. All inference is remote **[source]**. |
| Fits 954 MB RAM + 2 GB swap, 1/8 core | **Unknown, tight** | One headless `grok -p` turn peaked at **158 MB** working set on Windows **[measured]**. The bot keeps a long-lived `grok agent stdio` process plus Node+tsx (about 80–150 MB) **[inferred]**. Estimate 250–400 MB idle, more with subagents or MCP servers **[inferred]**. The CLI binary alone is 165 MB on disk **[measured]**. tsx compiles TypeScript at startup, which is slow on 1/8 core **[inferred]**. |
| Reached by Telegram | **Pass** | Its core purpose; user-ID allowlist **[source]**. |
| Custom tools that read/change the plan | **Pass** | Grok CLI supports MCP servers (`grok mcp`); bot has `/mcp` health-check/enable **[source]**. RPM would still need its own MCP server over Convex **[inferred]**. |
| Scheduled jobs | **Pass** | `/newtask`: once/daily/weekly/monthly/every-N-min, stored in `data/tasks.json`, survives restarts **[source]**. |
| Memory | **Partial** | Grok CLI cross-session memory is marked *Experimental* (`GROK_MEMORY=1`) **[source]**. Bot has `search_memory` in its forum "General manager" **[source]**. |
| Changes logged with reason, undoable | **Fail as shipped** | No agent-change log or undo; logs are process logs rotated at 5 MB **[source]**. Must live in RPM's MCP tool layer — true for Pi and PicoClaw too **[inferred]**. |
| API model; Anthropic key already on VM | **Partial** | Default path needs an xAI key or subscription **[source]**. Grok CLI accepts custom OpenAI-compatible endpoints (`[model.x] base_url`, `env_key`) **[source]**, so Anthropic's OpenAI-compatible endpoint might work. **UNVERIFIED**. Whether the bot starts with no xAI login at all is unknown. |

## Cost

- Bot and CLI: free (MIT, free download) **[source]**.
- Grok 4.5 API: about $2 / M input, $6 / M output, under 200K-token prompts; 2× above 200K **[source: third-party price aggregators, not docs.x.ai — check before relying]**. Or a SuperGrok subscription.

## Risks

1. Built for coding: auto-approves tools by default and lets the agent run shell commands and edit files on the VM **[source]**. Too much power for a planning agent unless locked to MCP-only tools.
2. Two layers to keep alive: a 9-star single-maintainer bridge on top of a fast-moving closed CLI (two CLI binaries in 2 days on this PC) **[measured]**. Global npm installs auto-update when idle **[source]** — unwanted on a server.
3. Telemetry/trace upload options exist in the CLI (`trace_upload`) **[source]**; a local `upload_queue/` folder exists here **[measured]**. Plan data could go to xAI unless disabled.
4. RAM headroom on the 954 MB VM is unproven **[inferred]**.

## Verdict

Not a better fit than Pi or PicoClaw **[inferred]**. It meets Telegram, MCP and scheduling out of the box, which is real. But it is a coding-agent remote control, ties RPM to xAI (new key, extra cost), is heavier than PicoClaw (a single Go binary) and has the smallest community of the three. Keep it as an **option C** only if Pi fails and PicoClaw's tooling falls short. If tried, measure RSS on the VM first and disable shell/file tools.
