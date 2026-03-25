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
    private static final String DIAG_POST_PREFIX = "__UNIMOZER_BRIDGE_DIAG__:";
    private final ObjectMapper mapper = new ObjectMapper();
    private final String classpath;
    private final List<String> remoteVmOptions;
    private JShell jshell;

    private JshellBridge(String classpath, List<String> remoteVmOptions) {
        this.classpath = classpath;
        this.remoteVmOptions = List.copyOf(remoteVmOptions);
        this.jshell = createShell(classpath, this.remoteVmOptions);
    }

    public static void main(String[] args) throws Exception {
        String classpath = null;
        List<String> remoteVmOptions = new ArrayList<>();
        for (int i = 0; i < args.length; i++) {
            String arg = args[i];
            if ("--classpath".equals(arg) || "--class-path".equals(arg)) {
                if (i + 1 < args.length) {
                    classpath = args[i + 1];
                    i++;
                }
            } else if ("--remote-vm-option".equals(arg)) {
                if (i + 1 < args.length) {
                    remoteVmOptions.add(args[i + 1]);
                    i++;
                }
            }
        }

        JshellBridge bridge = new JshellBridge(classpath, remoteVmOptions);
        bridge.run();
    }

    private JShell createShell(String classpath, List<String> remoteVmOptions) {
        JShell.Builder builder = JShell.builder();
        if (!remoteVmOptions.isEmpty()) {
            builder.remoteVMOptions(remoteVmOptions.toArray(new String[0]));
        }
        builder.executionEngine("local");
        JShell shell = builder.build();
        System.err.println("[jshell-bridge] execution mode=local");
        addBridgeClasspath(shell);
        if (classpath != null && !classpath.isBlank()) {
            shell.addToClasspath(classpath);
        }
        return shell;
    }

    private void addBridgeClasspath(JShell shell) {
        try {
            Path path = Path.of(JshellBridge.class.getProtectionDomain().getCodeSource().getLocation().toURI());
            shell.addToClasspath(path.toString());
        } catch (Exception ignored) {
            // If we cannot resolve the bridge path, Inspector may not be available.
        }
    }

    private void run() throws Exception {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
             PrintWriter writer = new PrintWriter(System.out, true, StandardCharsets.UTF_8)) {
            String line;
            while ((line = reader.readLine()) != null) {
                long totalStartNs = System.nanoTime();
                String trimmed = line.trim();
                if (trimmed.isEmpty()) continue;
                ObjectNode response;
                BridgeDiagRequest diagRequest = BridgeDiagRequest.disabled();
                long parseNs = 0L;
                long dispatchNs = 0L;
                long handlerNs = 0L;
                Long evalNs = null;
                try {
                    long parseStartNs = System.nanoTime();
                    JsonNode request = mapper.readTree(trimmed);
                    parseNs = System.nanoTime() - parseStartNs;
                    diagRequest = BridgeDiagRequest.from(request.path("_diag"));
                    String cmd = request.path("cmd").asText("");
                    long dispatchStartNs = System.nanoTime();
                    BridgeCommandResult commandResult = executeCommand(cmd, request);
                    dispatchNs = System.nanoTime() - dispatchStartNs;
                    handlerNs = commandResult.handlerNs;
                    evalNs = commandResult.evalNs;
                    response = commandResult.response;
                } catch (Throwable error) {
                    response = errorResponse(error.getMessage());
                }

                if (diagRequest.enabled) {
                    attachDiagTiming(
                        response,
                        diagRequest.commandId,
                        parseNs,
                        dispatchNs,
                        handlerNs,
                        evalNs
                    );
                }

                long serializeStartNs = System.nanoTime();
                String serialized = mapper.writeValueAsString(response);
                long serializeNs = System.nanoTime() - serializeStartNs;
                if (diagRequest.enabled) {
                    ObjectNode diagNode = response.with("_diag");
                    diagNode.put("serializeMs", nanosToMs(serializeNs));
                    serialized = mapper.writeValueAsString(response);
                }

                long writeStartNs = System.nanoTime();
                writer.println(RESPONSE_PREFIX + serialized);
                writer.flush();
                long writeNs = System.nanoTime() - writeStartNs;

                if (diagRequest.enabled) {
                    emitPostWriteDiagnostic(
                        response,
                        diagRequest.commandId,
                        writeNs,
                        System.nanoTime() - totalStartNs
                    );
                }
            }
        }
    }

    private BridgeCommandResult executeCommand(String cmd, JsonNode request) {
        return switch (cmd) {
            case "eval" -> handleEval(request.path("code").asText(""));
            case "inspect" -> handleInspect(request.path("var").asText(""));
            case "vars" -> handleVars();
            case "reset" -> handleReset();
            default -> new BridgeCommandResult(errorResponse("Unknown command"), 0L, null);
        };
    }

    private BridgeCommandResult handleEval(String code) {
        long handlerStartNs = System.nanoTime();
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
        return new BridgeCommandResult(node, System.nanoTime() - handlerStartNs, eval.evalNs);
    }

    private BridgeCommandResult handleInspect(String varName) {
        long handlerStartNs = System.nanoTime();
        if (varName == null || varName.isBlank()) {
            return new BridgeCommandResult(
                errorResponse("Missing variable name"),
                System.nanoTime() - handlerStartNs,
                null
            );
        }
        if (!isValidJavaIdentifier(varName)) {
            return new BridgeCommandResult(
                errorResponse("Invalid variable name"),
                System.nanoTime() - handlerStartNs,
                null
            );
        }
        Path tempFile;
        try {
            tempFile = Files.createTempFile("unimozer-inspect-", ".json");
        } catch (Exception error) {
            return new BridgeCommandResult(
                errorResponse("Failed to create temp file: " + error.getMessage()),
                System.nanoTime() - handlerStartNs,
                null
            );
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
            return new BridgeCommandResult(
                errorResponse(message),
                System.nanoTime() - handlerStartNs,
                eval.evalNs
            );
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
            return new BridgeCommandResult(node, System.nanoTime() - handlerStartNs, eval.evalNs);
        } catch (Exception error) {
            return new BridgeCommandResult(
                errorResponse(error.getMessage()),
                System.nanoTime() - handlerStartNs,
                eval.evalNs
            );
        } finally {
            try {
                Files.deleteIfExists(tempFile);
            } catch (Exception ignored) {
                // Ignore cleanup failures.
            }
        }
    }

    private BridgeCommandResult handleVars() {
        long handlerStartNs = System.nanoTime();
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
        return new BridgeCommandResult(node, System.nanoTime() - handlerStartNs, null);
    }

    private BridgeCommandResult handleReset() {
        long handlerStartNs = System.nanoTime();
        try {
            jshell.close();
            jshell = createShell(classpath, remoteVmOptions);
            return new BridgeCommandResult(
                mapper.createObjectNode().put("ok", true),
                System.nanoTime() - handlerStartNs,
                null
            );
        } catch (Exception error) {
            return new BridgeCommandResult(
                errorResponse(error.getMessage()),
                System.nanoTime() - handlerStartNs,
                null
            );
        }
    }

    private EvalResult evaluate(String code) {
        EvalResult result = new EvalResult();
        long evalStartNs = System.nanoTime();
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
        result.evalNs = System.nanoTime() - evalStartNs;
        return result;
    }

    private void attachDiagTiming(
        ObjectNode response,
        String commandId,
        long parseNs,
        long dispatchNs,
        long handlerNs,
        Long evalNs
    ) {
        ObjectNode diag = response.putObject("_diag");
        diag.put("commandId", commandId);
        diag.put("parseMs", nanosToMs(parseNs));
        diag.put("dispatchMs", nanosToMs(dispatchNs));
        diag.put("handlerMs", nanosToMs(handlerNs));
        if (evalNs != null) {
            diag.put("evalMs", nanosToMs(evalNs));
        }
        diag.put("ok", response.path("ok").asBoolean(false));
        if (response.has("error") && response.path("error").isTextual()) {
            diag.put("error", response.path("error").asText());
        }
    }

    private void emitPostWriteDiagnostic(
        ObjectNode response,
        String commandId,
        long writeNs,
        long totalNs
    ) {
        try {
            ObjectNode diag = mapper.createObjectNode();
            diag.put("commandId", commandId);
            diag.put("writeMs", nanosToMs(writeNs));
            diag.put("totalMs", nanosToMs(totalNs));
            diag.put("ok", response.path("ok").asBoolean(false));
            if (response.has("error") && response.path("error").isTextual()) {
                diag.put("error", response.path("error").asText());
            }
            System.err.println(DIAG_POST_PREFIX + mapper.writeValueAsString(diag));
        } catch (Exception ignored) {
            // Diagnostic post logging must never break bridge behavior.
        }
    }

    private static double nanosToMs(long nanos) {
        return nanos / 1_000_000.0;
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

    private boolean isValidJavaIdentifier(String value) {
        if (value == null || value.isBlank()) return false;
        if (!Character.isJavaIdentifierStart(value.charAt(0))) return false;
        for (int i = 1; i < value.length(); i++) {
            if (!Character.isJavaIdentifierPart(value.charAt(i))) {
                return false;
            }
        }
        return true;
    }

    private static final class EvalResult {
        private boolean ok = true;
        private String stdout;
        private String stderr;
        private String value;
        private String error;
        private long evalNs;
    }

    private static final class BridgeCommandResult {
        private final ObjectNode response;
        private final long handlerNs;
        private final Long evalNs;

        private BridgeCommandResult(ObjectNode response, long handlerNs, Long evalNs) {
            this.response = response;
            this.handlerNs = handlerNs;
            this.evalNs = evalNs;
        }
    }

    private static final class BridgeDiagRequest {
        private final boolean enabled;
        private final String commandId;

        private BridgeDiagRequest(boolean enabled, String commandId) {
            this.enabled = enabled;
            this.commandId = commandId;
        }

        private static BridgeDiagRequest disabled() {
            return new BridgeDiagRequest(false, "");
        }

        private static BridgeDiagRequest from(JsonNode node) {
            if (node == null || !node.isObject()) {
                return disabled();
            }
            String commandId = node.path("commandId").asText("").trim();
            if (commandId.isEmpty()) {
                return disabled();
            }
            return new BridgeDiagRequest(true, commandId);
        }
    }
}
