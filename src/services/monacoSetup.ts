import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/editor";
import "monaco-editor/features/register.all";
import "monaco-editor/languages/definitions/java/register";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";

// Use the installed editor and a bundled worker, including when offline.
// Java language services are provided by JDT LS.
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

loader.config({ monaco });
