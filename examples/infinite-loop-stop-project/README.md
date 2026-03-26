# Infinite Loop Stop Project

This project is for validating stop behavior in both execution paths:

- `Run main` stop flow (`cancel_run`)
- Object-bench method call hard stop (`jshell_force_stop`)

## How to use

1. Open `examples/infinite-loop-stop-project` as a folder project.
2. Compile project.
3. Run `InfiniteLoopMain.main` and click the red stop button.
4. Create a `MethodLoopRunner` object from the object bench.
5. Call `endlessSilentLoop()` and stop it with the red stop button.
6. Repeat with `endlessPrintLoop()` and stop it again.
