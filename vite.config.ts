import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "src/webview"),
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "dist/webview"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
          "codemirror-core": [
            "@uiw/react-codemirror",
            "@codemirror/search",
            "@uiw/codemirror-theme-vscode",
          ],
          "codemirror-lang": ["@codemirror/lang-markdown"],
          markdown: [
            "react-markdown",
            "remark-gfm",
            "rehype-highlight",
            "rehype-sanitize",
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
