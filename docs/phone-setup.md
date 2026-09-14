# Install and connect your phone

1. Transfer `app/build/outputs/apk/debug/app-debug.apk` to your Galaxy and open it. Allow installation from the app you use to open the file if Android asks. This is a development-signed APK. Updating the same installation preserves its data; do not uninstall an existing copy containing data to resolve a signing mismatch.
2. Open RPM → **Settings → Cloud sync**. The production address is prefilled: `https://neat-emu-821.convex.site`.
3. Paste the one-use pairing code supplied with this build and tap **Connect & sync**. It expires 30 minutes after generation. All existing saved entries and revisions upload, then new saves upload automatically as connectivity and Android background scheduling permit.
4. To generate a replacement code on this computer, run from the RPM project:

```bash
npx convex run admin:createPairingCode '{"label":"Galaxy S24 FE"}' --prod
```

5. View collected records in the [production Convex dashboard](https://dashboard.convex.dev/t/vishwajit1236/rpm/neat-emu-821). `records` contains current entries, projects and revision snapshots. `events` contains upload history; repeated snapshots are not additional activity.
6. Add the widget through **Settings → Home-screen widget**. Use Remind to save an entry and explicitly choose a notification or ringing alarm. Allow notifications and Alarms & reminders. Full-screen alerts have a separate setting in **Settings → Alarms & reminders / Full-screen alarms**. Test a two-minute alarm on your phone and check alarm volume.

Data stays in SQLite first, including when offline. Pairing is once per installation; the APK contains no Convex admin key. Re-pairing rotates the phone token. Sync does not yet restore cloud records to a new installation. Use **Settings → Export data** before clearing app data or uninstalling.

The emulator has verified stock Android behavior at S24 FE resolution. Samsung launcher, keyboard dictation, battery policies, lock-screen presentation and audible delivery still need confirmation on your actual phone. Force-stopping RPM can prevent alerts until it is reopened. Reboot recovery occurs after Android boot/unlock; missed alerts are not replayed in a batch.

For the 0.4 redesign, install the update over the existing app to retain its data and pairing. Remove and re-add an older widget if the launcher retains its old two-row grid allocation; the new default is 4×1.
