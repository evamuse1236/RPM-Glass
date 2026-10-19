# Which models does Pi use for which job?

Type: wayfinder:research (AFK) · Stream: agent · Status: open · Assignee: none · Blocked by: 20-pi-is-rpms-brain (closed)

## Question

Fast jobs (turn one capture into a task) want a quick model; hard jobs (re-plan the week, sort a backlog) go to Sonnet 5.5 at high effort (user, 2026-10-18; see [Which model answers, and what may it see?](24-ai-models-and-data.md)). Opus or Codex stay optional. Two routes to the strong models:
- Pi signs in with your Claude Pro/Max or ChatGPT Plus/Pro plan (built into Pi 1.3.0).
- Pi calls Claude Code (`claude -p`) or Codex (`codex exec`) as tools, if they run in Termux.

Find out: does each route run on the phone, its speed, its limits, and whether each plan's terms allow it (a guess today: using a Claude subscription from a third-party tool may break Anthropic's terms; check the current terms).
