public class JshellEdgeCases {
    private String label;

    public JshellEdgeCases() {
        this("default");
    }

    public JshellEdgeCases(String label) {
        this.label = label;
        System.out.println("ctor label=" + label);
    }

    public void unicodeAndEscapes() {
        System.out.println("Unicode: äöü 漢字 😀");
        System.out.println("Tab:\tBackslash:\\ Quote:\"");
    }

    public void largeOutput(int lines) {
        for (int i = 0; i < lines; i++) {
            System.out.println("line-" + i);
        }
    }

    public void jsonLikeOutput() {
        for (int i = 0; i < 20; i++) {
            System.out.println("{\"ok\":true,\"idx\":" + i + "}");
        }
    }

    public void stderrOutput() {
        for (int i = 0; i < 10; i++) {
            System.err.println("ERR-" + i);
        }
    }

    public static void main(String[] args) {
        JshellEdgeCases t = new JshellEdgeCases("main");
        t.unicodeAndEscapes();
    }
}
