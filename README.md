# RPM · personal Android planning app

RPM keeps the reason for work visible while you act. A task belongs to a Result, the Result has a Purpose, and its ordered tasks form the Plan. Capture turns loose thoughts into tasks and Blocks. Your own words are saved first, and planning changes wait for your review.

The current Android build is `0.23-readable-capture` (`app/build.gradle`). Product scope is in [PRODUCT.md](PRODUCT.md), vocabulary in [CONTEXT.md](CONTEXT.md), the visual contract in [DESIGN.md](DESIGN.md), and phone checks in [docs/testing.md](docs/testing.md).

## Delivering updates

Dara's standing release instruction (2026-09-12): whenever an RPM update is built, send its final installable APK to the **Noted** WhatsApp group. Finish the relevant checks first, preserve the versioned artifact in `releases/`, resolve the exact group through the WhatsApp connector, and send the APK as a document with a short version/change caption. Do not send intermediate build iterations or test APKs. Use one stable request ID per release send; after an uncertain response, check that ID rather than creating a duplicate. Report submitted/delivery status accurately. This is part of the release workflow, not a recurring scheduled task.

## Where things live

| Path | What it is |
|---|---|
| `app/` | Android host (Java). Hosts the Capture and Planner WebViews, plus storage, Keystore credentials, model requests, notifications, alarms, the home-screen widget and the floating butterfly. |
| `android-companion/` | Planner and Capture WebView source. `scripts/build-companion-assets.mjs` bundles `runtime.mjs` into `app/src/main/assets/companion/`. That folder is generated and is not tracked in Git. |
| `chat-prototype/` | Desktop browser companion (`npm run chat`). Its `app.js`, `companion-*.mjs` and `reply-format.mjs` are also bundled into the Android app. See [chat-prototype/README.md](chat-prototype/README.md). |
| `intent-v2/` | Capture interpretation harness, bundled into the app. See [intent-v2/README.md](intent-v2/README.md). |
| `cli/` | Terminal workflow (`npm run cli`). `interpret.mjs` and `edits.mjs` are shared with the app. See [cli/README.md](cli/README.md). |
| `convex/` | Convex backend for diagnostics and the legacy cloud sync. See [convex/README.md](convex/README.md). |
| `scripts/` | Asset build, debug build, and device and UI check scripts. |
| `docs/` | Surface contracts, setup guides and dated verification records. |

The earlier Android screens (Next, History, Results, Cloud sync) and their separate SQLite store stay in the app. Open them from **Settings → Earlier RPM screens**. The home-screen widget still writes to that store. Their data is not migrated into the companion store, and the only way to get it out is that screen's **Settings → Export data**.

## Build

Use JDK 17 or newer (21 works) and an Android SDK with platform 36 and Build Tools 36.0.0. Set `JAVA_HOME` and `ANDROID_HOME`, or put `sdk.dir=...` in an ignored `local.properties`.

Run `npm ci` once (and again after dependency changes) before building. Gradle's `preBuild` runs `node scripts/build-companion-assets.mjs`, which needs esbuild and chrono-node from `node_modules`. It regenerates the WebView assets in `app/src/main/assets/companion/`.

```bash
npm run setup
npm run build:android
```

`npm run setup` installs everything and names any missing toolchain piece. `npm run build:android` (`scripts/build-android.mjs`, works from PowerShell and Git Bash) assembles the debug app and runs Android lint. The on-device integration-test APK (`assembleDebugAndroidTest`) is a known failure skipped by default; see `AGENTS.md`. If `JAVA_HOME` is unset, it uses a JDK in `.tooling/` or on `PATH`. The app APK is written to `app/build/outputs/apk/debug/app-debug.apk`. Install it with `adb install -r`. The integration tests use their own disposable database:

```bash
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am instrument -w com.rpm.prototype.test/com.rpm.prototype.OfflineTests
```

Phone pairing and setup are covered in [docs/phone-setup.md](docs/phone-setup.md).

## Test

```bash
npm test
```

`npm test` runs the test suite. [docs/testing.md](docs/testing.md) lists the narrower commands, the device checks and the recorded phone evidence.

Approved reference images: [home widget](docs/design/approved-home-widget.png) and [Capture states](docs/design/approved-capture-states.png). Earlier rationale is in [docs/product-context.md](docs/product-context.md).
