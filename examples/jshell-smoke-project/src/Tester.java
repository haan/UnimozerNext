public class Tester {
    private static int passedTests = 0;
    private static int failedTests = 0;

    public static void main(String[] args) {
        int largeOutputLines = parseLargeOutputLines(args);
        int protocolFloodLines = parseProtocolFloodLines(args);
        System.out.println("=== Unimozer Smoke Tester ===");
        System.out.println("largeOutput lines: " + largeOutputLines);
        System.out.println("protocolFlood lines: " + protocolFloodLines);

        runTest("AppSmokeMain constructor + sum", () -> {
            AppSmokeMain app = new AppSmokeMain("SmokeFromTester", 3);
            assertEquals("sum(3,4)", 7, app.sum(3, 4));
        });

        runTest("StudentRecord average + describe", () -> {
            StudentRecord.setSchoolName("Smoke School");
            StudentRecord student = new StudentRecord("Bob", 5);
            student.addGrade(4);
            student.addGrade(6);
            assertEquals("average()", 5.0, student.average());
            assertContains("describe()", student.describe(), "Bob @ Smoke School avg=5.0");
        });

        runTest("GeometryBox volume + scale", () -> {
            GeometryBox box = new GeometryBox(2, 3, 4);
            assertEquals("volume()", 24.0, box.volume());
            box.scale(2.0);
            assertEquals("volume() after scale", 192.0, box.volume());
            assertContains("dimensions()", box.dimensions(), "4.0 x 6.0 x 8.0");
        });

        runTest("InheritanceDemo counter", () -> {
            InheritanceDemo demo = new InheritanceDemo();
            assertEquals("runCounter(\"demo\", 3, 4)", 7, demo.runCounter("demo", 3, 4));
        });

        runTest("JshellEdgeCases constructor + unicode/escapes", () -> {
            JshellEdgeCases edgeCases = new JshellEdgeCases("tester");
            edgeCases.unicodeAndEscapes();
        });

        runTest("JshellEdgeCases unicode stress", () -> {
            JshellEdgeCases edgeCases = new JshellEdgeCases("unicode-stress");
            edgeCases.unicodeStress();
        });

        runTest("JshellEdgeCases constructor flood", () -> {
            new JshellEdgeCases("ctor-flood", 250);
        });

        runTest("JshellEdgeCases JSON-like output", () -> {
            JshellEdgeCases edgeCases = new JshellEdgeCases("json");
            edgeCases.jsonLikeOutput();
        });

        runTest("JshellEdgeCases large output", () -> {
            JshellEdgeCases edgeCases = new JshellEdgeCases("bulk");
            edgeCases.largeOutput(largeOutputLines);
        });

        runTest("JshellEdgeCases protocol flood", () -> {
            JshellEdgeCases edgeCases = new JshellEdgeCases("protocol");
            edgeCases.protocolFlood(protocolFloodLines);
        });

        runTest("JshellEdgeCases protocol flood unicode", () -> {
            JshellEdgeCases edgeCases = new JshellEdgeCases("protocol-unicode");
            edgeCases.protocolFloodUnicode(Math.max(500, protocolFloodLines / 2));
        });

        runTest("JshellEdgeCases stderr output", () -> {
            JshellEdgeCases edgeCases = new JshellEdgeCases("stderr");
            edgeCases.stderrOutput();
        });

        runTest("Run all class main methods", () -> {
            AppSmokeMain.main(new String[0]);
            StudentRecord.main(new String[0]);
            GeometryBox.main(new String[0]);
            InheritanceDemo.main(new String[0]);
            JshellEdgeCases.main(new String[0]);
        });

        System.out.println("=== Smoke Tester Summary ===");
        System.out.println("Passed: " + passedTests);
        System.out.println("Failed: " + failedTests);

        if (failedTests > 0) {
            System.exit(1);
        }
    }

    private static int parseLargeOutputLines(String[] args) {
        return parseIntArgOrDefault(args, 0, 2000);
    }

    private static int parseProtocolFloodLines(String[] args) {
        return parseIntArgOrDefault(args, 1, 6000);
    }

    private static int parseIntArgOrDefault(String[] args, int index, int fallback) {
        if (args.length <= index) {
            return fallback;
        }
        try {
            return Integer.parseInt(args[index]);
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static void runTest(String name, Runnable test) {
        System.out.println("\n--- " + name + " ---");
        try {
            test.run();
            passedTests++;
            System.out.println("[PASS] " + name);
        } catch (Throwable error) {
            failedTests++;
            System.out.println("[FAIL] " + name + ": " + error);
        }
    }

    private static void assertEquals(String label, int expected, int actual) {
        if (expected != actual) {
            throw new RuntimeException(label + " expected " + expected + " but was " + actual);
        }
    }

    private static void assertEquals(String label, double expected, double actual) {
        if (Math.abs(expected - actual) > 0.000001) {
            throw new RuntimeException(label + " expected " + expected + " but was " + actual);
        }
    }

    private static void assertContains(String label, String actual, String expectedSubstring) {
        if (actual == null || !actual.contains(expectedSubstring)) {
            throw new RuntimeException(
                    label + " expected to contain [" + expectedSubstring + "] but was [" + actual + "]");
        }
    }
}
