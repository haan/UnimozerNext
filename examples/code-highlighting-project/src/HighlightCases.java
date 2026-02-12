/**
 * Scope-highlighting focused Java sample.
 */

public class HighlightCases {

    private int counter = 0;

    /**
     * Sequential instructions only.
     */
    public int sequentialOnly(int a, int b) {
        int sum = a + b;
        int scaled = sum * 2;
        int result = scaled - 3;
        return result;
    }

    /**
     * Nested if/while with else-if branches.
     */
    public boolean binarySearch(int[] arr, int x) {
        int left = 0;
        int right = arr.length;
        while (left <= right) {
            int mid = (left + right) / 2;
            if (arr[mid] == x) {
                return true;
            } else if (arr[mid] < x) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
        return false;
    }

    /**
     * Single switch with grouped cases.
     */
    public String singleSwitch(int day) {
        switch (day) {
            case 1:
                return "Monday";
            case 2:
                return "Tuesday";
            case 3:
            case 4:
                return "Midweek";
            default:
                return "Other";
        }
    }

    /**
     * try/catch/finally, inline comments, and strings containing braces.
     */
    public int mixedControl(int value) {
        String bracesInString = "{ not a real block }";
        char openBrace = '{';
        if (value < 0) {
            // Use next level color for control structure line.
            return -value + bracesInString.length() + openBrace;
        }

        try {
            int total = 0;
            for (int i = 0; i < value; i++) {
                if (i % 2 == 0) {
                    total += i;
                } else {
                    total -= i;
                }
            }
            return total;
        } catch (RuntimeException ex) {
            return -1;
        } finally {
            counter++;
        }
    }

    public int getCounter() {
        return counter;
    }
}
