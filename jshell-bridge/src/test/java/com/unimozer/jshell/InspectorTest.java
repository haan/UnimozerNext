package com.unimozer.jshell;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class InspectorTest {

    // A simple known class used as inspection target.
    static class Point {
        public int x;
        private int y;
        protected String label;

        Point(int x, int y, String label) {
            this.x = x;
            this.y = y;
            this.label = label;
        }
    }

    static class ColorPoint extends Point {
        private String color;

        ColorPoint(int x, int y, String label, String color) {
            super(x, y, label);
            this.color = color;
        }
    }

    @Test
    void inspect_null_returnsNullTypeName() {
        String json = Inspector.inspect(null);

        assertNotNull(json);
        assertTrue(json.contains("\"typeName\":\"null\""), "null input should produce typeName 'null'");
        assertTrue(json.contains("\"fields\":[]"), "null input should have empty fields");
    }

    @Test
    void inspect_stringObject_doesNotThrow() {
        assertDoesNotThrow(() -> Inspector.inspect("hello world"));
    }

    @Test
    void inspect_integerObject_includesTypeName() {
        String json = Inspector.inspect(42);
        assertTrue(json.contains("typeName"), "Result should include typeName key");
        assertFalse(json.contains("\"typeName\":\"null\""), "Integer should not be null type");
    }

    @Test
    void inspect_customClass_exposesPublicField() {
        Point p = new Point(10, 20, "origin");
        String json = Inspector.inspect(p);

        assertTrue(json.contains("\"name\":\"x\""), "Should expose field x");
        assertTrue(json.contains("\"value\":\"10\""), "Should expose x value");
    }

    @Test
    void inspect_customClass_exposesPrivateField() {
        Point p = new Point(10, 20, "origin");
        String json = Inspector.inspect(p);

        assertTrue(json.contains("\"name\":\"y\""), "Should expose private field y via setAccessible");
        assertTrue(json.contains("\"value\":\"20\""), "Should expose y value");
    }

    @Test
    void inspect_customClass_exposesFieldVisibility() {
        Point p = new Point(1, 2, "test");
        String json = Inspector.inspect(p);

        assertTrue(json.contains("\"visibility\":\"public\""), "x should be public");
        assertTrue(json.contains("\"visibility\":\"private\""), "y should be private");
        assertTrue(json.contains("\"visibility\":\"protected\""), "label should be protected");
    }

    @Test
    void inspect_customClass_correctTypeName() {
        Point p = new Point(0, 0, "zero");
        String json = Inspector.inspect(p);

        assertTrue(json.contains("InspectorTest$Point") || json.contains("Point"),
            "typeName should reference the Point class");
    }

    @Test
    void inspect_subclass_exposesInheritedFields() {
        ColorPoint cp = new ColorPoint(5, 5, "colored", "red");
        String json = Inspector.inspect(cp);

        assertTrue(json.contains("\"name\":\"color\""), "Own field 'color' should appear");
        assertTrue(json.contains("\"name\":\"x\"") || json.contains("isInherited"),
            "Inherited fields from parent should appear");
    }

    @Test
    void inspect_outputIsValidJsonStructure() {
        String json = Inspector.inspect(new Point(1, 2, "p"));

        assertTrue(json.startsWith("{"), "Output should start with {");
        assertTrue(json.endsWith("}"), "Output should end with }");
        assertTrue(json.contains("\"typeName\""), "Output should have typeName key");
        assertTrue(json.contains("\"fields\""), "Output should have fields key");
        assertTrue(json.contains("\"inheritedMethods\""), "Output should have inheritedMethods key");
    }

    @Test
    void warm_existingClass_doesNotThrow() {
        assertDoesNotThrow(() -> Inspector.warm("java.lang.String"));
    }

    @Test
    void warm_nonexistentClass_doesNotThrow() {
        assertDoesNotThrow(() -> Inspector.warm("com.nonexistent.ClassName"));
    }
}
