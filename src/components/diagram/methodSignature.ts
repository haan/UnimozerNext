import type { UmlMethod } from "../../models/uml";

const extractNameFromSignature = (signature: string) => {
  const openParenIndex = signature.indexOf("(");
  if (openParenIndex <= 0) {
    return "";
  }
  return signature.slice(0, openParenIndex).trim();
};

const extractReturnTypeFromSignature = (signature: string) => {
  const closeParenIndex = signature.lastIndexOf(")");
  if (closeParenIndex < 0) {
    return "";
  }
  const separatorIndex = signature.indexOf(":", closeParenIndex);
  if (separatorIndex < 0) {
    return "";
  }
  return signature.slice(separatorIndex + 1).trim();
};

const formatNamedParam = (param: { name: string; type: string }, index: number) => {
  const name = param.name?.trim() ?? "";
  const type = param.type?.trim() ?? "";
  if (name && type) {
    return `${name}: ${type}`;
  }
  if (name) {
    return name;
  }
  if (type) {
    return type;
  }
  return `arg${index + 1}`;
};

export const formatMethodSignature = (method: UmlMethod, showParameterNames: boolean) => {
  const signature = method.signature?.trim() ?? "";
  if (!showParameterNames) {
    return signature;
  }

  const methodName = method.name?.trim() || extractNameFromSignature(signature);
  if (!methodName) {
    return signature;
  }

  const params = Array.isArray(method.params) ? method.params : [];
  const paramsText = params.map(formatNamedParam).join(", ");
  const returnType = method.returnType?.trim() || extractReturnTypeFromSignature(signature);

  return returnType
    ? `${methodName}(${paramsText}): ${returnType}`
    : `${methodName}(${paramsText})`;
};
