# Who does RPM's thinking: parsing, sorting and planning?

Type: wayfinder:grilling (HITL) · Stream: agent · Status: closed · Assignee: you · Blocked by: none

## Question

Today the app sends each capture to OpenRouter (GPT-6 Luna) to turn words into a task, and sorting uses a separate model. Should that stay, or move?

## Resolution (user, 2026-10-18)

Pi on the phone does all of RPM's parsing, sorting and backend thinking, not OpenRouter models. Reason (user's words): "this gives it stronger capabilities and we can use codex or opus from claude code to make it even smarter and better".

Facts this rests on (measured):
- Pi 1.3.0 runs on the phone in Termux: 4.3 s for a prompt with two tool calls, 82 MB, 11 of 11 answers over an hour with the screen off.
- Pi 1.3.0 has built-in sign-ins "Anthropic (Claude Pro/Max)" and "OpenAI (ChatGPT Plus/Pro)" (Codex), in `pi-ai/dist/auth/oauth/`.

Follows from it: [How does the RPM app talk to Pi on the phone?](21-app-to-phone-pi.md), [Which models does Pi use for which job?](22-pi-models.md). The VM agent stays for jobs that must run when the phone is off (inferred; revisit in ticket 21).
