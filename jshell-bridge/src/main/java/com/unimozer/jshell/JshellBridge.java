package com.unimozer.jshell;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jdk.jshell.Diag;
import jdk.jshell.JShell;
import jdk.jshell.Snippet;
import jdk.jshell.SnippetEvent;
import jdk.jshell.VarSnippet;

import java.io.ByteArrayOutputStream;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class JshellBridge {
    private static final String RESPONSE_PREFIX = "__UNIMOZER_BRIDGE__:";
    private final ObjectMapper mapper = new ObjectMapper();
    private final JShell jshell;

    private JshellBridge(String classpath) {
        this.jshell = JShell.builder().build();
        addBridgeClasspath();
        if (classpath != null && !classpath.isBlank()) {
            jshell.addToClasspath(classpath);
        }
    }

    public static void main(String[] args) throws Exception {
        String classpath = null;
        for (int i = 0; i < args.length; i++) {
            String arg = args[i];
            if ("--classpath".equals(arg) || "--class-path".equals(arg)) {
                if (i + 1 < args.length) {
                    classpath = args[i + 1];
                    i++;
                }
            }
        }

        JshellBridge bridge = new JshellBridge(classpath);
        bridge.run();
    }

    private void addBridgeClasspath() {
        try {
            Path path = Path.of(JshellBridge.class.getProtectionDomain().getCodeSource().getLocation().toURI());
            jshell.addToClasspath(path.toString());
        } catch (Exception ignored) {
            // If we cannot resolve the bridge path, Inspector may not be available.
        }
    }

    private void run() throws Exception {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
             PrintWriter writer = new PrintWriter(System.out, true, StandardCharsets.UTF_8)) {
            String line;
            while ((line = reader.readLine()) != null) {
                String trimmed = line.trim();
                if (trimmed.isEmpty()) continue;
                ObjectNode response;
                try {
                    JsonNode request = mapper.readTree(trimmed);
                    String cmd = request.path("cmd").asText("");
                    response = switch (cmd) {
                        case "eval" -> handleEval(request.path("code").asText(""));
                        case "inspect" -> handleInspect(request.path("var").asText(""));
                        case "vars" -> handleVars();
                        case "reset" -> handleReset();
                        default -> errorResponse("Unknown command");
                    };
                } catch (Throwable error) {
                    response = errorResponse(error.getMessage());
                }
                writer.println(RESPONSE_PREFIX + mapper.writeValueAsString(response));
            }
        }
    }

    private ObjectNode handleEval(String code) {
        EvalResult eval = evaluate(code);
        ObjectNode node = mapper.createObjectNode();
        node.put("ok", eval.ok);
        if (eval.stdout != null) node.put("stdout", eval.stdout);
        if (eval.stderr != null) node.put("stderr", eval.stderr);
        if (eval.value != null) node.put("value", eval.value);
        if (eval.error != null) {
            node.put("error", eval.error);
        } else if (!eval.ok) {
            node.put("error", "Unknown error");
        }
        return node;
    }

    private ObjectNode handleInspect(String varName) {
        if (varName == null || varName.isBlank()) {
            return errorResponse("Missing variable name");
        }
        Path tempFile;
        try {
            tempFile = Files.createTempFile("unimozer-inspect-", ".json");
        } catch (Exception error) {
            return errorResponse("Failed to create temp file: " + error.getMessage());
        }
        String escapedPath = escapeJavaString(tempFile.toString());
        EvalResult eval = evaluate(
            "com.unimozer.jshell.Inspector.inspectToFile(" + varName + ", \"" + escapedPath + "\")"
        );
        if (!eval.ok) {
            try {
                Files.deleteIfExists(tempFile);
            } catch (Exception ignored) {
                // Ignore cleanup failures.
            }
            String message = eval.error != null ? eval.error : "Inspection failed";
            return errorResponse(message);
        }
        try {
            String payload = Files.readString(tempFile, StandardCharsets.UTF_8);
            JsonNode result;
            try {
                result = mapper.readTree(payload);
            } catch (Exception primary) {
                int start = payload.indexOf('{');
                int end = payload.lastIndexOf('}');
                if (start >= 0 && end > start) {
                    String trimmed = payload.substring(start, end + 1);
                    result = mapper.readTree(trimmed);
                } else {
                    throw primary;
                }
            }
            ObjectNode node = mapper.createObjectNode();
            node.put("ok", true);
            node.setAll((ObjectNode) result);
            return node;
        } catch (Exception error) {
            return errorResponse(error.getMessage());
        } finally {
            try {
                Files.deleteIfExists(tempFile);
            } catch (Exception ignored) {
                // Ignore cleanup failures.
            }
        }
    }

    private ObjectNode handleVars() {
        ObjectNode node = mapper.createObjectNode();
        List<ObjectNode> vars = new ArrayList<>();
        jshell.variables().forEach(var -> {
            ObjectNode entry = mapper.createObjectNode();
            entry.put("name", var.name());
            entry.put("type", var.typeName());
            entry.put("value", jshell.varValue(var));
            entry.put("visibility", "public");
            entry.put("isStatic", false);
            vars.add(entry);
        });
        node.put("ok", true);
        node.set("vars", mapper.valueToTree(vars));
        return node;
    }

    private ObjectNode handleReset() {
        jshell.close();
        return mapper.createObjectNode().put("ok", true);
    }

    private EvalResult evaluate(String code) {
        EvalResult result = new EvalResult();
        StringBuilder diagnostics = new StringBuilder();
        ByteArrayOutputStream outBuffer = new ByteArrayOutputStream();
        ByteArrayOutputStream errBuffer = new ByteArrayOutputStream();
        PrintStream originalOut = System.out;
        PrintStream originalErr = System.err;
        System.setOut(new PrintStream(outBuffer, true, StandardCharsets.UTF_8));
        System.setErr(new PrintStream(errBuffer, true, StandardCharsets.UTF_8));
        try {
            List<SnippetEvent> events = jshell.eval(code);
            for (SnippetEvent event : events) {
                if (event.status() == Snippet.Status.REJECTED) {
                    result.ok = false;
                    jshell.diagnostics(event.snippet()).forEach(diag ->
                        diagnostics.append(diag.getMessage(Locale.getDefault())).append('\n')
                    );
                }
                if (event.exception() != null) {
                    result.ok = false;
                    result.error = event.exception().toString();
                }
                if (event.value() != null) {
                    result.value = event.value();
                }
            }
        } catch (Throwable error) {
            result.ok = false;
            result.error = error.toString();
        } finally {
            System.setOut(originalOut);
            System.setErr(originalErr);
        }
        if (diagnostics.length() > 0) {
            result.error = diagnostics.toString().trim();
            result.ok = false;
        }
        result.stdout = outBuffer.toString(StandardCharsets.UTF_8);
        result.stderr = errBuffer.toString(StandardCharsets.UTF_8);
        return result;
    }

    private ObjectNode errorResponse(String message) {
        ObjectNode node = mapper.createObjectNode();
        node.put("ok", false);
        node.put("error", message == null ? "Unknown error" : message);
        return node;
    }

    private String escapeJavaString(String input) {
        if (input == null) return "";
        return input.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static final class EvalResult {
        private boolean ok = true;
        private String stdout;
        private String stderr;
        private String value;
        private String error;
    }
}
