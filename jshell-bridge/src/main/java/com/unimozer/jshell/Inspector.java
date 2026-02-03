package com.unimozer.jshell;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Comparator;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

public final class Inspector {
    private Inspector() {}

    public static String inspect(Object obj) {
        InspectResult result = new InspectResult();
        if (obj == null) {
            result.typeName = "null";
            result.fields = List.of();
            result.inheritedMethods = List.of();
            return write(result);
        }

        Class<?> root = obj.getClass();
        result.typeName = root.getName();
        result.fields = new ArrayList<>();
        result.inheritedMethods = new ArrayList<>();

        Class<?> current = root;
        while (current != null && current != Object.class) {
            boolean inherited = current != root;
            Field[] fields = current.getDeclaredFields();
            for (Field field : fields) {
                FieldInfo info = new FieldInfo();
                info.name = field.getName();
                info.type = field.getType().getSimpleName();
                info.visibility = visibility(field.getModifiers());
                info.isStatic = Modifier.isStatic(field.getModifiers());
                info.isInherited = inherited;
                try {
                    field.setAccessible(true);
                    Object value = info.isStatic ? field.get(null) : field.get(obj);
                    info.value = String.valueOf(value);
                } catch (Exception error) {
                    info.value = "<error>";
                }
                result.fields.add(info);
            }
            current = current.getSuperclass();
        }

        java.util.Map<Class<?>, List<MethodInfo>> inheritedMap = new java.util.HashMap<>();
        for (Method method : root.getMethods()) {
            Class<?> declaring = method.getDeclaringClass();
            if (declaring == root || declaring.isInterface()) {
                continue;
            }
            if (!Modifier.isPublic(method.getModifiers())) {
                continue;
            }
            if (method.isSynthetic() || method.isBridge()) {
                continue;
            }
            MethodInfo info = new MethodInfo();
            info.name = method.getName();
            info.returnType = method.getReturnType().getTypeName();
            info.paramTypes = Arrays.stream(method.getParameterTypes())
                .map(Class::getTypeName)
                .toList();
            info.isStatic = Modifier.isStatic(method.getModifiers());
            info.visibility = visibility(method.getModifiers());
            inheritedMap.computeIfAbsent(declaring, key -> new ArrayList<>()).add(info);
        }

        Class<?> parent = root.getSuperclass();
        while (parent != null) {
            List<MethodInfo> methods = inheritedMap.get(parent);
            if (methods != null) {
                methods.sort(Comparator
                    .comparing((MethodInfo info) -> info.name, String.CASE_INSENSITIVE_ORDER)
                    .thenComparing(info -> String.join(",", info.paramTypes)));
                InheritedMethodGroup group = new InheritedMethodGroup();
                group.className = parent.getName();
                group.methods = methods;
                result.inheritedMethods.add(group);
            }
            parent = parent.getSuperclass();
        }

        return write(result);
    }

    public static boolean inspectToFile(Object obj, String path) {
        String payload = inspect(obj);
        try {
            Path output = Path.of(path);
            Files.writeString(output, payload, StandardCharsets.UTF_8);
            return true;
        } catch (Exception error) {
            return false;
        }
    }

    private static String write(InspectResult result) {
        StringBuilder sb = new StringBuilder();
        sb.append('{');
        sb.append("\"typeName\":\"").append(escapeJson(result.typeName)).append("\",");
        sb.append("\"fields\":");
        appendFields(sb, result.fields);
        sb.append(',');
        sb.append("\"inheritedMethods\":");
        appendInheritedMethods(sb, result.inheritedMethods);
        if (result.error != null && !result.error.isBlank()) {
            sb.append(",\"error\":\"").append(escapeJson(result.error)).append('"');
        }
        sb.append('}');
        return sb.toString();
    }

    private static void appendFields(StringBuilder sb, List<FieldInfo> fields) {
        sb.append('[');
        if (fields != null) {
            boolean first = true;
            for (FieldInfo field : fields) {
                if (!first) sb.append(',');
                first = false;
                sb.append('{');
                sb.append("\"name\":\"").append(escapeJson(field.name)).append("\",");
                sb.append("\"type\":\"").append(escapeJson(field.type)).append("\",");
                sb.append("\"value\":\"").append(escapeJson(field.value)).append("\",");
                sb.append("\"visibility\":\"").append(escapeJson(field.visibility)).append("\",");
                sb.append("\"isStatic\":").append(field.isStatic).append(',');
                sb.append("\"isInherited\":").append(field.isInherited);
                sb.append('}');
            }
        }
        sb.append(']');
    }

    private static void appendInheritedMethods(StringBuilder sb, List<InheritedMethodGroup> groups) {
        sb.append('[');
        if (groups != null) {
            boolean firstGroup = true;
            for (InheritedMethodGroup group : groups) {
                if (!firstGroup) sb.append(',');
                firstGroup = false;
                sb.append('{');
                sb.append("\"className\":\"").append(escapeJson(group.className)).append("\",");
                sb.append("\"methods\":");
                appendMethods(sb, group.methods);
                sb.append('}');
            }
        }
        sb.append(']');
    }

    private static void appendMethods(StringBuilder sb, List<MethodInfo> methods) {
        sb.append('[');
        if (methods != null) {
            boolean first = true;
            for (MethodInfo method : methods) {
                if (!first) sb.append(',');
                first = false;
                sb.append('{');
                sb.append("\"name\":\"").append(escapeJson(method.name)).append("\",");
                sb.append("\"returnType\":\"").append(escapeJson(method.returnType)).append("\",");
                sb.append("\"paramTypes\":");
                appendStringArray(sb, method.paramTypes);
                sb.append(',');
                sb.append("\"visibility\":\"").append(escapeJson(method.visibility)).append("\",");
                sb.append("\"isStatic\":").append(method.isStatic);
                sb.append('}');
            }
        }
        sb.append(']');
    }

    private static void appendStringArray(StringBuilder sb, List<String> values) {
        sb.append('[');
        if (values != null) {
            boolean first = true;
            for (String value : values) {
                if (!first) sb.append(',');
                first = false;
                sb.append('"').append(escapeJson(value)).append('"');
            }
        }
        sb.append(']');
    }

    private static String escapeJson(String input) {
        if (input == null) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < input.length(); i++) {
            char c = input.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        return sb.toString();
    }

    private static String visibility(int modifiers) {
        if (Modifier.isPublic(modifiers)) return "public";
        if (Modifier.isProtected(modifiers)) return "protected";
        if (Modifier.isPrivate(modifiers)) return "private";
        return "package";
    }

    static final class InspectResult {
        public String typeName;
        public List<FieldInfo> fields;
        public List<InheritedMethodGroup> inheritedMethods;
        public String error;
    }

    static final class FieldInfo {
        public String name;
        public String type;
        public String value;
        public String visibility;
        public boolean isStatic;
        public boolean isInherited;
    }

    static final class InheritedMethodGroup {
        public String className;
        public List<MethodInfo> methods;
    }

    static final class MethodInfo {
        public String name;
        public String returnType;
        public List<String> paramTypes;
        public String visibility;
        public boolean isStatic;
    }
}
