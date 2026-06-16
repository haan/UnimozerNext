public class ArrayDisplayCases extends ArrayDisplayBase {
    private int[] numbers = { 1, 2, 3, 4, 5 };
    private double[] decimals = { 1.25, 2.5, 3.75 };
    private boolean[] flags = { true, false, true, true };
    private char[] letters = { 'a', 'b', 'c' };
    private String[] names = { "Ada", "Grace", null, "Linus" };
    private int[][] matrix = {
            { 1, 2, 3 },
            { 4, 5, 6 },
            { 7, 8, 9 }
    };
    private String[][] raggedNames = {
            { "north" },
            {},
            { "south", null, "east" }
    };
    private ArrayDisplayItem[] items = {
            new ArrayDisplayItem("alpha", 10),
            new ArrayDisplayItem("beta", 20),
            null,
            new ArrayDisplayItem("gamma", 30)
    };
    private ArrayDisplayItem[][] itemGrid = {
            { new ArrayDisplayItem("r0c0", 1), new ArrayDisplayItem("r0c1", 2) },
            { new ArrayDisplayItem("r1c0", 3) }
    };
    private int[] emptyNumbers = {};
    private String[] allNulls = { null, null, null };
    private int[] largeNumbers = {
            0, 1, 2, 3, 4, 5, 6, 7,
            8, 9, 10, 11, 12, 13, 14, 15,
            16, 17, 18, 19, 20, 21, 22, 23,
            24, 25, 26, 27, 28, 29, 30, 31
    };

    public ArrayDisplayCases() {
    }

    public int largeNumbersLength() {
        return largeNumbers.length;
    }

    public int matrixRows() {
        return matrix.length;
    }

    public String describe() {
        return "numbers=" + numbers.length
                + ", names=" + names.length
                + ", items=" + items.length;
    }
}
