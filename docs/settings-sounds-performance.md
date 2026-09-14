# Settings, sounds and responsiveness

Scope: the Frosted Night Android companion. Preserve the original fonts, dark blue surface, cyan accent, conversation flow and current saved data.

Settings uses a fixed title/back control and a scrollable column of quiet rows. Sound controls lead; appearance, floating butterfly, alert permissions, AI connection and context follow. Group headings use generous spacing; rows and descriptions share aligned edges. Native dialogs use the same dark theme. Controls remain at least 48dp and grow at large text sizes. Returning from a picker preserves the settings scroll position.

Alarm sound can use the phone default, a phone tone, or an imported audio file. Chosen audio is validated off the UI thread and copied privately so moving the original does not break alarms. Replacing a sound commits only after successful validation. Alarm playback falls back to the phone default if the private copy is unreadable. Both legacy and companion ringing alarms use the preference.

Reminder sound is controlled by the existing RPM reminder notification channel; Settings links directly to Android's channel controls and reads the actual current sound. Existing blocked/silent choices are preserved. Legacy notification settings retain their separate channel.

Performance targets: remove arbitrary keyboard delay, shorten answer reveal without changing AI reasoning, avoid duplicate status and startup reconciliation, avoid repeatedly creating channels per saved entry, and avoid disk commits for an unchanged delivery ledger. Measure locally and distinguish code timing from device benchmarks.

Checks: Android build/lint and existing JS/native suites; sound import/default/fallback and independent notification channel; emulator settings, picker/cancel/return, portrait, landscape and 200% type; draft/keyboard/menu behavior; before/after timing. No physical phone connection at start of work.

Android source: [notification channel controls](https://developer.android.com/develop/ui/views/notifications/channels) and [ringtone picker](https://developer.android.com/reference/android/media/RingtoneManager).

## Verification — 2026-09-11

APK: `releases/rpm-0.7-night.apk`, version code 7, debug-signed using the existing Android key. SHA-256: `3a506b8880a45f0fcfb0538c723923d244b1b71b2992351cc692ae68e4d15929`. Signature verified and emulator updated in place with its existing data.

- Build, Android lint and test APK assembly pass. Lint retains existing project warnings; no errors.
- 38 JavaScript tests pass, including conversation behavior and held-send gesture guards.
- 31 companion Android checks and 38 legacy Android checks pass. Sound checks use isolated preferences/files and cover valid import, source-file removal, rejected empty file, actual custom playback, missing-file fallback, default reset, and preservation of notification-channel choices.
- Actual system picker flows exercised: phone tone Echo selected and saved; a synthetic OGG file selected through Downloads and saved; reminder category opened and its Sound picker inspected. Alarm default restored after testing; reminder sound was not changed by the test.
- A synthetic scheduled alarm fired through AlarmManager into the foreground alarm service. Android reported active looping playback on the alarm stream, and both notification controls were visible. Snooze was tapped and the ledger confirmed a future snooze. The synthetic entry and its pending schedule were removed afterward; the alarm service stopped. This adds two fixture checks to the 107 suite checks above.
- Native settings rendered at 1× and 2× font scale and in landscape. The slider's native measurement initially capped its touch height; explicit 48dp layout fixes it. The Back button, rows and text remain usable. Android owns the appearance of its sound pickers.
- The real keyboard opens automatically after page focus, and the conversation/composer stay above it. Screenshots: `testing/settings-update-keyboard.png`, `testing/settings-after.png`, `testing/settings-large-text.png`, `testing/settings-landscape.png`, `testing/settings-sound-options.png`, `testing/settings-reminder-channel.png`.

Measured on the API 36 emulator, using the existing stored conversation and `scripts/measure-companion.mjs`:

| Observation | Before | After |
| --- | --- | --- |
| Native replies per phone refresh | 2 | 1 |
| Computed reply reveal | 550 ms + 180 ms delay | 160 ms, no delay |
| Animated reply properties | Opacity and blur | Opacity |
| Keyboard timer delays in source | 350 ms + 300 ms | No arbitrary timers; focus callback |

Raw samples: `testing/performance-before.json`, `testing/performance-after.json`. Individual native-status request timings overlap on this emulator, so this is not a claim of a measured CPU or startup percentage improvement. Hosted AI response time and battery impact were not measured or changed. Physical Samsung hardware remains untested.

The mobile design guidance informed the shared typography, compact settings rows, touch targets and rendered size checks. The existing Frosted Night reference supplied the visual direction.
