import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { electronExternals } from "./electron-externals.mjs";

const mainRoot = "src/main";

await esbuild.build({
  entryPoints: [
    `${mainRoot}/main.ts`,
    `${mainRoot}/preload.ts`,
    `${mainRoot}/src/wallets/trezor-worker.ts`,
  ],
  outbase: mainRoot,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outdir: "dist-electron",
  outExtension: { ".js": ".cjs" },
  external: electronExternals,
  sourcemap: true,
  drop: ["console"],
});

for (const stale of ["main.js", "main.js.map", "preload.js", "preload.js.map"]) {
  const filePath = path.join("dist-electron", stale);
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath);
  }
}

for (const staleDir of ["services", "src/main", path.join("src", "wallets", "workers")]) {
  const dirPath = path.join("dist-electron", staleDir);
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

const dataDir = path.join(mainRoot, "data");
const outDataDir = path.join("dist-electron", "data");
if (fs.existsSync(dataDir)) {
  fs.rmSync(outDataDir, { recursive: true, force: true });
  fs.mkdirSync(outDataDir, { recursive: true });
  for (const file of fs.readdirSync(dataDir)) {
    fs.copyFileSync(path.join(dataDir, file), path.join(outDataDir, file));
  }
}

console.log("Built electron main + preload");
