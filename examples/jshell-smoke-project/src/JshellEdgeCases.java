public class JshellEdgeCases {
    private String label;

    public JshellEdgeCases() {
        this("default");
    }

    public JshellEdgeCases(String label) {
        this.label = label;
        System.out.println("ctor label=" + label);
    }

    public JshellEdgeCases(String label, int constructorFloodLines) {
        this(label);
        floodOutput("ctor-flood", constructorFloodLines);
    }

    public void unicodeAndEscapes() {
        System.out.println("Unicode: äöü 漢字 😀");
        System.out.println("Tab:\tBackslash:\\ Quote:\"");
    }

    public void unicodeStress() {
        System.out.println("Unicode stress: äöü ß ñ ç Ω π λ 漢字 😀 🚀");
        System.out.println("Escapes: \\n \\t \\\" \\\\");
        System.out.println("Mixed script: Latin Ελληνικά Кириллица 日本語");
    }

    public void largeOutput(int lines) {
        for (int i = 0; i < lines; i++) {
            System.out.println("line-" + i);
        }
    }

    public void protocolFlood(int lines) {
        floodOutput("flood", lines);
    }

    public void protocolFloodUnicode(int lines) {
        for (int i = 0; i < lines; i++) {
            System.out.println("unicode-line-" + i + " äöü 漢字 😀");
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

    private void floodOutput(String prefix, int lines) {
        for (int i = 0; i < lines; i++) {
            System.out.println(prefix + "-" + i);
        }
    }

    public static void main(String[] args) {
        JshellEdgeCases t = new JshellEdgeCases("main");
        t.unicodeAndEscapes();
        t.unicodeStress();
    }
}
