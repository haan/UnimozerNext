package com.unimozer.parser;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class ParserBridgeParseTest {

    // Build a minimal parseGraph request pointing srcRoot at the given directory.
    private static ParserBridge.Request req(Path srcRoot) {
        ParserBridge.Request r = new ParserBridge.Request();
        r.root = srcRoot.getParent().toString();
        r.srcRoot = srcRoot.toAbsolutePath().toString();
        return r;
    }

    @Test
    void parseGraph_emptyDirectory_returnsEmptyGraph(@TempDir Path dir) throws IOException {
        ParserBridge.Graph g = ParserBridge.parseGraph(req(dir));
        assertTrue(g.nodes.isEmpty(), "Expected no nodes for empty directory");
        assertTrue(g.edges.isEmpty(), "Expected no edges for empty directory");
        assertTrue(g.failedFiles.isEmpty());
    }

    @Test
    void parseGraph_simpleClass_returnsSingleClassNode(@TempDir Path dir) throws IOException {
        Files.writeString(dir.resolve("SimpleClass.java"),
            "public class SimpleClass { private int value; }");

        ParserBridge.Graph g = ParserBridge.parseGraph(req(dir));

        assertEquals(1, g.nodes.size());
        ParserBridge.Node node = g.nodes.get(0);
        assertEquals("SimpleClass", node.name);
        assertEquals("class", node.kind);
        assertFalse(node.isAbstract);
    }

    @Test
    void parseGraph_abstractClass_isAbstractTrue(@TempDir Path dir) throws IOException {
        Files.writeString(dir.resolve("Shape.java"),
            "public abstract class Shape { public abstract void draw(); }");

        ParserBridge.Graph g = ParserBridge.parseGraph(req(dir));

        assertEquals(1, g.nodes.size());
        assertTrue(g.nodes.get(0).isAbstract);
    }

    @Test
    void parseGraph_interface_kindIsInterface(@TempDir Path dir) throws IOException {
        Files.writeString(dir.resolve("Drivable.java"),
            "public interface Drivable { void drive(); }");

        ParserBridge.Graph g = ParserBridge.parseGraph(req(dir));

        assertEquals(1, g.nodes.size());
        assertEquals("interface", g.nodes.get(0).kind);
    }

    @Test
    void parseGraph_multipleFiles_returnsMultipleNodes(@TempDir Path dir) throws IOException {
        Files.writeString(dir.resolve("Animal.java"), "public class Animal {}");
        Files.writeString(dir.resolve("Dog.java"), "public class Dog extends Animal {}");

        ParserBridge.Graph g = ParserBridge.parseGraph(req(dir));

        assertEquals(2, g.nodes.size());
    }

    @Test
    void parseGraph_extendsRelationship_producesExtendsEdge(@TempDir Path dir) throws IOException {
        Files.writeString(dir.resolve("Animal.java"), "public class Animal {}");
        Files.writeString(dir.resolve("Dog.java"), "public class Dog extends Animal {}");

        ParserBridge.Graph g = ParserBridge.parseGraph(req(dir));

        boolean hasExtendsEdge = g.edges.stream().anyMatch(e -> "extends".equals(e.kind));
        assertTrue(hasExtendsEdge, "Expected an extends edge between Dog and Animal");
    }

    @Test
    void parseGraph_implementsRelationship_producesImplementsEdge(@TempDir Path dir) throws IOException {
        Files.writeString(dir.resolve("Runnable.java"), "public interface Runnable { void run(); }");
        Files.writeString(dir.resolve("Runner.java"), "public class Runner implements Runnable { public void run() {} }");

        ParserBridge.Graph g = ParserBridge.parseGraph(req(dir));

        boolean hasImplementsEdge = g.edges.stream().anyMatch(e -> "implements".equals(e.kind));
        assertTrue(hasImplementsEdge, "Expected an implements edge between Runner and Runnable");
    }

    @Test
    void parseGraph_invalidSyntax_populatesFailedFiles(@TempDir Path dir) throws IOException {
        Files.writeString(dir.resolve("InvalidSyntax.java"),
            "public class InvalidSyntax { this is not valid !! }");

        ParserBridge.Graph g = ParserBridge.parseGraph(req(dir));

        assertFalse(g.failedFiles.isEmpty(), "Expected invalid file to appear in failedFiles");
        assertTrue(g.failedFiles.get(0).contains("InvalidSyntax.java"));
    }

    @Test
    void parseGraph_classWithField_includesFieldInNode(@TempDir Path dir) throws IOException {
        Files.writeString(dir.resolve("Point.java"),
            "public class Point { private int x; private int y; }");

        ParserBridge.Graph g = ParserBridge.parseGraph(req(dir));

        assertEquals(1, g.nodes.size());
        assertEquals(2, g.nodes.get(0).fields.size());
    }

    @Test
    void parseGraph_classWithMethod_includesMethodInNode(@TempDir Path dir) throws IOException {
        Files.writeString(dir.resolve("Greeter.java"),
            "public class Greeter { public String greet(String name) { return \"Hello \" + name; } }");

        ParserBridge.Graph g = ParserBridge.parseGraph(req(dir));

        assertEquals(1, g.nodes.size());
        assertEquals(1, g.nodes.get(0).methods.size());
        assertEquals("greet", g.nodes.get(0).methods.get(0).name);
    }

    @Test
    void parseGraph_missingRoot_throwsException() {
        ParserBridge.Request r = new ParserBridge.Request();
        r.root = null;
        assertThrows(Exception.class, () -> ParserBridge.parseGraph(r));
    }
}
