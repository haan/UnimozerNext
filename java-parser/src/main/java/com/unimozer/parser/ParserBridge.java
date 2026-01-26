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
  }

  static class Node {
    public String id;
    public String name;
    public String kind;
    public String path;
    public List<String> fields = new ArrayList<>();
    public List<String> methods = new ArrayList<>();
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

    for (Path file : javaFiles) {
      CompilationUnit cu = parseCompilationUnit(parser, file, overrideMap);
      if (cu == null) continue;

      Context ctx = buildContext(cu);

      for (TypeDeclaration<?> typeDecl : cu.getTypes()) {
        ParsedType parsedType = new ParsedType();
        parsedType.node = buildNode(typeDecl, ctx, file);
        parsedType.ctx = ctx;
        parsedType.extendsTypes = collectExtendsTypes(typeDecl);
        parsedType.implementsTypes = collectImplementsTypes(typeDecl);
        parsedType.associationTypes = collectAssociationTypes(typeDecl);
        parsedTypes.add(parsedType);
      }
    }

    Graph graph = buildGraph(parsedTypes);
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

  static CompilationUnit parseCompilationUnit(JavaParser parser, Path file, Map<Path, String> overrides) {
    try {
      Path normalized = file.toAbsolutePath().normalize();
      if (overrides.containsKey(normalized)) {
        ParseResult<CompilationUnit> result = parser.parse(
          ParseStart.COMPILATION_UNIT,
          Providers.provider(overrides.get(normalized))
        );
        return result.getResult().orElse(null);
      }
      ParseResult<CompilationUnit> result = parser.parse(file);
      return result.getResult().orElse(null);
    } catch (IOException ex) {
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
    node.fields = collectFieldStrings(typeDecl);
    node.methods = collectMethodStrings(typeDecl, name);

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

  static List<String> collectFieldStrings(TypeDeclaration<?> typeDecl) {
    List<String> fields = new ArrayList<>();
    for (FieldDeclaration field : typeDecl.getFields()) {
      String typeName = field.getElementType().toString();
      for (VariableDeclarator variable : field.getVariables()) {
        fields.add(variable.getNameAsString() + ": " + typeName);
      }
    }
    return fields;
  }

  static List<String> collectMethodStrings(TypeDeclaration<?> typeDecl, String className) {
    List<String> methods = new ArrayList<>();
    for (MethodDeclaration method : typeDecl.getMethods()) {
      String params = method.getParameters().stream()
        .map(param -> param.getType().toString())
        .collect(Collectors.joining(", "));
      methods.add(method.getNameAsString() + "(" + params + ")");
    }
    for (ConstructorDeclaration ctor : typeDecl.getConstructors()) {
      String params = ctor.getParameters().stream()
        .map(param -> param.getType().toString())
        .collect(Collectors.joining(", "));
      methods.add(className + "(" + params + ")");
    }
    return methods;
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

      for (String name : parsed.associationTypes) {
        String resolved = resolveType(name, parsed.ctx, byId, bySimple);
        addEdge(graph, edgeIds, from, resolved, "association");
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
    if (from == null || to == null || from.equals(to)) return;
    String id = from + ":" + kind + ":" + to;
    if (edgeIds.contains(id)) return;
    edgeIds.add(id);

    Edge edge = new Edge();
    edge.id = id;
    edge.from = from;
    edge.to = to;
    edge.kind = kind;
    graph.edges.add(edge);
  }
}
