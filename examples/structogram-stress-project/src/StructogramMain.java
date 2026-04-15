public class StructogramMain {
    public static void main(String[] args) {
        StructogramCases cases = new StructogramCases();
        int[] values = { -2, 1, 5, 11 };

        // ── original cases ────────────────────────────────────────────────────
        System.out.println("nestedIfElse(78) = " + cases.nestedIfElse(78));
        System.out.println("forAndWhile(4) = " + cases.forAndWhile(4));
        System.out.println("switchWithFallthrough(7) = " + cases.switchWithFallthrough(7));
        System.out.println("doWhileAndBreak(8) = " + cases.doWhileAndBreak(8));
        System.out.println("tryCatchFinally(\"123\") = " + cases.tryCatchFinally("123"));
        System.out.println("foreachWithContinue(values) = " + cases.foreachWithContinue(values));
        System.out.println("complexFlow(values, 4) = " + cases.complexFlow(values, 4));

        // ── edge cases ────────────────────────────────────────────────────────
        System.out.println("ifBranchEndingWithWhile(5) = " + cases.ifBranchEndingWithWhile(5));
        System.out.println("ifBranchEndingWithNestedIf(1, 2) = " + cases.ifBranchEndingWithNestedIf(1, 2));
        System.out.println("switchCaseEndingWithTry(\"42\", 1) = " + cases.switchCaseEndingWithTry("42", 1));
        System.out.println("singleCaseSwitch(0) = " + cases.singleCaseSwitch(0));
        System.out.println("tryCatchNoFinally(\"7\") = " + cases.tryCatchNoFinally("7"));
        System.out.println("tryMultipleCatches(3) = " + cases.tryMultipleCatches(3));
        cases.emptyThenBranch(false);
        System.out.println("doWhileInsideIf(4) = " + cases.doWhileInsideIf(4));
        System.out.println("switchCaseWithIfElse(0, 3) = " + cases.switchCaseWithIfElse(0, 3));
        String[] items = { "10", "bad", "5" };
        System.out.println("tryInsideWhile(items) = " + cases.tryInsideWhile(items));
    }
}
