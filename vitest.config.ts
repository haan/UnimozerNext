import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      {
        find: /^monaco-themes\/themes/,
        replacement: path.resolve(__dirname, "node_modules/monaco-themes/themes"),
      },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "src-tauri", "java-parser", "jshell-bridge"],
    coverage: {
      provider: "v8",
      include: ["src/services/**", "src/components/ui/**"],
      reporter: ["text", "lcov"],
    },
  },
});
