import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";

import type { UmlConstructor, UmlGraph, UmlMethod, UmlNode } from "../models/uml";
import type { ObjectInstance, ObjectInheritedMethodGroup, ObjectMethod } from "../models/objectBench";
import { normalizeConstructorArg, resolveConstructorParamClass } from "../services/javaCodegen";
import { jshellEval, jshellInspect, jshellStart, jshellStop } from "../services/jshell";

type CreateObjectArgs = {
  form: { objectName: string; paramValues: string[] };
  target: UmlNode;
  constructor: UmlConstructor;
};

type CallMethodArgs = {
  target: ObjectInstance;
  method: UmlMethod;
  paramValues: string[];
  onReturn?: (label: string, value: string) => void;
};

type UseJshellActionsArgs = {
  projectPath: string | null;
  umlGraph: UmlGraph | null;
  jshellReady: boolean;
  setJshellReady: (ready: boolean) => void;
  objectBench: ObjectInstance[];
  setObjectBench: (next: ObjectInstance[] | ((prev: ObjectInstance[]) => ObjectInstance[])) => void;
  lastCompileOutDirRef: MutableRefObject<string | null>;
  appendConsoleOutput: (text: string) => void;
  resetConsoleOutput: () => void;
  appendDebugOutput?: (text: string) => void;
  setStatus: (status: string) => void;
  setBusy: (busy: boolean) => void;
  formatStatus: (input: unknown) => string;
  trimStatus: (input: string, max?: number) => string;
};

const isBrokenPipe = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("pipe is being closed") ||
    normalized.includes("broken pipe") ||
    normalized.includes("closed unexpectedly")
  );
};

export const useJshellActions = ({
  projectPath,
  umlGraph,
  jshellReady,
  setJshellReady,
  objectBench,
  setObjectBench,
  lastCompileOutDirRef,
  appendConsoleOutput,
  resetConsoleOutput,
  appendDebugOutput,
  setStatus,
  setBusy,
  formatStatus,
  trimStatus
}: UseJshellActionsArgs) => {
  const objectBenchRef = useRef<ObjectInstance[]>([]);
  const logDebug = useCallback(
    (message: string | (() => string)) => {
      if (!appendDebugOutput) return;
      if (typeof message === "function") {
        appendDebugOutput(message());
        return;
      }
      appendDebugOutput(message);
    },
    [appendDebugOutput]
  );

  useEffect(() => {
    objectBenchRef.current = objectBench;
  }, [objectBench]);

  const resolveUmlNodeForObject = useCallback(
    (object: ObjectInstance) => {
      if (!umlGraph) return null;
      return (
        umlGraph.nodes.find((node) => node.id === object.type) ??
        umlGraph.nodes.find((node) => node.name === object.type) ??
        null
      );
    },
    [umlGraph]
  );

  const getPublicMethodsForObject = useCallback(
    (object: ObjectInstance) => {
      const node = resolveUmlNodeForObject(object);
      if (!node) return [];
      const constructorName = node.name;
      return node.methods.filter(
        (method) =>
          (method.visibility === "+" || !method.visibility) &&
          method.name !== constructorName
      );
    },
    [resolveUmlNodeForObject]
  );

  const refreshObjectBench = useCallback(
    async (objects: ObjectInstance[]) => {
      const fallback = new Map(objects.map((obj) => [obj.name, obj]));
      const refreshed: ObjectInstance[] = [];
      for (const obj of objects) {
        const inspect = await jshellInspect(obj.name);
        if (!inspect.ok) {
          const message = trimStatus(inspect.error || "Unknown error");
          logDebug(
            () =>
              `[${new Date().toLocaleTimeString()}] JShell inspect failed for ${obj.name}\n${message}`
          );
          if (inspect.error && inspect.error.includes("payload:")) {
            logDebug(
              () =>
                `[${new Date().toLocaleTimeString()}] JShell inspect payload\n${inspect.error}`
            );
          }
          refreshed.push(fallback.get(obj.name) ?? obj);
          continue;
        }
        logDebug(
          () =>
            `[${new Date().toLocaleTimeString()}] JShell inspect ${obj.name} inheritedGroups=${
              inspect.inheritedMethods?.length ?? 0
            }`
        );
        const inheritedMethods: ObjectInheritedMethodGroup[] = (inspect.inheritedMethods ?? [])
          .map((group) => ({
            className: group.className,
            methods: (group.methods ?? []).map((method): ObjectMethod => ({
              name: method.name,
              returnType: method.returnType ?? "",
              paramTypes: method.paramTypes ?? [],
              visibility: method.visibility,
              isStatic: method.isStatic,
              declaringClass: group.className
            }))
          }))
          .filter((group) => group.methods.length > 0);
        refreshed.push({
          name: obj.name,
          type: inspect.typeName || obj.type,
          fields: (inspect.fields ?? []).map((field) => ({
            ...field,
            type: field.type ?? "",
            value: field.value ?? ""
          })),
          inheritedMethods
        });
      }
      return refreshed;
    },
    [logDebug, trimStatus]
  );

  const handleCreateObject = useCallback(
    async ({ form, target, constructor }: CreateObjectArgs) => {
      if (!projectPath) {
        setStatus("Open a project before creating objects.");
        return;
      }
      if (!jshellReady) {
        setStatus("Compile the project before creating objects.");
        return;
      }

      setBusy(true);
      const args = constructor.params.map((param, index) =>
        normalizeConstructorArg(form.paramValues[index] ?? "", param.type)
      );
      const usesDefaultPackage = !target.id.includes(".");
      const ctorParams = constructor.params.map((param) =>
        resolveConstructorParamClass(param.type)
      );
      const constructorSelector =
        ctorParams.length === 0
          ? "getDeclaredConstructor()"
          : `getDeclaredConstructor(${ctorParams.join(", ")})`;
      const code = usesDefaultPackage
        ? `var ${form.objectName} = Class.forName("${target.id}").${constructorSelector}.newInstance(${args.join(", ")});`
        : `var ${form.objectName} = new ${target.id}(${args.join(", ")});`;
      logDebug(() => `[${new Date().toLocaleTimeString()}] JShell eval\n${code}`);
      const startedAt = new Date().toLocaleTimeString();
      resetConsoleOutput();
      appendConsoleOutput(`[${startedAt}] Create object requested for ${form.objectName}`);

      const logJshellOutput = (stdout?: string | null, stderr?: string | null) => {
        const jshellTime = new Date().toLocaleTimeString();
        const trimmedStdout = stdout?.trim();
        if (trimmedStdout) {
          appendConsoleOutput(trimmedStdout);
          logDebug(() => `[${jshellTime}] JShell output\n${trimmedStdout}`);
        }
        const trimmedStderr = stderr?.trim();
        if (trimmedStderr) {
          appendConsoleOutput(trimmedStderr);
          logDebug(() => `[${jshellTime}] JShell error output\n${trimmedStderr}`);
        }
      };

      const createInstance = async (): Promise<ObjectInstance | null> => {
        const result = await jshellEval(code);
        logJshellOutput(result.stdout, result.stderr);
        if (!result.ok) {
          const message = `Failed to create ${form.objectName}: ${trimStatus(
            result.error || result.stderr || "Unknown error"
          )}`;
          appendConsoleOutput(message);
          setStatus("Object creation failed.");
          return null;
        }

        const inspect = await jshellInspect(form.objectName);
        if (!inspect.ok) {
          const message = `Failed to inspect ${form.objectName}: ${trimStatus(
            inspect.error || "Unknown error"
          )}`;
          appendConsoleOutput(message);
          if (inspect.error && inspect.error.includes("payload:")) {
            logDebug(
              () =>
                `[${new Date().toLocaleTimeString()}] JShell inspect payload\n${inspect.error}`
            );
          }
          setStatus("Object creation failed.");
          return null;
        }
        logDebug(
          () =>
            `[${new Date().toLocaleTimeString()}] JShell inspect ${form.objectName} inheritedGroups=${
              inspect.inheritedMethods?.length ?? 0
            }`
        );
        const inheritedMethods: ObjectInheritedMethodGroup[] = (inspect.inheritedMethods ?? [])
          .map((group) => ({
            className: group.className,
            methods: (group.methods ?? []).map((method): ObjectMethod => ({
              name: method.name,
              returnType: method.returnType ?? "",
              paramTypes: method.paramTypes ?? [],
              visibility: method.visibility,
              isStatic: method.isStatic,
              declaringClass: group.className
            }))
          }))
          .filter((group) => group.methods.length > 0);
        return {
          name: form.objectName,
          type: target.name || inspect.typeName || target.id,
          fields: (inspect.fields ?? []).map((field) => ({
            ...field,
            type: field.type ?? "",
            value: field.value ?? ""
          })),
          inheritedMethods
        };
      };

      const createAndRefresh = async () => {
        const entry = await createInstance();
        if (!entry) return false;
        const baseObjects = objectBenchRef.current.filter((item) => item.name !== entry.name);
        const refreshed = await refreshObjectBench([...baseObjects, entry]);
        setObjectBench(refreshed);
        appendConsoleOutput("Object created.");
        setStatus(`Created ${entry.name}.`);
        return true;
      };

      try {
        await createAndRefresh();
      } catch (error) {
        const message = formatStatus(error);
        logDebug(() => `[${new Date().toLocaleTimeString()}] JShell error\n${message}`);
        if (isBrokenPipe(message)) {
          setJshellReady(false);
          const outDir = lastCompileOutDirRef.current;
          if (projectPath && outDir) {
            try {
              await jshellStop();
              await jshellStart(projectPath, outDir);
              setJshellReady(true);
              const retryOk = await createAndRefresh();
              if (retryOk) return;
            } catch (restartError) {
              logDebug(
                () =>
                  `[${new Date().toLocaleTimeString()}] JShell restart failed\n${formatStatus(
                    restartError
                  )}`
              );
            }
          }
        }
        setStatus(`Failed to create object: ${trimStatus(message)}`);
      } finally {
        setBusy(false);
      }
    },
    [
      appendConsoleOutput,
      formatStatus,
      jshellReady,
      lastCompileOutDirRef,
      logDebug,
      projectPath,
      refreshObjectBench,
      resetConsoleOutput,
      setBusy,
      setJshellReady,
      setObjectBench,
      setStatus,
      trimStatus
    ]
  );

  const executeMethodCall = useCallback(
    async ({ target, method, paramValues, onReturn }: CallMethodArgs) => {
      if (!projectPath) {
        setStatus("Open a project before calling methods.");
        return;
      }
      if (!jshellReady) {
        setStatus("Compile the project before calling methods.");
        return;
      }

      const methodName =
        method.name ?? method.signature.split("(")[0].split(":")[0].trim();
      const params = method.params ?? [];
      const args = params.map((param, index) =>
        normalizeConstructorArg(paramValues[index] ?? "", param.type)
      );
      const ownerNode = resolveUmlNodeForObject(target);
      const className = ownerNode?.id || target.type;
      const usesDefaultPackage = !className.includes(".");
      const buildMethodSelector = () => {
        const selector = method.isInherited ? "getMethod" : "getDeclaredMethod";
        if (params.length === 0) {
          return `${selector}("${methodName}")`;
        }
        const typeArgs = params
          .map((param) => resolveConstructorParamClass(param.type))
          .join(", ");
        return `${selector}("${methodName}", ${typeArgs})`;
      };
      const callExpression = usesDefaultPackage
        ? `Class.forName("${className}").${buildMethodSelector()}.invoke(${method.isStatic ? "null" : target.name}${args.length ? `, ${args.join(", ")}` : ""});`
        : `${method.isStatic ? className : target.name}.${methodName}(${args.join(", ")});`;

      setBusy(true);
      const startedAt = new Date().toLocaleTimeString();
      resetConsoleOutput();
      appendConsoleOutput(`[${startedAt}] Call method requested for ${target.name}.${methodName}`);

      const handleOutput = (stdout?: string | null, stderr?: string | null) => {
        if (stdout?.trim()) {
          appendConsoleOutput(stdout.trim());
        }
        if (stderr?.trim()) {
          appendConsoleOutput(stderr.trim());
        }
      };

      const returnsVoid =
        !method.returnType ||
        method.returnType.trim() === "" ||
        method.returnType.trim() === "void";

      const invokeMethod = async () => {
        const result = await jshellEval(callExpression);
        handleOutput(result.stdout, result.stderr);
        if (!result.ok) {
          const message = trimStatus(
            result.error || result.stderr || "Unknown error"
          );
          appendConsoleOutput(`Method call failed: ${message}`);
          setStatus("Method call failed.");
          return false;
        }
        if (!returnsVoid) {
          const valueText =
            result.value === undefined || result.value === null
              ? "null"
              : String(result.value);
          if (valueText.trim() !== "") {
            appendConsoleOutput(`Return value: ${valueText}`);
          } else {
            appendConsoleOutput("Return value: (empty)");
          }
          if (onReturn) {
            onReturn(
              method.signature
                ? `${target.name}.${method.signature}`
                : `${target.name}.${methodName}`,
              valueText
            );
          }
        }
        const refreshed = await refreshObjectBench(objectBenchRef.current);
        setObjectBench(refreshed);
        appendConsoleOutput("Method call finished.");
        setStatus(`Called ${methodName}.`);
        return true;
      };

      try {
        await invokeMethod();
      } catch (error) {
        const message = formatStatus(error);
        logDebug(() => `[${new Date().toLocaleTimeString()}] JShell error\n${message}`);
        if (isBrokenPipe(message)) {
          setJshellReady(false);
          const outDir = lastCompileOutDirRef.current;
          if (projectPath && outDir) {
            try {
              await jshellStop();
              await jshellStart(projectPath, outDir);
              setJshellReady(true);
              const retryOk = await invokeMethod();
              if (retryOk) return;
            } catch (restartError) {
              logDebug(
                () =>
                  `[${new Date().toLocaleTimeString()}] JShell restart failed\n${formatStatus(
                    restartError
                  )}`
              );
            }
          }
        }
        setStatus(`Failed to call method: ${trimStatus(message)}`);
      } finally {
        setBusy(false);
      }
    },
    [
      appendConsoleOutput,
      formatStatus,
      jshellReady,
      lastCompileOutDirRef,
      logDebug,
      projectPath,
      refreshObjectBench,
      resetConsoleOutput,
      resolveUmlNodeForObject,
      setBusy,
      setJshellReady,
      setObjectBench,
      setStatus,
      trimStatus
    ]
  );

  return {
    getPublicMethodsForObject,
    handleCreateObject,
    executeMethodCall
  };
};
