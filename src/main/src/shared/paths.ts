import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

const DEV_USER_DATA_DIR = "bittrack-dev";
const PROD_DATA_DIR_NAME = "bittrack-data";

export function getDevUserDataDir() {
  return path.join(app.getPath("appData"), DEV_USER_DATA_DIR);
}

export function getProdUserDataDir() {
  return path.join(app.getPath("userData"), PROD_DATA_DIR_NAME);
}

export function getUserDataDir() {
  return app.isPackaged ? getProdUserDataDir() : getDevUserDataDir();
}

export function getUserDataDirsForReset() {
  return [getDevUserDataDir(), getProdUserDataDir()];
}

export function wipeUserDataDir(dir: string) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}
