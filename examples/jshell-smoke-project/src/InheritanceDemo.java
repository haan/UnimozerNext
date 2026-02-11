public class InheritanceDemo {
    private static class Counter {
        protected int value;

        public Counter(int start) {
            value = start;
        }

        public void inc() {
            value++;
        }

        public int getValue() {
            return value;
        }
    }

    private static class NamedCounter extends Counter {
        private final String name;

        public NamedCounter(String name, int start) {
            super(start);
            this.name = name;
        }

        @Override
        public void inc() {
            super.inc();
            System.out.println(name + " -> " + value);
        }

        public String getName() {
            return name;
        }
    }

    public InheritanceDemo() {}

    public int runCounter(String name, int start, int steps) {
        NamedCounter c = new NamedCounter(name, start);
        for (int i = 0; i < steps; i++) {
            c.inc();
        }
        return c.getValue();
    }

    public static void main(String[] args) {
        InheritanceDemo d = new InheritanceDemo();
        int result = d.runCounter("demo", 3, 4);
        System.out.println("final=" + result);
    }
}
