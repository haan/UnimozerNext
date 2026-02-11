# Reload From Disk Project

Use this project to validate external-change detection and reload behavior for folder projects.

## Files
- `src/ReloadMain.java`
- `src/ReloadTarget.java`
- `src/MathService.java`
- `src/TextService.java`

## Manual reload checks
1. Open `examples/reload-disk-project` in one Unimozer instance.
2. Open the same folder in an external editor.
3. Edit `ReloadTarget.java` (for example, change `buildMessage` output).
4. Save externally.
5. In Unimozer:
   - if project is clean: verify auto-reload,
   - if project is dirty: verify reload/ignore dialog appears.
6. Compile and run `ReloadMain` to confirm new output is used.
