import type { AddClassForm } from "../components/wizards/AddClassDialog";

export const escapeJavaString = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export const escapeJavaChar = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

const UNSUFFIXED_INTEGER_LITERAL_PATTERN =
  /^[+-]?(?:0[bB][01](?:_?[01])*|0[xX][0-9a-fA-F](?:_?[0-9a-fA-F])*|0(?:_?[0-7])*|[1-9](?:_?\d)*)$/;

export const normalizeJavaArgument = (raw: string, type: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const normalizedType = type.replace(/\s+/g, "");
  if (normalizedType === "String") {
    if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
      return trimmed;
    }
    return `"${escapeJavaString(trimmed)}"`;
  }
  if (normalizedType === "char") {
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
      return trimmed;
    }
    return `'${escapeJavaChar(trimmed)}'`;
  }
  if (normalizedType === "long" && UNSUFFIXED_INTEGER_LITERAL_PATTERN.test(trimmed)) {
    return `${trimmed}L`;
  }
  return trimmed;
};

export const resolveConstructorParamClass = (type: string) => {
  const normalizedType = type.replace(/\s+/g, "");
  switch (normalizedType) {
    case "int":
    case "long":
    case "float":
    case "double":
    case "boolean":
    case "char":
      return `${normalizedType}.class`;
    case "String":
      return "java.lang.String.class";
    default:
      return `Class.forName("${normalizedType}")`;
  }
};

export const buildClassSource = (form: AddClassForm) => {
  const name = form.name.trim().replace(/\.java$/i, "");
  const packageName = form.packageName.trim();
  const extendsName = form.extendsName.trim();
  const tokens: string[] = [];
  tokens.push("public");
  if (!form.isInterface && form.isAbstract) tokens.push("abstract");
  if (!form.isInterface && form.isFinal) tokens.push("final");
  tokens.push(form.isInterface ? "interface" : "class");
  tokens.push(name);
  if (extendsName) {
    tokens.push("extends", extendsName);
  }

  const classHeader = tokens.join(" ");
  const docBlock = form.includeJavadoc
    ? "/**\n * write your javadoc description here\n */\n"
    : "";
  const mainDoc = form.includeJavadoc
    ? "  /**\n   * write your javadoc description here\n   * @param args the command line arguments\n   */\n"
    : "";
  const mainMethod =
    form.includeMain && !form.isInterface
      ? `${mainDoc}  public static void main(String[] args) {\n  }\n\n`
      : "";
  const packageLine = packageName ? `package ${packageName};\n\n` : "";

  return `${packageLine}${docBlock}${classHeader} {\n\n${mainMethod}}\n`;
};
