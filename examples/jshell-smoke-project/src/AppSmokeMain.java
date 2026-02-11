public class AppSmokeMain {
    private String title;
    private int version;
    private static int launchCount = 0;

    public AppSmokeMain() {
        this("SmokeApp", 1);
    }

    public AppSmokeMain(String title, int version) {
        this.title = title;
        this.version = version;
        launchCount++;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public int sum(int a, int b) {
        int result = a + b;
        System.out.println("sum=" + result);
        return result;
    }

    public static int getLaunchCount() {
        return launchCount;
    }

    public static void main(String[] args) {
        AppSmokeMain app = new AppSmokeMain("MainRun", 2);
        System.out.println("App: " + app.title + " v" + app.version);
        System.out.println("Args count: " + args.length);
    }
}
