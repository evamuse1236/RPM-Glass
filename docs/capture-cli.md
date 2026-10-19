# Try Capture on your computer

Open PowerShell. Paste these three commands, one at a time:

```powershell
cd C:\Repos\rpm\RPM-Glass-wt-capture-smart
npm ci
secret run --env ANTHROPIC_API_KEY=anthropic -- npm run capture
```

Type `set a reminder in 5` and press Enter. Your test day is saved locally; your phone is unchanged. This uses paid AI calls.

Type a choice number to answer a question. `/undo` reverses the latest change. `/state` shows your saved day. `/trace` shows diagnostics without your words or key. `/reset` starts the seeded day again. `/quit` exits.

For a repeatable test, add `-- --store .verify/my-capture.json --now 2026-10-19T10:00:00+05:30` to the last command. Without `--now`, Capture uses your current clock. Without a key, it still saves your exact words and says AI is off. `/retry` reads those saved words after you restart with a key.

The terminal saves reminder and alarm settings. Android notification and alarm delivery require the phone and are not tested here. The older `npm run cli` remains available with its older interpreter; use `npm run capture` to test the current app.

The CLI supports Windows and Linux. Only one session can open a store at a time. Closing or stopping that process releases it automatically.
