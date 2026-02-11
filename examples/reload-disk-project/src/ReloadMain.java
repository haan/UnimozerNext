public class ReloadMain {
    public static void main(String[] args) {
        ReloadTarget target = new ReloadTarget("v1");
        MathService math = new MathService();
        TextService text = new TextService();

        String name = text.titleCase(text.normalizeName("  alice   smoke  "));
        target.nextCounter();
        target.nextCounter();

        System.out.println(target.buildMessage(name));
        System.out.println("sum(4, 5) = " + math.sum(4, 5));
        System.out.println("factorial(5) = " + math.factorial(5));
    }
}
