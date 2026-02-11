public class StructogramMain {
    public static void main(String[] args) {
        StructogramCases cases = new StructogramCases();
        int[] values = { -2, 1, 5, 11 };

        System.out.println("nestedIfElse(78) = " + cases.nestedIfElse(78));
        System.out.println("forAndWhile(4) = " + cases.forAndWhile(4));
        System.out.println("switchWithFallthrough(7) = " + cases.switchWithFallthrough(7));
        System.out.println("doWhileAndBreak(8) = " + cases.doWhileAndBreak(8));
        System.out.println("tryCatchFinally(\"123\") = " + cases.tryCatchFinally("123"));
        System.out.println("foreachWithContinue(values) = " + cases.foreachWithContinue(values));
        System.out.println("complexFlow(values, 4) = " + cases.complexFlow(values, 4));
    }
}
