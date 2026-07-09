import { vitePlugin as remix } from "@remix-run/dev";
import path from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { readBuildInfo } from "./scripts/build-info.mjs";

function skipAppDepOptimization(): Plugin {
  return {
    name: "bittrack-skip-app-dep-optimization",
    enforce: "pre",
    async resolveId(source, importer, options) {
      const normalized = source.replace(/^\.\//, "");
      if (!normalized.startsWith("src/renderer/") || !/\.(tsx?|jsx?)$/.test(normalized)) {
        return;
      }
      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      if (!resolved?.id || resolved.id.includes("__vite_skip_optimization")) {
        return resolved;
      }
      return `${resolved.id.split("?")[0]}?__vite_skip_optimization`;
    },
  };
}

export default defineConfig(({ command }) => {
  const buildInfo = readBuildInfo();
  const isProd = command === "build";

  return {
    base: isProd ? "./" : "/",
    esbuild: {
      drop: isProd ? ["console"] : [],
    },
    define: {
      "import.meta.env.VITE_BUILD_INFO": JSON.stringify(buildInfo),
    },
    plugins: [
      skipAppDepOptimization(),
      remix({
        appDirectory: "src/renderer",
        ssr: false,
        future: {
          v3_fetcherPersist: true,
          v3_relativeSplatPath: true,
          v3_throwAbortReason: true,
        },
      }),
      tsconfigPaths(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src/renderer"),
      },
    },
    optimizeDeps: {
      include: ["recharts"],
      exclude: [
        "./src/renderer/entry.client.tsx",
        "./src/renderer/root.tsx",
        "src/renderer/entry.client.tsx",
        "src/renderer/root.tsx",
      ],
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      watch: {
        ignored: ["**/release/**"],
      },
    },
  };
});
