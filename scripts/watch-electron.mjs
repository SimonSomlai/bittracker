import * as esbuild from "esbuild";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { electronExternals } from "./electron-externals.mjs";

const require = createRequire(import.meta.url);
const electronBinary = require("electron");

function copyDataFiles() {
  const dataDir = "src/main/data";
  const outDataDir = path.join("dist-electron", "data");
  if (!fs.existsSync(dataDir)) return;
  fs.rmSync(outDataDir, { recursive: true, force: true });
  fs.mkdirSync(outDataDir, { recursive: true });
  for (const file of fs.readdirSync(dataDir)) {
    fs.copyFileSync(path.join(dataDir, file), path.join(outDataDir, file));
  }
}

function removeStaleOutputs() {
  for (const stale of ["main.js", "main.js.map", "preload.js", "preload.js.map"]) {
    const filePath = path.join("dist-electron", stale);
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath);
    }
  }
}

/** @type {import("node:child_process").ChildProcess | null} */
let electronProcess = null;
let electronStarted = false;

function startElectron() {
  if (electronProcess) {
    electronProcess.removeAllListeners();
    electronProcess.kill();
    electronProcess = null;
  }

  const env = {
    ...process.env,
    ELECTRON_RENDERER_URL: "http://127.0.0.1:5173",
  };
  delete env.ELECTRON_RUN_AS_NODE;

  electronProcess = spawn(electronBinary, ["."], {
    stdio: "inherit",
    env,
  });

  electronProcess.on("exit", () => {
    electronProcess = null;
  });
}

function onElectronBuildComplete() {
  copyDataFiles();
  removeStaleOutputs();

  if (!electronStarted) {
    electronStarted = true;
    console.log("Built electron main + preload");
    startElectron();
    return;
  }

  console.log("Rebuilt electron main + preload, restarting…");
  startElectron();
}

const mainRoot = "src/main";

const ctx = await esbuild.context({
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
  logLevel: "silent",
  plugins: [
    {
      name: "electron-dev",
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length === 0) {
            onElectronBuildComplete();
          }
        });
      },
    },
  ],
});

await ctx.watch();

process.on("SIGINT", () => {
  electronProcess?.kill();
  process.exit(0);
});

process.on("SIGTERM", () => {
  electronProcess?.kill();
  process.exit(0);
});
