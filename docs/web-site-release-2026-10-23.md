# Website release evidence — 2026-10-23

The owner approved leaving all exclusions out, merging and publishing the Site, and updating the physical phone in place. The feature map is [here](web-site-feature-map.md).

## Publication and phone

- Private Site: https://rpm-planner.evamuse.chatgpt.site (owner-only audience preserved).
- Sites deployment: `appgdep_6ada991311d48191b09a245d80ed9053`, succeeded.
- Site source commit: `ee64be8aba1bc6cf7da8bd22039188c9d5812e3e` in the separate Sites source repository.
- Production Convex: `neat-emu-821`; deployed the v2 snapshot/plan contract and guarded v1 upgrade. Upgrade compares all legacy saved fields; regenerated receipt wording may differ. Older v1 snapshots are omitted from the upgraded phone's command bases.
- Snapshot receipts use the saved timestamp, so a later upload of an unchanged revision keeps its identity. Regression coverage advances the clock by two days.
- Browsers discard a cached v1 snapshot and its ETag while keeping credentials and queued commands; a regression test refetches v2 at the same revision and sends the original queued command.
- Physical S24 FE: `com.rpm.prototype`, version `0.33-site-parity`, code 33. Updated with `adb install -r`; no uninstall or app-data reset.
- `rpmctl doctor --serial <phone>` passed every check, including version, installed APK, signing, normal phone display, launch and no app crash/ANR. Actual signer matched the original installed app (`02620d8a…`); the CI phone-key constant (`525fee39…`) describes a different key and was not used for this installation.
- All 37 stored entries preserved. `companion.json` is byte-for-byte identical before and after the update: SHA-256 `73925dcf51d7ee899cadaf0e4b7aaedff9486e20c2b53a21a02a9a2a6fc1d538`.
- The physical phone published revision 283 as snapshot v2; the deployed Site returned HTTP 200 with `entries` and `planner`, rendered Today/Blocks/Projects/Life, and showed no visible errors or pending commands. Snapshot entries exclude non-planner records, so their count differs from the full local store.
- Opened the Site in the user's desktop browser; delivered the APK using Juno.

Local private backup and doctor/preservation reports are under `.verify/releases/site-parity-20261023/` (untracked). Phone screenshot: `.verify/evidence/adhoc-2026-10-22/02-site-parity-capture-phone.png`. The directory date follows the verification tool's UTC run date.

## Checks and limits

`npm test` passed after the rollout fixes, including cloud tests, typechecking and Android JUnit. The original browser drive passed 230 checks at 412px/1280px with one time-dependent skip; see the parity table for evidence and remaining coverage gaps.

No test command was sent to the owner's real planner. Physical-phone browser command effects, live model paths, Cloud-dialog interactions, Samsung-specific behavior and actual home-screen widget placement remain **UNVERIFIED**. Physical snapshot publication and the live Site's snapshot read were verified separately from the stand-in command drive.

The full emulator run and merge result are recorded below when complete.
