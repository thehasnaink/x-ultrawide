import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// The popup is built into ui/out, which scripts/build.mjs copies into the extension as popup/index.html
// is what manifest.json points at. Paths are relative so the files work from the
// chrome-extension:// origin.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    outDir: "out",
    emptyOutDir: true,
    sourcemap: false,
    target: "chrome111",
  },
})
