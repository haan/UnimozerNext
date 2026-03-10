public class RandomStatistics {
    private int min = 0, max = 100;
    private int l = 1;

    public void printSeries(long pN) {
        long i = 1;
        long n = 0;

        while (i <= pN) {
            n = (long) (Math.random() * (max - min + 1)) + min;

            if (l == 1) {
                System.out.print(n);
                l += 1;
            } else if (l < 20) {
                System.out.print(", " + n);
                l = l + 1;
            } else {
                System.out.println(", " + n);
                l = 1;
            }

            i++;
        }
    }
}
