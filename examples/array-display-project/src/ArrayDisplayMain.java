public class ArrayDisplayMain {
    public static void main(String[] args) {
        ArrayDisplayCases cases = new ArrayDisplayCases();
        System.out.println("Array display cases ready");
        System.out.println("largeNumbers length: " + cases.largeNumbersLength());
        System.out.println("matrix rows: " + cases.matrixRows());
        System.out.println(cases.describe());
    }
}
