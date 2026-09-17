# Delivery verification records

These logs were produced in the delivery container on 16 September 2026. `node-tests.txt` is the kit’s Node 22.16.0 deterministic test run, not the original repository suite. `browser-smoke.txt` is a Chromium/Playwright scripted-model smoke run using page.set_content; it is not a native Android or live-model test. `live-eval-dry-run.txt` proves only runner selection/startup without paid requests. See `docs/EVALUATION.md` for limits and next tests.

All delivered .mjs files also passed `node --check`. Original source Git blob hashes for the three hotfix targets were re-read through GitHub and matched the installer specifications. The installer was not applied against a full checkout here.
