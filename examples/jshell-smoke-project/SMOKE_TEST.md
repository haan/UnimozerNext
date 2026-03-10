# JShell Smoke Test Checklist

## Goal
Validate constructor calls, method calls, `main` execution, stdout/stderr handling, and large-output behavior.

## Steps
1. Open folder project: `examples/jshell-smoke-project`.
2. Compile project (`Project -> Compile Project`).
3. Run main class `Tester` (`Run -> Run Main` and select `Tester`).
4. Confirm final summary shows:
   - `Passed: 14`
   - `Failed: 0`
5. Confirm `Run finished.` is printed at the end.

## Expected notable output
- `=== Unimozer Smoke Tester ===`
- `[PASS] AppSmokeMain constructor + sum`
- `[PASS] StudentRecord average + describe`
- `[PASS] GeometryBox volume + scale`
- `[PASS] InheritanceDemo counter`
- `[PASS] JshellEdgeCases constructor + unicode/escapes`
- `[PASS] JshellEdgeCases unicode stress`
- `[PASS] JshellEdgeCases constructor flood`
- `[PASS] JshellEdgeCases JSON-like output`
- `[PASS] JshellEdgeCases large output`
- `[PASS] JshellEdgeCases protocol flood`
- `[PASS] JshellEdgeCases protocol flood unicode`
- `[PASS] JshellEdgeCases stderr output`
- `[PASS] RandomStatistics printSeries mixed print/println`
- `[PASS] Run all class main methods`

## Advanced manual JShell stress checks
1. Create an object of `JshellEdgeCases` with constructor `(String, int)` and values:
   - `label = "manual-ctor-flood"`
   - `constructorFloodLines = 100000`
2. Confirm object creation succeeds and does not fail with:
   - `JShell bridge returned non-JSON output`
3. Call method `protocolFlood(120000)` on that object.
4. Call method `protocolFloodUnicode(60000)` on that object.
5. Confirm both method calls complete without the non-JSON bridge error.
6. Create object `RandomStatistics` and call:
   - `printSeries(5)`
   - `printSeries(50)`
7. Confirm calls complete without:
   - `JShell bridge returned non-JSON output`
   - `JShell bridge did not return a JSON response`

## Notes
- Unicode output should render correctly (for example `äöü 漢字 😀` in `unicodeAndEscapes` and in `protocolFloodUnicode`). Replacement characters indicate a regression.
- If output appears truncated, scroll to the end first and verify the summary lines.
