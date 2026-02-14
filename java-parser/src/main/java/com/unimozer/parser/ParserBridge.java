package com.unimozer.parser;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.github.javaparser.JavaParser;
import com.github.javaparser.ParseStart;
import com.github.javaparser.ParseResult;
import com.github.javaparser.ParserConfiguration;
import com.github.javaparser.Providers;
import com.github.javaparser.Range;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.ImportDeclaration;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.ConstructorDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.BodyDeclaration;
import com.github.javaparser.ast.body.TypeDeclaration;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.CastExpr;
import com.github.javaparser.ast.expr.Expression;
import com.github.javaparser.ast.expr.FieldAccessExpr;
import com.github.javaparser.ast.expr.InstanceOfExpr;
import com.github.javaparser.ast.expr.MethodCallExpr;
import com.github.javaparser.ast.expr.ObjectCreationExpr;
import com.github.javaparser.ast.nodeTypes.NodeWithModifiers;
import com.github.javaparser.ast.Modifier;
import com.github.javaparser.ast.stmt.BlockStmt;
import com.github.javaparser.ast.stmt.CatchClause;
import com.github.javaparser.ast.stmt.DoStmt;
import com.github.javaparser.ast.stmt.ForEachStmt;
import com.github.javaparser.ast.stmt.ForStmt;
import com.github.javaparser.ast.stmt.IfStmt;
import com.github.javaparser.ast.stmt.Statement;
import com.github.javaparser.ast.stmt.SwitchEntry;
import com.github.javaparser.ast.stmt.SwitchStmt;
import com.github.javaparser.ast.stmt.TryStmt;
import com.github.javaparser.ast.stmt.WhileStmt;
import com.github.javaparser.ast.type.ArrayType;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.type.PrimitiveType;
import com.github.javaparser.ast.type.Type;
import com.github.javaparser.ast.type.WildcardType;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

public class ParserBridge {
  static class Request {
    public String root;
    public String srcRoot;
    public List<Override> overrides = new ArrayList<>();
    public boolean includeStructogramIr;
  }

  static class Override {
    public String path;
    public String content;
  }

  static class Graph {
    public List<Node> nodes = new ArrayList<>();
    public List<Edge> edges = new ArrayList<>();
    public List<String> failedFiles = new ArrayList<>();
  }

  static class Node {
    public String id;
    public String name;
    public String kind;
    public String path;
    public boolean isAbstract;
    public List<FieldInfo> fields = new ArrayList<>();
    public List<MethodInfo> methods = new ArrayList<>();
  }

  static class SourceRange {
    public int startLine;
    public int startColumn;
    public int endLine;
    public int endColumn;
  }

  static class FieldInfo {
    public String signature;
    public boolean isStatic;
    public String visibility;
    public SourceRange range;
  }

  static class MethodInfo {
    public String signature;
    public String name;
    public String returnType;
    public List<ParamInfo> params = new ArrayList<>();
    public boolean isAbstract;
    public boolean isMain;
    public boolean isStatic;
    public String visibility;
    public SourceRange range;
    public ControlTreeNode controlTree;
  }

  static class ControlTreeNode {
    public String kind;
    public String text;
    public String condition;
    public String loopKind;
    public SourceRange range;
    public List<ControlTreeNode> children = new ArrayList<>();
    public List<ControlTreeNode> thenBranch = new ArrayList<>();
    public List<ControlTreeNode> elseBranch = new ArrayList<>();
    public List<SwitchCaseInfo> switchCases = new ArrayList<>();
    public List<CatchInfo> catches = new ArrayList<>();
    public List<ControlTreeNode> finallyBranch = new ArrayList<>();
  }

  static class SwitchCaseInfo {
    public String label;
    public List<ControlTreeNode> body = new ArrayList<>();
  }

  static class CatchInfo {
    public String exception;
    public List<ControlTreeNode> body = new ArrayList<>();
  }

  static class ParamInfo {
    public String name;
    public String type;
  }

  static class Edge {
    public String id;
    public String from;
    public String to;
    public String kind;
  }

  static class AddFieldRequest {
    public String action;
    public String path;
    public String classId;
    public String content;
    public FieldSpec field;
    public boolean includeGetter;
    public boolean includeSetter;
    public boolean useParamPrefix;
    public boolean includeJavadoc;
  }

  static class FieldSpec {
    public String name;
    public String fieldType;
    public String visibility;
    public boolean isStatic;
    public boolean isFinal;
    public String initialValue;
  }

  static class AddFieldResponse {
    public boolean ok;
    public String content;
    public String error;
  }

  static class AddConstructorRequest {
    public String action;
    public String path;
    public String classId;
    public String content;
    public List<ParamSpec> params = new ArrayList<>();
    public boolean includeJavadoc;
  }

  static class ParamSpec {
    public String name;
    public String paramType;
  }

  static class AddConstructorResponse {
    public boolean ok;
    public String content;
    public String error;
  }

  static class AddMethodRequest {
    public String action;
    public String path;
    public String classId;
    public String content;
    public MethodSpec method;
    public List<ParamSpec> params = new ArrayList<>();
  }

  static class MethodSpec {
    public String name;
    public String returnType;
    public String visibility;
    public boolean isStatic;
    public boolean isAbstract;
    public boolean includeJavadoc;
  }

  static class AddMethodResponse {
    public boolean ok;
    public String content;
    public String error;
  }

  static class ErrorResponse {
    public boolean ok;
    public String error;
  }
  static class Context {
    public String pkg;
    public Map<String, String> explicitImports = new HashMap<>();
    public List<String> wildcardImports = new ArrayList<>();
  }

  static class ParsedType {
    public Node node;
    public Context ctx;
    public List<String> extendsTypes = new ArrayList<>();
    public List<String> implementsTypes = new ArrayList<>();
    public List<String> dependencyTypes = new ArrayList<>();
    public List<String> associationTypes = new ArrayList<>();
  }

  public static void main(String[] args) throws Exception {
    ObjectMapper mapper = new ObjectMapper();
    if (hasArg(args, "--stdio")) {
      runPersistent(mapper);
      return;
    }

    JsonNode rootNode = mapper.readTree(System.in);
    if (rootNode == null || rootNode.isNull()) {
      throw new IllegalArgumentException("Missing request body");
    }

    Object response = handleRequest(mapper, rootNode);
    mapper.writeValue(System.out, response);
  }

  private static boolean hasArg(String[] args, String expected) {
    if (args == null || expected == null) return false;
    for (String arg : args) {
      if (expected.equals(arg)) return true;
    }
    return false;
  }

  private static void runPersistent(ObjectMapper mapper) throws IOException {
    BufferedReader reader = new BufferedReader(
      new InputStreamReader(System.in, StandardCharsets.UTF_8)
    );
    BufferedWriter writer = new BufferedWriter(
      new OutputStreamWriter(System.out, StandardCharsets.UTF_8)
    );
    String line;
    while ((line = reader.readLine()) != null) {
      if (line.isBlank()) continue;
      try {
        JsonNode rootNode = mapper.readTree(line);
        if (rootNode == null || rootNode.isNull()) {
          throw new IllegalArgumentException("Missing request body");
        }
        Object response = handleRequest(mapper, rootNode);
        writer.write(mapper.writeValueAsString(response));
      } catch (Exception error) {
        ErrorResponse response = new ErrorResponse();
        response.ok = false;
        response.error = error.getMessage() == null
          ? error.getClass().getSimpleName()
          : error.getMessage();
        writer.write(mapper.writeValueAsString(response));
      }
      writer.newLine();
      writer.flush();
    }
  }

  private static Object handleRequest(ObjectMapper mapper, JsonNode rootNode) throws Exception {
    String action = rootNode.has("action") ? rootNode.get("action").asText() : "parseGraph";
    if ("addField".equals(action)) {
      AddFieldRequest request = mapper.treeToValue(rootNode, AddFieldRequest.class);
      return addField(request);
    }
    if ("addConstructor".equals(action)) {
      AddConstructorRequest request = mapper.treeToValue(rootNode, AddConstructorRequest.class);
      return addConstructor(request);
    }
    if ("addMethod".equals(action)) {
      AddMethodRequest request = mapper.treeToValue(rootNode, AddMethodRequest.class);
      return addMethod(request);
    }

    Request request = mapper.treeToValue(rootNode, Request.class);
    return parseGraph(request);
  }

  static Graph parseGraph(Request request) throws IOException {
    if (request == null || request.root == null || request.root.isBlank()) {
      throw new IllegalArgumentException("Missing root in request");
    }

    Path root = Paths.get(request.root);
    Path srcRoot = resolveSrcRoot(root, request.srcRoot);

    Map<Path, String> overrideMap = new HashMap<>();
    if (request.overrides != null) {
      for (Override item : request.overrides) {
        if (item == null || item.path == null || item.content == null) continue;
        overrideMap.put(normalizePath(item.path), item.content);
      }
    }

    ParserConfiguration config = createParserConfiguration();
    JavaParser parser = new JavaParser(config);

    List<Path> javaFiles = Files.walk(srcRoot)
      .filter(path -> path.toString().endsWith(".java"))
      .collect(Collectors.toList());

    List<ParsedType> parsedTypes = new ArrayList<>();
    List<String> failedFiles = new ArrayList<>();

    for (Path file : javaFiles) {
      CompilationUnit cu = parseCompilationUnit(parser, file, overrideMap, failedFiles);
      if (cu == null) continue;

      Context ctx = buildContext(cu);

      for (TypeDeclaration<?> typeDecl : cu.getTypes()) {
        ParsedType parsedType = new ParsedType();
        parsedType.node = buildNode(typeDecl, ctx, file, request.includeStructogramIr);
        parsedType.ctx = ctx;
        parsedType.extendsTypes = collectExtendsTypes(typeDecl);
        parsedType.implementsTypes = collectImplementsTypes(typeDecl);
        parsedType.associationTypes = collectAssociationTypes(typeDecl);
        parsedType.dependencyTypes = collectDependencyTypes(typeDecl);
        parsedTypes.add(parsedType);
      }
    }

    Graph graph = buildGraph(parsedTypes);
    graph.failedFiles = failedFiles;
    return graph;
  }

  static AddFieldResponse addField(AddFieldRequest request) {
    AddFieldResponse response = new AddFieldResponse();
    if (request == null || request.path == null || request.path.isBlank()) {
      response.ok = false;
      response.error = "Missing file path";
      return response;
    }
    if (request.field == null || request.field.name == null || request.field.name.isBlank()) {
      response.ok = false;
      response.error = "Missing field name";
      return response;
    }
    if (request.field.fieldType == null || request.field.fieldType.isBlank()) {
      response.ok = false;
      response.error = "Missing field type";
      return response;
    }

    String source;
    try {
      source = request.content != null && !request.content.isBlank()
        ? request.content
        : Files.readString(Paths.get(request.path));
    } catch (IOException ex) {
      response.ok = false;
      response.error = "Failed to read source file";
      return response;
    }

    ParserConfiguration config = createParserConfiguration();
    JavaParser parser = new JavaParser(config);

    ParseResult<CompilationUnit> parseResult = parser.parse(
      ParseStart.COMPILATION_UNIT,
      Providers.provider(source)
    );

    if (!parseResult.isSuccessful() || parseResult.getResult().isEmpty()) {
      response.ok = false;
      response.error = "Failed to parse source file";
      return response;
    }

    CompilationUnit cu = parseResult.getResult().orElse(null);
    if (cu == null) {
      response.ok = false;
      response.error = "Failed to parse source file";
      return response;
    }

    Context ctx = buildContext(cu);
    TypeDeclaration<?> targetType = null;
    String classId = request.classId != null ? request.classId : "";
    for (TypeDeclaration<?> typeDecl : cu.getTypes()) {
      String name = typeDecl.getNameAsString();
      String id = ctx.pkg.isEmpty() ? name : ctx.pkg + "." + name;
      if (!classId.isBlank()) {
        if (id.equals(classId)) {
          targetType = typeDecl;
          break;
        }
      } else if (targetType == null) {
        targetType = typeDecl;
      }
    }

    if (targetType == null) {
      response.ok = false;
      response.error = "Target class not found";
      return response;
    }

    boolean isInterface = targetType.isClassOrInterfaceDeclaration()
      && targetType.asClassOrInterfaceDeclaration().isInterface();

    String visibility = request.field.visibility == null ? "private" : request.field.visibility;
    FieldDeclaration fieldDecl = new FieldDeclaration();
    if ("public".equals(visibility)) fieldDecl.addModifier(Modifier.Keyword.PUBLIC);
    if ("protected".equals(visibility)) fieldDecl.addModifier(Modifier.Keyword.PROTECTED);
    if ("private".equals(visibility)) fieldDecl.addModifier(Modifier.Keyword.PRIVATE);
    if (request.field.isStatic || isInterface) fieldDecl.addModifier(Modifier.Keyword.STATIC);
    if (request.field.isFinal || isInterface) fieldDecl.addModifier(Modifier.Keyword.FINAL);

    VariableDeclarator variable;
    try {
      variable = new VariableDeclarator(
        StaticJavaParser.parseType(request.field.fieldType),
        request.field.name
      );
    } catch (Exception ex) {
      response.ok = false;
      response.error = "Invalid field type";
      return response;
    }

    if (request.field.initialValue != null && !request.field.initialValue.isBlank()) {
      try {
        variable.setInitializer(StaticJavaParser.parseExpression(request.field.initialValue));
      } catch (Exception ex) {
        response.ok = false;
        response.error = "Invalid initial value";
        return response;
      }
    }

    fieldDecl.addVariable(variable);

    if (request.includeJavadoc) {
      fieldDecl.setJavadocComment("write your javadoc description here");
    }

    List<BodyDeclaration<?>> members = targetType.getMembers();
    int insertIndex = 0;
    for (int i = 0; i < members.size(); i++) {
      if (members.get(i) instanceof FieldDeclaration) {
        insertIndex = i + 1;
      }
    }
    members.add(insertIndex, fieldDecl);

    boolean includeGetter = request.includeGetter;
    boolean includeSetter = request.includeSetter && !request.field.isFinal && !isInterface;
    String fieldName = request.field.name;
    String capitalized = capitalize(fieldName);
    String getterName = "get" + capitalized;
    String setterName = "set" + capitalized;
    String paramName = request.useParamPrefix ? "p" + capitalized : fieldName;

    if (includeGetter) {
      MethodDeclaration getter = new MethodDeclaration();
      getter.addModifier(Modifier.Keyword.PUBLIC);
      if (request.field.isStatic || isInterface) getter.addModifier(Modifier.Keyword.STATIC);
      try {
        getter.setType(StaticJavaParser.parseType(request.field.fieldType));
      } catch (Exception ex) {
        response.ok = false;
        response.error = "Invalid field type";
        return response;
      }
      getter.setName(getterName);
      getter.setBody(StaticJavaParser.parseBlock("{ return " + fieldName + "; }"));
      if (request.includeJavadoc) {
        getter.setJavadocComment(buildMethodJavadoc(List.of(), true));
      }
      members.add(getter);
    }

    if (includeSetter) {
      MethodDeclaration setter = new MethodDeclaration();
      setter.addModifier(Modifier.Keyword.PUBLIC);
      if (request.field.isStatic) setter.addModifier(Modifier.Keyword.STATIC);
      setter.setType("void");
      try {
        setter.addParameter(StaticJavaParser.parseType(request.field.fieldType), paramName);
      } catch (Exception ex) {
        response.ok = false;
        response.error = "Invalid field type";
        return response;
      }
      setter.setName(setterName);
      String assignment = request.field.isStatic
        ? fieldName + " = " + paramName + ";"
        : "this." + fieldName + " = " + paramName + ";";
      setter.setBody(StaticJavaParser.parseBlock("{ " + assignment + " }"));
      if (request.includeJavadoc) {
        setter.setJavadocComment(buildMethodJavadoc(List.of(paramName), false));
      }
      members.add(setter);
    }

    response.ok = true;
    response.content = cu.toString();
    return response;
  }

  static AddConstructorResponse addConstructor(AddConstructorRequest request) {
    AddConstructorResponse response = new AddConstructorResponse();
    if (request == null || request.path == null || request.path.isBlank()) {
      response.ok = false;
      response.error = "Missing file path";
      return response;
    }

    String source;
    try {
      source = request.content != null && !request.content.isBlank()
        ? request.content
        : Files.readString(Paths.get(request.path));
    } catch (IOException ex) {
      response.ok = false;
      response.error = "Failed to read source file";
      return response;
    }

    ParserConfiguration config = createParserConfiguration();
    JavaParser parser = new JavaParser(config);

    ParseResult<CompilationUnit> parseResult = parser.parse(
      ParseStart.COMPILATION_UNIT,
      Providers.provider(source)
    );

    if (!parseResult.isSuccessful() || parseResult.getResult().isEmpty()) {
      response.ok = false;
      response.error = "Failed to parse source file";
      return response;
    }

    CompilationUnit cu = parseResult.getResult().orElse(null);
    if (cu == null) {
      response.ok = false;
      response.error = "Failed to parse source file";
      return response;
    }

    Context ctx = buildContext(cu);
    TypeDeclaration<?> targetType = null;
    String classId = request.classId != null ? request.classId : "";
    for (TypeDeclaration<?> typeDecl : cu.getTypes()) {
      String name = typeDecl.getNameAsString();
      String id = ctx.pkg.isEmpty() ? name : ctx.pkg + "." + name;
      if (!classId.isBlank()) {
        if (id.equals(classId)) {
          targetType = typeDecl;
          break;
        }
      } else if (targetType == null) {
        targetType = typeDecl;
      }
    }

    if (targetType == null) {
      response.ok = false;
      response.error = "Target class not found";
      return response;
    }

    if (targetType.isClassOrInterfaceDeclaration()
      && targetType.asClassOrInterfaceDeclaration().isInterface()
    ) {
      response.ok = false;
      response.error = "Cannot add constructor to an interface";
      return response;
    }

    ConstructorDeclaration ctor = new ConstructorDeclaration();
    ctor.setName(targetType.getNameAsString());
    ctor.addModifier(Modifier.Keyword.PUBLIC);

    if (request.params != null) {
      for (ParamSpec param : request.params) {
        if (param == null) continue;
        if (param.name == null || param.name.isBlank()) {
          response.ok = false;
          response.error = "Invalid parameter name";
          return response;
        }
        if (param.paramType == null || param.paramType.isBlank()) {
          response.ok = false;
          response.error = "Invalid parameter type";
          return response;
        }
        try {
          ctor.addParameter(StaticJavaParser.parseType(param.paramType), param.name);
        } catch (Exception ex) {
          response.ok = false;
          response.error = "Invalid parameter type";
          return response;
        }
      }
    }

    ctor.setBody(StaticJavaParser.parseBlock("{\n}"));

    if (request.includeJavadoc) {
      List<String> paramNames = new ArrayList<>();
      if (request.params != null) {
        for (ParamSpec param : request.params) {
          if (param != null && param.name != null && !param.name.isBlank()) {
            paramNames.add(param.name);
          }
        }
      }
      ctor.setJavadocComment(buildMethodJavadoc(paramNames, false));
    }

    List<BodyDeclaration<?>> members = targetType.getMembers();
    int insertIndex = 0;
    for (int i = 0; i < members.size(); i++) {
      if (members.get(i) instanceof FieldDeclaration) {
        insertIndex = i + 1;
      }
    }
    members.add(insertIndex, ctor);

    response.ok = true;
    response.content = cu.toString();
    return response;
  }

  static AddMethodResponse addMethod(AddMethodRequest request) {
    AddMethodResponse response = new AddMethodResponse();
    if (request == null || request.path == null || request.path.isBlank()) {
      response.ok = false;
      response.error = "Missing file path";
      return response;
    }
    if (request.method == null || request.method.name == null || request.method.name.isBlank()) {
      response.ok = false;
      response.error = "Missing method name";
      return response;
    }
    if (request.method.returnType == null || request.method.returnType.isBlank()) {
      response.ok = false;
      response.error = "Missing return type";
      return response;
    }

    String source;
    try {
      source = request.content != null && !request.content.isBlank()
        ? request.content
        : Files.readString(Paths.get(request.path));
    } catch (IOException ex) {
      response.ok = false;
      response.error = "Failed to read source file";
      return response;
    }

    ParserConfiguration config = createParserConfiguration();
    JavaParser parser = new JavaParser(config);

    ParseResult<CompilationUnit> parseResult = parser.parse(
      ParseStart.COMPILATION_UNIT,
      Providers.provider(source)
    );

    if (!parseResult.isSuccessful() || parseResult.getResult().isEmpty()) {
      response.ok = false;
      response.error = "Failed to parse source file";
      return response;
    }

    CompilationUnit cu = parseResult.getResult().orElse(null);
    if (cu == null) {
      response.ok = false;
      response.error = "Failed to parse source file";
      return response;
    }

    Context ctx = buildContext(cu);
    TypeDeclaration<?> targetType = null;
    String classId = request.classId != null ? request.classId : "";
    for (TypeDeclaration<?> typeDecl : cu.getTypes()) {
      String name = typeDecl.getNameAsString();
      String id = ctx.pkg.isEmpty() ? name : ctx.pkg + "." + name;
      if (!classId.isBlank()) {
        if (id.equals(classId)) {
          targetType = typeDecl;
          break;
        }
      } else if (targetType == null) {
        targetType = typeDecl;
      }
    }

    if (targetType == null) {
      response.ok = false;
      response.error = "Target class not found";
      return response;
    }

    boolean isInterface = targetType.isClassOrInterfaceDeclaration()
      && targetType.asClassOrInterfaceDeclaration().isInterface();
    boolean targetAbstract = isAbstractType(targetType);
    if (request.method.isAbstract && request.method.isStatic) {
      response.ok = false;
      response.error = "Method cannot be abstract and static";
      return response;
    }
    if (request.method.isAbstract && !targetAbstract && !isInterface) {
      response.ok = false;
      response.error = "Abstract methods require an abstract class";
      return response;
    }

    MethodDeclaration method = new MethodDeclaration();
    method.setName(request.method.name);
    try {
      method.setType(StaticJavaParser.parseType(request.method.returnType));
    } catch (Exception ex) {
      response.ok = false;
      response.error = "Invalid return type";
      return response;
    }

    String visibility = request.method.visibility == null ? "public" : request.method.visibility;
    if ("public".equals(visibility)) method.addModifier(Modifier.Keyword.PUBLIC);
    if ("protected".equals(visibility)) method.addModifier(Modifier.Keyword.PROTECTED);
    if ("private".equals(visibility)) method.addModifier(Modifier.Keyword.PRIVATE);

    if (request.method.isStatic) {
      method.addModifier(Modifier.Keyword.STATIC);
    }

    boolean shouldBeAbstract = request.method.isAbstract || (isInterface && !request.method.isStatic);
    if (shouldBeAbstract) {
      method.addModifier(Modifier.Keyword.ABSTRACT);
    }

    if (request.params != null) {
      for (ParamSpec param : request.params) {
        if (param == null) continue;
        if (param.name == null || param.name.isBlank()) {
          response.ok = false;
          response.error = "Invalid parameter name";
          return response;
        }
        if (param.paramType == null || param.paramType.isBlank()) {
          response.ok = false;
          response.error = "Invalid parameter type";
          return response;
        }
        try {
          method.addParameter(StaticJavaParser.parseType(param.paramType), param.name);
        } catch (Exception ex) {
          response.ok = false;
          response.error = "Invalid parameter type";
          return response;
        }
      }
    }

    if (request.method.includeJavadoc) {
      List<String> paramNames = new ArrayList<>();
      if (request.params != null) {
        for (ParamSpec param : request.params) {
          if (param != null && param.name != null && !param.name.isBlank()) {
            paramNames.add(param.name);
          }
        }
      }
      method.setJavadocComment(buildMethodJavadoc(paramNames, !method.getType().isVoidType()));
    }

    if (!shouldBeAbstract) {
      String body = buildDefaultMethodBody(method.getType());
      method.setBody(StaticJavaParser.parseBlock(body));
    }

    List<BodyDeclaration<?>> members = targetType.getMembers();
    members.add(method);

    response.ok = true;
    response.content = cu.toString();
    return response;
  }

  static String buildDefaultMethodBody(Type type) {
    if (type == null || type.isVoidType()) {
      return "{\n}";
    }

    String returnExpr = "null";
    if (type.isPrimitiveType()) {
      switch (type.asPrimitiveType().getType()) {
        case BOOLEAN:
          returnExpr = "false";
          break;
        case CHAR:
          returnExpr = "'\\0'";
          break;
        case DOUBLE:
        case FLOAT:
          returnExpr = "0.0";
          break;
        default:
          returnExpr = "0";
          break;
      }
    }

    return "{\n  return " + returnExpr + ";\n}";
  }


  static String buildMethodJavadoc(List<String> params, boolean includeReturn) {
    StringBuilder builder = new StringBuilder();
    builder.append("\n * write your javadoc description here\n");
    if ((params != null && params.stream().anyMatch(name -> name != null && !name.isBlank())) || includeReturn) {
      builder.append(" *\n");
    }
    if (params != null) {
      for (String name : params) {
        if (name == null || name.isBlank()) continue;
        builder.append(" * @param ").append(name).append(" param description\n");
      }
    }
    if (includeReturn) {
      builder.append(" * @return return value\n");
    }
    builder.append(" ");
    return builder.toString();
  }

  static String capitalize(String name) {
    if (name == null || name.isBlank()) return "";
    if (name.length() == 1) return name.toUpperCase();
    return name.substring(0, 1).toUpperCase() + name.substring(1);
  }

  static ParserConfiguration createParserConfiguration() {
    ParserConfiguration config = new ParserConfiguration();
    config.setLanguageLevel(ParserConfiguration.LanguageLevel.BLEEDING_EDGE);
    config.setCharacterEncoding(StandardCharsets.UTF_8);
    return config;
  }

  static Path resolveSrcRoot(Path root, String srcRoot) {
    if (srcRoot == null || srcRoot.isBlank()) {
      return root.resolve("src");
    }
    Path candidate = Paths.get(srcRoot);
    if (candidate.isAbsolute()) {
      return candidate;
    }
    return root.resolve(candidate);
  }

  static Path normalizePath(String input) {
    return Paths.get(input).toAbsolutePath().normalize();
  }

  static CompilationUnit parseCompilationUnit(
    JavaParser parser,
    Path file,
    Map<Path, String> overrides,
    List<String> failedFiles
  ) {
    try {
      Path normalized = file.toAbsolutePath().normalize();
      if (overrides.containsKey(normalized)) {
        ParseResult<CompilationUnit> result = parser.parse(
          ParseStart.COMPILATION_UNIT,
          Providers.provider(overrides.get(normalized))
        );
        if (!result.isSuccessful() || result.getResult().isEmpty()) {
          failedFiles.add(file.toString());
          return null;
        }
        return result.getResult().orElse(null);
      }
      ParseResult<CompilationUnit> result = parser.parse(file);
      if (!result.isSuccessful() || result.getResult().isEmpty()) {
        failedFiles.add(file.toString());
        return null;
      }
      return result.getResult().orElse(null);
    } catch (IOException ex) {
      failedFiles.add(file.toString());
      return null;
    }
  }

  static Context buildContext(CompilationUnit cu) {
    Context ctx = new Context();
    ctx.pkg = cu.getPackageDeclaration().map(pd -> pd.getNameAsString()).orElse("");

    for (ImportDeclaration imp : cu.getImports()) {
      if (imp.isAsterisk()) {
        ctx.wildcardImports.add(imp.getNameAsString());
      } else {
        String full = imp.getNameAsString();
        String simple = full.substring(full.lastIndexOf('.') + 1);
        ctx.explicitImports.put(simple, full);
      }
    }

    return ctx;
  }

  static Node buildNode(
    TypeDeclaration<?> typeDecl,
    Context ctx,
    Path file,
    boolean includeStructogramIr
  ) {
    Node node = new Node();
    String name = typeDecl.getNameAsString();
    String id = ctx.pkg.isEmpty() ? name : ctx.pkg + "." + name;

    node.id = id;
    node.name = name;
    node.kind = inferKind(typeDecl);
    node.path = file.toString();
    node.isAbstract = isAbstractType(typeDecl);
    node.fields = collectFieldInfo(typeDecl);
    node.methods = collectMethodInfo(typeDecl, name, includeStructogramIr);

    return node;
  }

  static String inferKind(TypeDeclaration<?> typeDecl) {
    if (typeDecl.isEnumDeclaration()) return "enum";
    if (typeDecl.isRecordDeclaration()) return "record";
    if (typeDecl.isClassOrInterfaceDeclaration()) {
      ClassOrInterfaceDeclaration decl = typeDecl.asClassOrInterfaceDeclaration();
      return decl.isInterface() ? "interface" : "class";
    }
    return "class";
  }

  static boolean isAbstractType(TypeDeclaration<?> typeDecl) {
    if (typeDecl.isClassOrInterfaceDeclaration()) {
      ClassOrInterfaceDeclaration decl = typeDecl.asClassOrInterfaceDeclaration();
      return decl.isInterface() || decl.isAbstract();
    }
    return false;
  }

  static SourceRange toSourceRange(com.github.javaparser.ast.Node node) {
    if (node == null) return null;
    return node.getRange().map(range -> {
      SourceRange info = new SourceRange();
      info.startLine = range.begin.line;
      info.startColumn = range.begin.column;
      info.endLine = range.end.line;
      info.endColumn = range.end.column;
      return info;
    }).orElse(null);
  }

  static List<FieldInfo> collectFieldInfo(TypeDeclaration<?> typeDecl) {
    List<FieldInfo> fields = new ArrayList<>();
    for (FieldDeclaration field : typeDecl.getFields()) {
      String typeName = field.getElementType().asString();
      boolean isStatic = field.isStatic();
      String visibility = visibilitySymbol(field);
      for (VariableDeclarator variable : field.getVariables()) {
        FieldInfo info = new FieldInfo();
        info.signature = variable.getNameAsString() + ": " + typeName;
        info.isStatic = isStatic;
        info.visibility = visibility;
        info.range = toSourceRange(variable);
        fields.add(info);
      }
    }
    return fields;
  }

  static List<MethodInfo> collectMethodInfo(
    TypeDeclaration<?> typeDecl,
    String className,
    boolean includeStructogramIr
  ) {
    List<MethodInfo> methods = new ArrayList<>();
    for (BodyDeclaration<?> member : typeDecl.getMembers()) {
      if (member.isMethodDeclaration()) {
        MethodDeclaration method = member.asMethodDeclaration();
        String params = method.getParameters().stream()
          .map(param -> param.getType().asString())
          .collect(Collectors.joining(", "));
        String returnType = method.getType().isVoidType()
          ? "void"
          : method.getType().asString();
        boolean isAbstract = method.isAbstract() || isInterfaceAbstract(typeDecl, method);
        boolean isStatic = method.isStatic();
        boolean isMain = isMainMethod(method);
        String visibility = visibilitySymbol(method);
        String signature = method.getNameAsString() + "(" + params + "): " + returnType;
        MethodInfo info = new MethodInfo();
        info.signature = signature;
        info.name = method.getNameAsString();
        info.returnType = returnType;
        info.params = method.getParameters().stream()
          .map(param -> {
            ParamInfo paramInfo = new ParamInfo();
            paramInfo.name = param.getNameAsString();
            paramInfo.type = param.getType().asString();
            return paramInfo;
          })
          .collect(Collectors.toList());
        info.isAbstract = isAbstract;
        info.isMain = isMain;
        info.isStatic = isStatic;
        info.visibility = visibility;
        info.range = toSourceRange(method);
        if (includeStructogramIr && method.getBody().isPresent()) {
          info.controlTree = buildControlTree(method.getBody().orElse(null));
        }
        methods.add(info);
      } else if (member.isConstructorDeclaration()) {
        ConstructorDeclaration ctor = member.asConstructorDeclaration();
        String params = ctor.getParameters().stream()
          .map(param -> param.getType().asString())
          .collect(Collectors.joining(", "));
        String visibility = visibilitySymbol(ctor);
        MethodInfo info = new MethodInfo();
        info.signature = className + "(" + params + ")";
        info.name = className;
        info.returnType = "";
        info.params = ctor.getParameters().stream()
          .map(param -> {
            ParamInfo paramInfo = new ParamInfo();
            paramInfo.name = param.getNameAsString();
            paramInfo.type = param.getType().asString();
            return paramInfo;
          })
          .collect(Collectors.toList());
        info.isAbstract = false;
        info.isMain = false;
        info.isStatic = false;
        info.visibility = visibility;
        info.range = toSourceRange(ctor);
        if (includeStructogramIr) {
          info.controlTree = buildControlTree(ctor.getBody());
        }
        methods.add(info);
      }
    }
    return methods;
  }

  static ControlTreeNode buildControlTree(BlockStmt block) {
    if (block == null) return null;
    ControlTreeNode root = new ControlTreeNode();
    root.kind = "sequence";
    root.range = toSourceRange(block);
    root.children = toControlNodes(block.getStatements());
    return root;
  }

  static List<ControlTreeNode> toControlNodes(List<Statement> statements) {
    List<ControlTreeNode> nodes = new ArrayList<>();
    if (statements == null) return nodes;
    for (Statement statement : statements) {
      ControlTreeNode node = toControlNode(statement);
      if (node != null) {
        nodes.add(node);
      }
    }
    return nodes;
  }

  static List<ControlTreeNode> toBranchNodes(Statement statement) {
    if (statement == null) return new ArrayList<>();
    if (statement.isBlockStmt()) {
      return toControlNodes(statement.asBlockStmt().getStatements());
    }
    List<ControlTreeNode> single = new ArrayList<>();
    ControlTreeNode node = toControlNode(statement);
    if (node != null) {
      single.add(node);
    }
    return single;
  }

  static ControlTreeNode toControlNode(Statement statement) {
    if (statement == null) return null;

    if (statement.isBlockStmt()) {
      ControlTreeNode node = new ControlTreeNode();
      node.kind = "sequence";
      node.range = toSourceRange(statement);
      node.children = toControlNodes(statement.asBlockStmt().getStatements());
      return node;
    }

    if (statement.isIfStmt()) {
      IfStmt ifStmt = statement.asIfStmt();
      ControlTreeNode node = new ControlTreeNode();
      node.kind = "if";
      node.range = toSourceRange(ifStmt);
      node.condition = normalizeStatementText(ifStmt.getCondition().toString());
      node.thenBranch = toBranchNodes(ifStmt.getThenStmt());
      ifStmt.getElseStmt().ifPresent(elseStmt -> node.elseBranch = toBranchNodes(elseStmt));
      return node;
    }

    if (statement.isWhileStmt()) {
      WhileStmt whileStmt = statement.asWhileStmt();
      ControlTreeNode node = new ControlTreeNode();
      node.kind = "loop";
      node.loopKind = "while";
      node.range = toSourceRange(whileStmt);
      node.condition = normalizeStatementText(whileStmt.getCondition().toString());
      node.children = toBranchNodes(whileStmt.getBody());
      return node;
    }

    if (statement.isForStmt()) {
      ForStmt forStmt = statement.asForStmt();
      ControlTreeNode node = new ControlTreeNode();
      node.kind = "loop";
      node.loopKind = "for";
      node.range = toSourceRange(forStmt);
      String init = forStmt
        .getInitialization()
        .stream()
        .map(Expression::toString)
        .collect(Collectors.joining(", "));
      String compare = forStmt.getCompare().map(Expression::toString).orElse("");
      String update = forStmt
        .getUpdate()
        .stream()
        .map(Expression::toString)
        .collect(Collectors.joining(", "));
      node.condition = normalizeStatementText(init + "; " + compare + "; " + update);
      node.children = toBranchNodes(forStmt.getBody());
      return node;
    }

    if (statement.isForEachStmt()) {
      ForEachStmt eachStmt = statement.asForEachStmt();
      ControlTreeNode node = new ControlTreeNode();
      node.kind = "loop";
      node.loopKind = "foreach";
      node.range = toSourceRange(eachStmt);
      node.condition = normalizeStatementText(
        eachStmt.getVariable().toString() + " : " + eachStmt.getIterable().toString()
      );
      node.children = toBranchNodes(eachStmt.getBody());
      return node;
    }

    if (statement.isDoStmt()) {
      DoStmt doStmt = statement.asDoStmt();
      ControlTreeNode node = new ControlTreeNode();
      node.kind = "loop";
      node.loopKind = "doWhile";
      node.range = toSourceRange(doStmt);
      node.condition = normalizeStatementText(doStmt.getCondition().toString());
      node.children = toBranchNodes(doStmt.getBody());
      return node;
    }

    if (statement.isSwitchStmt()) {
      SwitchStmt switchStmt = statement.asSwitchStmt();
      ControlTreeNode node = new ControlTreeNode();
      node.kind = "switch";
      node.range = toSourceRange(switchStmt);
      node.condition = normalizeStatementText(switchStmt.getSelector().toString());
      for (SwitchEntry entry : switchStmt.getEntries()) {
        SwitchCaseInfo caseInfo = new SwitchCaseInfo();
        caseInfo.label = entry.getLabels().isEmpty()
          ? "default"
          : entry
            .getLabels()
            .stream()
            .map(label -> normalizeStatementText(label.toString()))
            .collect(Collectors.joining(", "));
        caseInfo.body = toControlNodes(entry.getStatements());
        node.switchCases.add(caseInfo);
      }
      return node;
    }

    if (statement.isTryStmt()) {
      TryStmt tryStmt = statement.asTryStmt();
      ControlTreeNode node = new ControlTreeNode();
      node.kind = "try";
      node.range = toSourceRange(tryStmt);
      node.children = toControlNodes(tryStmt.getTryBlock().getStatements());
      for (CatchClause catchClause : tryStmt.getCatchClauses()) {
        CatchInfo catchInfo = new CatchInfo();
        catchInfo.exception = normalizeStatementText(catchClause.getParameter().toString());
        catchInfo.body = toControlNodes(catchClause.getBody().getStatements());
        node.catches.add(catchInfo);
      }
      tryStmt
        .getFinallyBlock()
        .ifPresent(finallyBlock -> node.finallyBranch = toControlNodes(finallyBlock.getStatements()));
      return node;
    }

    ControlTreeNode node = new ControlTreeNode();
    node.kind = "statement";
    node.range = toSourceRange(statement);
    node.text = normalizeStatementText(statement.toString());
    return node;
  }

  static String stripCommentsPreservingLiterals(String value) {
    if (value == null || value.isEmpty()) return value;
    StringBuilder builder = new StringBuilder(value.length());
    boolean inLineComment = false;
    boolean inBlockComment = false;
    boolean inSingleQuote = false;
    boolean inDoubleQuote = false;
    boolean escaped = false;

    for (int i = 0; i < value.length(); i++) {
      char current = value.charAt(i);
      char next = i + 1 < value.length() ? value.charAt(i + 1) : '\0';

      if (inLineComment) {
        if (current == '\n' || current == '\r') {
          inLineComment = false;
          builder.append(' ');
        }
        continue;
      }

      if (inBlockComment) {
        if (current == '*' && next == '/') {
          inBlockComment = false;
          i += 1;
          builder.append(' ');
        }
        continue;
      }

      if (inSingleQuote) {
        builder.append(current);
        if (escaped) {
          escaped = false;
        } else if (current == '\\') {
          escaped = true;
        } else if (current == '\'') {
          inSingleQuote = false;
        }
        continue;
      }

      if (inDoubleQuote) {
        builder.append(current);
        if (escaped) {
          escaped = false;
        } else if (current == '\\') {
          escaped = true;
        } else if (current == '"') {
          inDoubleQuote = false;
        }
        continue;
      }

      if (current == '/' && next == '/') {
        inLineComment = true;
        i += 1;
        builder.append(' ');
        continue;
      }

      if (current == '/' && next == '*') {
        inBlockComment = true;
        i += 1;
        builder.append(' ');
        continue;
      }

      if (current == '\'') {
        inSingleQuote = true;
        builder.append(current);
        continue;
      }

      if (current == '"') {
        inDoubleQuote = true;
        builder.append(current);
        continue;
      }

      builder.append(current);
    }

    return builder.toString();
  }

  static String normalizeStatementText(String value) {
    if (value == null || value.isBlank()) return "";
    return stripCommentsPreservingLiterals(value)
      .replace("\r", " ")
      .replace("\n", " ")
      .replaceAll("\\s+", " ")
      .trim();
  }

  static boolean isInterfaceAbstract(TypeDeclaration<?> typeDecl, MethodDeclaration method) {
    if (!typeDecl.isClassOrInterfaceDeclaration()) return false;
    ClassOrInterfaceDeclaration decl = typeDecl.asClassOrInterfaceDeclaration();
    if (!decl.isInterface()) return false;
    return !method.isDefault() && !method.isStatic();
  }

  static String visibilitySymbol(NodeWithModifiers<?> node) {
    if (node.hasModifier(Modifier.Keyword.PUBLIC)) return "+";
    if (node.hasModifier(Modifier.Keyword.PROTECTED)) return "#";
    if (node.hasModifier(Modifier.Keyword.PRIVATE)) return "-";
    return "~";
  }

  static boolean isMainMethod(MethodDeclaration method) {
    if (!"main".equals(method.getNameAsString())) return false;
    if (!method.isPublic() || !method.isStatic()) return false;
    if (!method.getType().isVoidType()) return false;
    if (method.getParameters().size() != 1) return false;
    var param = method.getParameter(0);
    if (param.isVarArgs()) {
      return isStringLike(param.getType());
    }
    Type paramType = param.getType();
    if (!paramType.isArrayType()) return false;
    return isStringLike(paramType.asArrayType().getComponentType());
  }

  static boolean isStringLike(Type type) {
    if (!type.isClassOrInterfaceType()) return false;
    String name = type.asClassOrInterfaceType().getNameWithScope();
    return "String".equals(name) || name.endsWith(".String");
  }

  static List<String> collectExtendsTypes(TypeDeclaration<?> typeDecl) {
    List<String> names = new ArrayList<>();
    if (typeDecl.isClassOrInterfaceDeclaration()) {
      ClassOrInterfaceDeclaration decl = typeDecl.asClassOrInterfaceDeclaration();
      for (ClassOrInterfaceType type : decl.getExtendedTypes()) {
        names.add(type.getNameWithScope());
      }
    }
    return names;
  }

  static List<String> collectImplementsTypes(TypeDeclaration<?> typeDecl) {
    List<String> names = new ArrayList<>();
    if (typeDecl.isClassOrInterfaceDeclaration()) {
      ClassOrInterfaceDeclaration decl = typeDecl.asClassOrInterfaceDeclaration();
      for (ClassOrInterfaceType type : decl.getImplementedTypes()) {
        names.add(type.getNameWithScope());
      }
    }
    return names;
  }

  static List<String> collectAssociationTypes(TypeDeclaration<?> typeDecl) {
    List<String> names = new ArrayList<>();
    for (FieldDeclaration field : typeDecl.getFields()) {
      for (VariableDeclarator variable : field.getVariables()) {
        collectTypeNames(variable.getType(), names);
      }
    }
    return names;
  }

  static List<String> collectDependencyTypes(TypeDeclaration<?> typeDecl) {
    List<String> names = new ArrayList<>();

    for (MethodDeclaration method : typeDecl.getMethods()) {
      for (var param : method.getParameters()) {
        collectTypeNames(param.getType(), names);
      }
      collectTypeNames(method.getType(), names);
      for (Type thrown : method.getThrownExceptions()) {
        collectTypeNames(thrown, names);
      }
    }

    for (ConstructorDeclaration ctor : typeDecl.getConstructors()) {
      for (var param : ctor.getParameters()) {
        collectTypeNames(param.getType(), names);
      }
      for (Type thrown : ctor.getThrownExceptions()) {
        collectTypeNames(thrown, names);
      }
    }

    for (ObjectCreationExpr created : typeDecl.findAll(ObjectCreationExpr.class)) {
      collectTypeNames(created.getType(), names);
    }

    for (VariableDeclarator variable : typeDecl.findAll(VariableDeclarator.class)) {
      if (isFieldVariable(variable)) {
        continue;
      }
      collectTypeNames(variable.getType(), names);
    }

    for (FieldAccessExpr fieldAccess : typeDecl.findAll(FieldAccessExpr.class)) {
      String scope = fieldAccess.getScope().toString();
      if (scope.isBlank() || !Character.isUpperCase(scope.charAt(0))) {
        continue;
      }
      names.add(scope);
    }

    for (MethodCallExpr call : typeDecl.findAll(MethodCallExpr.class)) {
      if (call.getScope().isEmpty()) continue;
      var scope = call.getScope().get();
      if (scope.isNameExpr()) {
        String name = scope.asNameExpr().getNameAsString();
        if (!name.isBlank() && Character.isUpperCase(name.charAt(0))) {
          names.add(name);
        }
      } else if (scope.isFieldAccessExpr()) {
        String name = scope.asFieldAccessExpr().toString();
        if (!name.isBlank() && Character.isUpperCase(name.charAt(0))) {
          names.add(name);
        }
      }
    }

    for (AnnotationExpr annotation : typeDecl.findAll(AnnotationExpr.class)) {
      String name = annotation.getNameAsString();
      if (!name.isBlank()) {
        names.add(name);
      }
    }

    for (CastExpr castExpr : typeDecl.findAll(CastExpr.class)) {
      collectTypeNames(castExpr.getType(), names);
    }

    for (InstanceOfExpr instanceOfExpr : typeDecl.findAll(InstanceOfExpr.class)) {
      collectTypeNames(instanceOfExpr.getType(), names);
    }

    return names;
  }

  static void collectTypeNames(Type type, List<String> out) {
    if (type == null) return;

    if (type.isArrayType()) {
      ArrayType arrayType = type.asArrayType();
      collectTypeNames(arrayType.getComponentType(), out);
      return;
    }

    if (type.isClassOrInterfaceType()) {
      ClassOrInterfaceType coi = type.asClassOrInterfaceType();
      out.add(coi.getNameWithScope());
      if (coi.getTypeArguments().isPresent()) {
        for (Type arg : coi.getTypeArguments().get()) {
          collectTypeNames(arg, out);
        }
      }
      return;
    }

    if (type.isWildcardType()) {
      WildcardType wildcard = type.asWildcardType();
      wildcard.getExtendedType().ifPresent(ext -> collectTypeNames(ext, out));
      wildcard.getSuperType().ifPresent(sup -> collectTypeNames(sup, out));
      return;
    }

    if (type.isPrimitiveType()) {
      PrimitiveType primitive = type.asPrimitiveType();
      out.add(primitive.asString());
    }
  }

  static boolean isFieldVariable(VariableDeclarator variable) {
    var parent = variable.getParentNode();
    while (parent.isPresent()) {
      var node = parent.get();
      if (node instanceof FieldDeclaration) {
        return true;
      }
      parent = node.getParentNode();
    }
    return false;
  }

  static Graph buildGraph(List<ParsedType> parsedTypes) {
    Graph graph = new Graph();
    Map<String, Node> byId = new HashMap<>();
    Map<String, List<Node>> bySimple = new HashMap<>();

    for (ParsedType parsed : parsedTypes) {
      Node node = parsed.node;
      graph.nodes.add(node);
      byId.put(node.id, node);
      bySimple.computeIfAbsent(node.name, key -> new ArrayList<>()).add(node);
    }

    Set<String> edgeIds = new HashSet<>();

    for (ParsedType parsed : parsedTypes) {
      String from = parsed.node.id;

      for (String name : parsed.extendsTypes) {
        String resolved = resolveType(name, parsed.ctx, byId, bySimple);
        addEdge(graph, edgeIds, from, resolved, "extends");
      }

      for (String name : parsed.implementsTypes) {
        String resolved = resolveType(name, parsed.ctx, byId, bySimple);
        addEdge(graph, edgeIds, from, resolved, "implements");
      }

      Set<String> associationTargets = new HashSet<>();
      for (String name : parsed.associationTypes) {
        String resolved = resolveType(name, parsed.ctx, byId, bySimple);
        if (resolved != null) {
          associationTargets.add(resolved);
          addEdge(graph, edgeIds, from, resolved, "association");
        }
      }

      for (String name : parsed.dependencyTypes) {
        String resolved = resolveType(name, parsed.ctx, byId, bySimple);
        if (resolved == null || associationTargets.contains(resolved)) {
          continue;
        }
        addEdge(graph, edgeIds, from, resolved, "dependency");
      }
    }

    return graph;
  }

  static String resolveType(
    String name,
    Context ctx,
    Map<String, Node> byId,
    Map<String, List<Node>> bySimple
  ) {
    if (name == null || name.isBlank()) return null;

    String simple = name.contains(".") ? name.substring(name.lastIndexOf('.') + 1) : name;

    if (name.contains(".") && byId.containsKey(name)) {
      return name;
    }

    if (ctx.explicitImports.containsKey(simple)) {
      String fqn = ctx.explicitImports.get(simple);
      if (byId.containsKey(fqn)) {
        return fqn;
      }
    }

    if (ctx.pkg != null && !ctx.pkg.isBlank()) {
      String fqn = ctx.pkg + "." + simple;
      if (byId.containsKey(fqn)) {
        return fqn;
      }
    }

    for (String wildcard : ctx.wildcardImports) {
      String fqn = wildcard + "." + simple;
      if (byId.containsKey(fqn)) {
        return fqn;
      }
    }

    List<Node> matches = bySimple.get(simple);
    if (matches != null && matches.size() == 1) {
      return matches.get(0).id;
    }

    return null;
  }

  static void addEdge(Graph graph, Set<String> edgeIds, String from, String to, String kind) {
    if (from == null || to == null) return;
    String actualKind = kind;
    if (from.equals(to)) {
      if (!"association".equals(kind)) {
        return;
      }
      actualKind = "reflexive-association";
    }
    String id = from + ":" + actualKind + ":" + to;
    if (edgeIds.contains(id)) return;
    edgeIds.add(id);

    Edge edge = new Edge();
    edge.id = id;
    edge.from = from;
    edge.to = to;
    edge.kind = actualKind;
    graph.edges.add(edge);
  }
}
