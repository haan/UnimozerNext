package com.unimozer.parser;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.javaparser.JavaParser;
import com.github.javaparser.ParseStart;
import com.github.javaparser.ParseResult;
import com.github.javaparser.ParserConfiguration;
import com.github.javaparser.Providers;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.ImportDeclaration;
import com.github.javaparser.ast.body.BodyDeclaration;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.ConstructorDeclaration;
import com.github.javaparser.ast.body.EnumDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.RecordDeclaration;
import com.github.javaparser.ast.body.TypeDeclaration;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.CastExpr;
import com.github.javaparser.ast.expr.FieldAccessExpr;
import com.github.javaparser.ast.expr.InstanceOfExpr;
import com.github.javaparser.ast.expr.MethodCallExpr;
import com.github.javaparser.ast.expr.NameExpr;
import com.github.javaparser.ast.expr.ObjectCreationExpr;
import com.github.javaparser.ast.expr.FieldAccessExpr;
import com.github.javaparser.ast.nodeTypes.NodeWithModifiers;
import com.github.javaparser.ast.Modifier;
import com.github.javaparser.ast.type.ArrayType;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.type.PrimitiveType;
import com.github.javaparser.ast.type.Type;
import com.github.javaparser.ast.type.WildcardType;

import java.io.IOException;
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

  static class FieldInfo {
    public String signature;
    public boolean isStatic;
    public String visibility;
  }

  static class MethodInfo {
    public String signature;
    public boolean isAbstract;
    public boolean isStatic;
    public String visibility;
  }

  static class Edge {
    public String id;
    public String from;
    public String to;
    public String kind;
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
    Request request = mapper.readValue(System.in, Request.class);

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

    ParserConfiguration config = new ParserConfiguration();
    config.setLanguageLevel(ParserConfiguration.LanguageLevel.BLEEDING_EDGE);
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
        parsedType.node = buildNode(typeDecl, ctx, file);
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
    mapper.writeValue(System.out, graph);
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

  static Node buildNode(TypeDeclaration<?> typeDecl, Context ctx, Path file) {
    Node node = new Node();
    String name = typeDecl.getNameAsString();
    String id = ctx.pkg.isEmpty() ? name : ctx.pkg + "." + name;

    node.id = id;
    node.name = name;
    node.kind = inferKind(typeDecl);
    node.path = file.toString();
    node.isAbstract = isAbstractType(typeDecl);
    node.fields = collectFieldInfo(typeDecl);
    node.methods = collectMethodInfo(typeDecl, name);

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
        fields.add(info);
      }
    }
    return fields;
  }

  static List<MethodInfo> collectMethodInfo(TypeDeclaration<?> typeDecl, String className) {
    List<MethodInfo> methods = new ArrayList<>();
    for (MethodDeclaration method : typeDecl.getMethods()) {
      String params = method.getParameters().stream()
        .map(param -> param.getType().asString())
        .collect(Collectors.joining(", "));
      String returnType = method.getType().isVoidType()
        ? "void"
        : method.getType().asString();
      boolean isAbstract = method.isAbstract() || isInterfaceAbstract(typeDecl, method);
      boolean isStatic = method.isStatic();
      String visibility = visibilitySymbol(method);
      String signature = method.getNameAsString() + "(" + params + "): " + returnType;
      MethodInfo info = new MethodInfo();
      info.signature = signature;
      info.isAbstract = isAbstract;
      info.isStatic = isStatic;
      info.visibility = visibility;
      methods.add(info);
    }
    for (ConstructorDeclaration ctor : typeDecl.getConstructors()) {
      String params = ctor.getParameters().stream()
        .map(param -> param.getType().asString())
        .collect(Collectors.joining(", "));
      String visibility = visibilitySymbol(ctor);
      MethodInfo info = new MethodInfo();
      info.signature = className + "(" + params + ")";
      info.isAbstract = false;
      info.isStatic = false;
      info.visibility = visibility;
      methods.add(info);
    }
    return methods;
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
