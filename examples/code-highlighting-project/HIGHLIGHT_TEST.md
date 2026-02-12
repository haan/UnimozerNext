# Highlight Test Checklist

1. Open `HighlightCases.java`.
2. Toggle **View -> Editor -> Code highlighting** on/off and verify:
   - off: native Monaco selection visuals
   - on: scope coloring visible with consistent nested bands
3. Select multi-line regions spanning nested blocks and ensure selection remains visible.
4. Confirm javadocs above methods adopt the expected block color behavior.
5. Confirm regular block comments and inline comments do not break brace-depth parsing.
6. Place caret in methods and verify indentation stripes follow parent nesting.
7. Edit plain text (letters/numbers) and confirm highlighting remains stable.
8. Insert/remove `{` or `}` and confirm highlight updates immediately.
