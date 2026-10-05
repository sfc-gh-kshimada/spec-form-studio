import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    // next build copies traced sources, including __tests__, into the standalone
    // directory. Those copies have no scripts/ next to them, so running them
    // fails on imports that resolve fine in the repository.
    exclude: ["node_modules/**", ".next/**", ".next-qa/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
})
