package com.unimozer.parser;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ParserBridgeModifyTest {

    private static final String SIMPLE_CLASS =
        "public class SimpleClass {\n" +
        "    private int value;\n" +
        "}\n";

    // --- addField ---

    @Test
    void addField_missingPath_returnsError() {
        ParserBridge.AddFieldRequest req = new ParserBridge.AddFieldRequest();
        req.path = "";
        req.field = field("count", "int");

        ParserBridge.AddFieldResponse resp = ParserBridge.addField(req);

        assertFalse(resp.ok);
        assertNotNull(resp.error);
    }

    @Test
    void addField_missingFieldName_returnsError() {
        ParserBridge.AddFieldRequest req = new ParserBridge.AddFieldRequest();
        req.path = "/dummy/path/Foo.java";
        req.content = SIMPLE_CLASS;
        req.field = field("", "int");

        ParserBridge.AddFieldResponse resp = ParserBridge.addField(req);

        assertFalse(resp.ok);
    }

    @Test
    void addField_toSimpleClass_insertsField() {
        ParserBridge.AddFieldRequest req = new ParserBridge.AddFieldRequest();
        req.path = "/dummy/path/SimpleClass.java";
        req.content = SIMPLE_CLASS;
        req.classId = "SimpleClass";
        req.field = field("name", "String");
        req.field.visibility = "private";

        ParserBridge.AddFieldResponse resp = ParserBridge.addField(req);

        assertTrue(resp.ok, "addField should succeed: " + resp.error);
        assertNotNull(resp.content);
        assertTrue(resp.content.contains("name"), "Result should contain the new field name");
    }

    @Test
    void addField_withGetter_insertsGetterMethod() {
        ParserBridge.AddFieldRequest req = new ParserBridge.AddFieldRequest();
        req.path = "/dummy/path/SimpleClass.java";
        req.content = SIMPLE_CLASS;
        req.classId = "SimpleClass";
        req.field = field("label", "String");
        req.field.visibility = "private";
        req.includeGetter = true;

        ParserBridge.AddFieldResponse resp = ParserBridge.addField(req);

        assertTrue(resp.ok, "addField with getter should succeed: " + resp.error);
        assertTrue(resp.content.contains("getLabel") || resp.content.contains("getlabel"),
            "Result should contain a getter method");
    }

    @Test
    void addField_withSetter_insertsSetterMethod() {
        ParserBridge.AddFieldRequest req = new ParserBridge.AddFieldRequest();
        req.path = "/dummy/path/SimpleClass.java";
        req.content = SIMPLE_CLASS;
        req.classId = "SimpleClass";
        req.field = field("score", "int");
        req.field.visibility = "private";
        req.includeSetter = true;

        ParserBridge.AddFieldResponse resp = ParserBridge.addField(req);

        assertTrue(resp.ok, "addField with setter should succeed: " + resp.error);
        assertTrue(resp.content.contains("setScore") || resp.content.contains("setscore"),
            "Result should contain a setter method");
    }

    // --- addConstructor ---

    @Test
    void addConstructor_noParams_insertsDefaultConstructor() {
        ParserBridge.AddConstructorRequest req = new ParserBridge.AddConstructorRequest();
        req.path = "/dummy/path/SimpleClass.java";
        req.content = SIMPLE_CLASS;
        req.classId = "SimpleClass";

        ParserBridge.AddConstructorResponse resp = ParserBridge.addConstructor(req);

        assertTrue(resp.ok, "addConstructor should succeed: " + resp.error);
        assertTrue(resp.content.contains("SimpleClass()") || resp.content.contains("SimpleClass ()"),
            "Result should contain a no-arg constructor");
    }

    @Test
    void addConstructor_withParams_insertsParameterizedConstructor() {
        ParserBridge.AddConstructorRequest req = new ParserBridge.AddConstructorRequest();
        req.path = "/dummy/path/SimpleClass.java";
        req.content = SIMPLE_CLASS;
        req.classId = "SimpleClass";
        ParserBridge.ParamSpec p = new ParserBridge.ParamSpec();
        p.name = "value";
        p.paramType = "int";
        req.params = List.of(p);

        ParserBridge.AddConstructorResponse resp = ParserBridge.addConstructor(req);

        assertTrue(resp.ok, "addConstructor with param should succeed: " + resp.error);
        assertTrue(resp.content.contains("value"), "Result should contain the param name");
    }

    // --- addMethod ---

    @Test
    void addMethod_publicVoidMethod_insertsMethod() {
        ParserBridge.AddMethodRequest req = new ParserBridge.AddMethodRequest();
        req.path = "/dummy/path/SimpleClass.java";
        req.content = SIMPLE_CLASS;
        req.classId = "SimpleClass";
        req.method = method("doWork", "void", "public");

        ParserBridge.AddMethodResponse resp = ParserBridge.addMethod(req);

        assertTrue(resp.ok, "addMethod should succeed: " + resp.error);
        assertTrue(resp.content.contains("doWork"), "Result should contain the method name");
    }

    @Test
    void addMethod_withReturnType_insertsTypedMethod() {
        ParserBridge.AddMethodRequest req = new ParserBridge.AddMethodRequest();
        req.path = "/dummy/path/SimpleClass.java";
        req.content = SIMPLE_CLASS;
        req.classId = "SimpleClass";
        req.method = method("getDescription", "String", "public");

        ParserBridge.AddMethodResponse resp = ParserBridge.addMethod(req);

        assertTrue(resp.ok, "addMethod with return type should succeed: " + resp.error);
        assertTrue(resp.content.contains("String"), "Result should mention return type");
        assertTrue(resp.content.contains("getDescription"));
    }

    // --- renameClass ---

    @Test
    void renameClass_simpleClass_updatesClassName() {
        ParserBridge.RenameClassRequest req = new ParserBridge.RenameClassRequest();
        req.path = "/dummy/path/SimpleClass.java";
        req.content = SIMPLE_CLASS;
        req.oldClassName = "SimpleClass";
        req.newClassName = "RenamedClass";

        ParserBridge.RenameClassResponse resp = ParserBridge.renameClass(req);

        assertTrue(resp.ok, "renameClass should succeed: " + resp.error);
        assertTrue(resp.content.contains("RenamedClass"), "Result should contain new name");
        assertFalse(resp.content.contains("class SimpleClass"), "Result should not contain old class declaration");
    }

    @Test
    void renameClass_missingContent_returnsError() {
        ParserBridge.RenameClassRequest req = new ParserBridge.RenameClassRequest();
        req.path = "/nonexistent/path/Foo.java";
        req.content = null;
        req.oldClassName = "Foo";
        req.newClassName = "Bar";

        ParserBridge.RenameClassResponse resp = ParserBridge.renameClass(req);

        assertFalse(resp.ok, "renameClass with missing file and no content should fail");
    }

    // --- helpers ---

    private static ParserBridge.FieldSpec field(String name, String type) {
        ParserBridge.FieldSpec f = new ParserBridge.FieldSpec();
        f.name = name;
        f.fieldType = type;
        return f;
    }

    private static ParserBridge.MethodSpec method(String name, String returnType, String visibility) {
        ParserBridge.MethodSpec m = new ParserBridge.MethodSpec();
        m.name = name;
        m.returnType = returnType;
        m.visibility = visibility;
        return m;
    }
}
