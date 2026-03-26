public class MethodLoopRunner {

    private long counter = 0;

    public void endlessSilentLoop() {
        while (true) {
            counter++;
        }
    }

    public void endlessPrintLoop() {
        while (true) {
            counter++;
            if (counter % 1_000_000 == 0) {
                System.out.println("method loop counter = " + counter);
            }
        }
    }

    public long getCounter() {
        return counter;
    }
}
