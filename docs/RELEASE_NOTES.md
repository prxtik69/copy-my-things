Type `;email` in a text field and it turns into your saved address. Version 0.2.0 adds in-place expansion for typed triggers, including multiline replies and Unicode text.

- When typed triggers are enabled, **Replace with snippet** is now the default. To keep the previous behavior, choose **Settings → Triggers → When I type a trigger → Copy to clipboard**. Manual copy and Quick Search still work as before.
- Expansion uses the system clipboard and sends ⌘V on macOS or Ctrl+V on Windows/Linux. Use copy mode in apps with a different paste shortcut. Sensitive clipboard expiration still applies.
- Unlock your vault before expanding a sensitive snippet. If it’s locked, the trigger stays in place; return to the field after unlocking and type it again.
- Try expansion in the onboarding practice field without enabling global keyboard monitoring.

## Downloads

Choose **x64** for Intel/AMD Windows and Linux or Intel Macs. Choose **arm64** for Apple Silicon, Windows on ARM, or ARM Linux.

- **Windows:** run the `-setup.exe` installer. Installation is per user by default.
- **macOS:** open the `.dmg` and drag Copy My Things to Applications. A `.zip` is also available.
- **Linux:** install the `.deb` on Debian/Ubuntu, or mark the `.AppImage` executable and run it. AppImages may require your distribution's FUSE compatibility package.

Builds without signing credentials are unsigned. Windows may display SmartScreen. macOS may require approving the app in System Settings → Privacy & Security after the first open attempt. Signing/notarization is supported by the build workflow when release credentials are configured.

The `SHA256SUMS.txt` file lists the checksum of every downloadable asset. The `native-sources.tar.gz` archive includes corresponding native-hook sources and license notices; copies are also included with each installed app.

Typed triggers require explicit permission and a US QWERTY layout. Global typed monitoring is unavailable on Wayland; use the manager or Quick Search instead. macOS may request Accessibility and Input Monitoring access.
