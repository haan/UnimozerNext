package com.unimozer.jshell;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.List;

public final class Inspector {
    private static final ObjectMapper mapper = new ObjectMapper();

    private Inspector() {}

    public static String inspect(Object obj) {
        InspectResult result = new InspectResult();
        if (obj == null) {
            result.typeName = "null";
            result.fields = List.of();
            return write(result);
        }

        Class<?> root = obj.getClass();
        result.typeName = root.getName();
        result.fields = new ArrayList<>();

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

        return write(result);
    }

    private static String write(InspectResult result) {
        try {
            return mapper.writeValueAsString(result);
        } catch (Exception error) {
            return "{\"typeName\":\"\",\"fields\":[],\"error\":\"" + error.getMessage() + "\"}";
        }
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
}
