# How does the RPM app talk to Pi on the phone?

Type: wayfinder:prototype (HITL) · Stream: agent · Status: open · Assignee: none · Blocked by: 20-pi-is-rpms-brain (closed)

## Question

RPM is one Android app; Pi runs inside Termux, another app. How does a capture get from RPM to Pi and the answer back, fast and safely?

Options to prototype:
- A: a small bridge in Termux keeps one Pi RPC process alive and listens on 127.0.0.1 only, with a shared secret; RPM's native layer calls it.
- B: RPM starts Pi through Termux's RUN_COMMAND intent for each job (simpler, slower: Pi starts in about 1.5 s).
- C: bundle Node and Pi inside the RPM app itself (no Termux; bigger APK; most work).

Also decide: what RPM does when Pi is not running (queue the capture and keep the raw words, which the app already keeps; or fall back to OpenRouter), how every Pi change is logged with Undo, and which jobs stay on the VM because the phone may be off.
