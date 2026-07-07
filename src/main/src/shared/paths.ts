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

// Earlier builds stored production data (auth meta + encrypted wallet DB) inside
// the app bundle at process.resourcesPath. That location is world-readable on
// shared machines (e.g. default Program Files ACLs) and writes into the
// code-signed bundle on macOS. Retained only so existing installs can migrate.
function getLegacyProdUserDataDir() {
  return path.join(process.resourcesPath, PROD_DATA_DIR_NAME);
}

let migrationChecked = false;

function migrateLegacyProdUserDataIfNeeded() {
  if (migrationChecked) return;
  migrationChecked = true;
  if (!app.isPackaged) return;

  const target = getProdUserDataDir();
  const legacy = getLegacyProdUserDataDir();

  try {
    if (fs.existsSync(target) || !fs.existsSync(legacy)) return;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(legacy, target, { recursive: true });
    // Best-effort removal of the copy left in the insecure location. The bundle
    // may be read-only, in which case future writes still go to the safe path.
    try {
      fs.rmSync(legacy, { recursive: true, force: true });
    } catch {
      // Ignore: data is already safely in the user data directory.
    }
  } catch (error) {
    migrationChecked = false; // Allow a retry on the next access.
    throw new Error(
      `Failed to migrate BitTracker data to the user data directory: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export function getUserDataDir() {
  if (app.isPackaged) {
    migrateLegacyProdUserDataIfNeeded();
    return getProdUserDataDir();
  }
  return getDevUserDataDir();
}

export function getUserDataDirsForReset() {
  return [getDevUserDataDir(), getProdUserDataDir(), getLegacyProdUserDataDir()];
}

export function wipeUserDataDir(dir: string) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}
