import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { generateDownload } from "./scripts/generate-download.mjs";

/**
 * Dev and production need different addresses for the embedded app:
 *
 * - Production: `scripts/sync-app.mjs` copies `apps/web/dist` to `dist/app`, so
 *   the workspace is a same-origin subpath (`/app/`).
 * - Development: the app runs on its own Vite server. Proxying it under `/app/`
 *   does not work, because the app's dev HTML references absolute paths
 *   (`/src/main.tsx`, `/@vite/client`) that would be requested from this server
 *   instead. So in dev the iframe points straight at the app's dev server.
 *
 * The URL itself lives in `src/pages/Workspace.tsx` (`import.meta.env.DEV`),
 * override the dev address with `VITE_APP_URL`.
 */

/** 往 public/downloads/ 里丢新的 zip 时，自动刷新下载信息。 */
function downloadManifest() {
  const downloadsDir = resolve(process.cwd(), "public/downloads");
  return {
    name: "download-manifest",
    configureServer(server) {
      server.watcher.add(downloadsDir);
      const refresh = (file) => {
        if (!file.replace(/\\/g, "/").includes("/public/downloads/")) return;
        const data = generateDownload();
        console.log(data.available ? `[download] 已更新为 ${data.fileName}` : "[download] downloads 目录为空");
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", refresh);
      server.watcher.on("unlink", refresh);
    }
  };
}

export default defineConfig({
  base: "/",
  plugins: [react(), downloadManifest()],
  server: {
    port: 5174,
    // Never silently move to another port: the app's iframe assumes this one.
    strictPort: true
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
