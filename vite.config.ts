import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      {
        find: /^monaco-themes\/themes/,
        replacement: path.resolve(__dirname, "node_modules/monaco-themes/themes")
      }
    ]
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true
  }
});
