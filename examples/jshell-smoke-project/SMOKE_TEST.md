# JShell Smoke Test Checklist

## Goal
Validate constructor calls, method calls, `main` execution, stdout/stderr handling, and large-output behavior.

## Steps
1. Open folder project: `examples/jshell-smoke-project`.
2. Compile project (`Project -> Compile Project`).
3. Run main class `Tester` (`Run -> Run Main` and select `Tester`).
4. Confirm final summary shows:
   - `Passed: 9`
   - `Failed: 0`
5. Confirm `Run finished.` is printed at the end.

## Expected notable output
- `=== Unimozer Smoke Tester ===`
- `[PASS] AppSmokeMain constructor + sum`
- `[PASS] StudentRecord average + describe`
- `[PASS] GeometryBox volume + scale`
- `[PASS] InheritanceDemo counter`
- `[PASS] JshellEdgeCases constructor + unicode/escapes`
- `[PASS] JshellEdgeCases JSON-like output`
- `[PASS] JshellEdgeCases large output`
- `[PASS] JshellEdgeCases stderr output`
- `[PASS] Run all class main methods`

## Notes
- Unicode output should render correctly (for example `äöü 漢字 😀` in `unicodeAndEscapes`). Replacement characters indicate a regression.
- If output appears truncated, scroll to the end first and verify the summary lines.
