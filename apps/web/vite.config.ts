import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    watch: {
      // Editor atomic-write temp dirs and Electron build output can be locked
      // on Windows; watching them can crash Vite with EBUSY.
      ignored: ["**/.*.tmpdir/**", "**/release/**", "**/dist/**"]
    }
  }
});
