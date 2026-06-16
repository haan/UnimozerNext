public class ArrayDisplayItem {
    private final String label;
    private final int value;

    public ArrayDisplayItem(String label, int value) {
        this.label = label;
        this.value = value;
    }

    @Override
    public String toString() {
        return label + ":" + value;
    }
}
