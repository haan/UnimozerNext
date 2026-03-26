public class InfiniteLoopMain {

    public static void main(String[] args) {
        long counter = 0;
        while (true) {
            counter++;
            if (counter % 1_000_000 == 0) {
                System.out.println("main loop counter = " + counter);
            }
        }
    }
}
