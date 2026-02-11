public class StructogramCases {
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
}
