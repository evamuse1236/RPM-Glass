# Vendor provenance

Imported on 2026-09-16 from the user-supplied `RPM-Glass-Implementation-Kit.zip` extracted at `/tmp/rpm-improvement-kits-20260916/RPM-Glass-v2-kit`.

The imported kit identifies itself as `RPM-Glass intent harness pilot` version `0.1.0`, prepared 2026-09-16, audited against RPM-Glass commit `22604e683362e7edd3cbf6e0297ce4dd55a4ce73`.

Retained: source, prompts, adapters, deterministic tests, evaluation cases, integration and research documentation, manifest, checksums, hotfix tooling, and the actual-repository smoke script. The demo UI and generated verification logs were excluded because RPM uses its bundled Android companion UI and reruns verification locally.

Local production changes are documented by Git history/diff. `prompts/intent-system.mjs` is a bundler-safe mirror of the readable Markdown prompt. The manifest records zero live model calls and no Android verification in the original kit; those claims remain historical provenance, not current RPM verification.
