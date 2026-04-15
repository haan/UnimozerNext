public class StructogramCases {
    // ── original cases ────────────────────────────────────────────────────────

    public int nestedIfElse(int score) {
        if (score >= 90) {
            return 1;
        } else if (score >= 75) {
            return 2;
        } else if (score >= 60) {
            return 3;
        }
        return 4;
    }

    public int forAndWhile(int limit) {
        int total = 0;
        for (int i = 0; i < limit; i++) {
            int x = i;
            while (x > 0) {
                total += x;
                x--;
            }
        }
        return total;
    }

    public String switchWithFallthrough(int month) {
        String season;
        switch (month) {
            case 12:
            case 1:
            case 2:
                season = "winter";
                break;
            case 3:
            case 4:
            case 5:
                season = "spring";
                break;
            case 6:
            case 7:
            case 8:
                season = "summer";
                break;
            case 9:
            case 10:
            case 11:
                season = "autumn";
                break;
            default:
                season = "unknown";
                break;
        }
        return season;
    }

    public int doWhileAndBreak(int start) {
        int value = start;
        do {
            value--;
            if (value == 3) {
                break;
            }
        } while (value > 0);
        return value;
    }

    public int tryCatchFinally(String raw) {
        int value = 0;
        try {
            value = Integer.parseInt(raw);
        } catch (NumberFormatException ex) {
            value = -1;
        } finally {
            value++;
        }
        return value;
    }

    public int foreachWithContinue(int[] values) {
        int sum = 0;
        for (int value : values) {
            if (value < 0) {
                continue;
            }
            sum += value;
        }
        return sum;
    }

    public int complexFlow(int[] values, int threshold) {
        int total = 0;
        for (int value : values) {
            if (value < 0) {
                continue;
            } else if (value <= threshold) {
                total += value;
            } else {
                int temp = value;
                while (temp > threshold) {
                    total += threshold;
                    temp -= threshold;
                }
                total += temp;
            }
        }
        return total;
    }

    // ── edge cases added for second-pass review coverage ─────────────────────

    // Bug 2 fix: if-branch whose last child is a while-loop.
    // Previously only stretchLastStatementToHeight was applied to if-branches;
    // stretchLoopBodyToHeight was missing. This method puts a while at the end
    // of the then-branch so the fix is exercised.
    public int ifBranchEndingWithWhile(int n) {
        if (n > 0) {
            int x = n;
            while (x > 0) {
                x--;
            }
        } else {
            return -1;
        }
        return 0;
    }

    // Bug 1/2 combined: if-branch ending with a nested if (neither statement
    // nor loop — not stretchable). The branchPaddedRemainder fix ensures the
    // unfilled gap uses colors.branch instead of colors.body.
    public String ifBranchEndingWithNestedIf(int a, int b) {
        if (a > 0) {
            if (b > 0) {
                return "both positive";
            } else {
                return "only a positive";
            }
        } else {
            return "a not positive";
        }
    }

    // Switch case whose body ends with a try block (not stretchable via
    // existing helpers). Exercises branchPaddedRemainder for switch columns.
    public int switchCaseEndingWithTry(String input, int mode) {
        switch (mode) {
            case 1:
                try {
                    return Integer.parseInt(input);
                } catch (NumberFormatException e) {
                    return -1;
                }
            case 2:
                return input.length();
            default:
                return 0;
        }
    }

    // Single-case switch — boundary for fitSwitchGeometry with one column.
    public String singleCaseSwitch(int x) {
        switch (x) {
            default:
                return "only default";
        }
    }

    // Try-catch without any finally clause — exercises the tryLayout.ts fix
    // where finallyWidth was always included even when finallyBranch was null.
    public int tryCatchNoFinally(String s) {
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    // Try with multiple catches and no finally — tests multiple catch sections
    // in renderTryNode and the duplicate-divider fix.
    public int tryMultipleCatches(Object o) {
        try {
            int n = (Integer) o;
            return n * 2;
        } catch (ClassCastException e) {
            return -1;
        } catch (NullPointerException e) {
            return -2;
        }
    }

    // Empty then-branch — exercises the first-pass fix that changed the
    // thenBranch empty label from EMPTY_ELSE_LABEL ("∅") to EMPTY_BODY_LABEL
    // ("(empty)"). The ∅ symbol should now only appear in absent else branches.
    public void emptyThenBranch(boolean condition) {
        if (condition) {
            // intentionally empty then-branch
        } else {
            System.out.println("condition was false");
        }
    }

    // Do-while inside an if-branch — tests that the inset-band geometry for
    // do-while is rendered correctly when nested inside a branch column.
    public int doWhileInsideIf(int n) {
        if (n > 0) {
            int x = n;
            do {
                x--;
            } while (x > 0);
            return x;
        }
        return -1;
    }

    // If-branch inside a switch case — tests that the branch-fill wrapper
    // (branchPaddedRemainder) is correctly applied inside a switch case body
    // that itself contains an if-else.
    public int switchCaseWithIfElse(int code, int value) {
        switch (code) {
            case 0:
                if (value > 0) {
                    return value * 2;
                } else {
                    return 0;
                }
            case 1:
                return value + 1;
            default:
                return -1;
        }
    }

    // Try inside a while loop — verifies that try-block rendering composes
    // correctly when the loop body contains a try/catch/finally.
    public int tryInsideWhile(String[] items) {
        int total = 0;
        int i = 0;
        while (i < items.length) {
            try {
                total += Integer.parseInt(items[i]);
            } catch (NumberFormatException e) {
                total += 0;
            } finally {
                i++;
            }
        }
        return total;
    }
}
