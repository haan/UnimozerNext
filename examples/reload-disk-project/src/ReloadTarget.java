public class ReloadTarget {
    private String versionLabel;
    private int counter;

    public ReloadTarget(String versionLabel) {
        this.versionLabel = versionLabel;
        this.counter = 0;
    }

    public String getVersionLabel() {
        return versionLabel;
    }

    public void setVersionLabel(String versionLabel) {
        this.versionLabel = versionLabel;
    }

    public int nextCounter() {
        counter++;
        return counter;
    }

    public String buildMessage(String name) {
        return "[" + versionLabel + "] Hello " + name + " (" + counter + ")";
    }
}
